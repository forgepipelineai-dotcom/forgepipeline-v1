const { chromium } = require('playwright');
const fs = require('fs');
const { execSync } = require('child_process');

const HTML = fs.readFileSync('/Users/trevoradmin/.openclaw/workspace/projects/ghl-pages/solutions.html', 'utf8');
const CDP_URL = 'http://127.0.0.1:18800';
const BUILDER_PATH = '/location/UGYrGVYl23V0VDIwrWe9/page-builder/WFyMdO2yfShaRGUAuKde';

async function main() {
  const browser = await chromium.connectOverCDP(CDP_URL);
  let outerPage = null;
  for (const ctx of browser.contexts()) {
    for (const p of ctx.pages()) {
      if (p.url().includes(BUILDER_PATH)) { outerPage = p; break; }
    }
    if (outerPage) break;
  }
  if (!outerPage) process.exit(1);

  const iframeEl = await outerPage.$('iframe[src*="page-builder.leadconnectorhq.com"]');
  const frame = await iframeEl.contentFrame();
  await outerPage.waitForTimeout(1000);

  // Escape open dialogs
  await outerPage.keyboard.press('Escape');
  await outerPage.waitForTimeout(500);

  // Explore Vue/app internals in the frame
  const appState = await frame.evaluate(() => {
    // Try Vue 3 app
    const app = document.querySelector('#app, #__nuxt') || document.body;
    const vueApp = app?.__vue_app__;
    if (vueApp) {
      const store = vueApp.config?.globalProperties?.$store || vueApp.config?.globalProperties?.$pinia;
      return { found: 'vue3', storeKeys: store ? Object.keys(store).slice(0,10) : [] };
    }
    
    // Look for pinia or vuex stores
    const pinia = window.__pinia || window.pinia;
    if (pinia) {
      return { found: 'pinia', storeIds: [...(pinia._s?.keys() || [])] };
    }

    // Try to find event bus or builder API
    const builderKeys = Object.keys(window).filter(k => 
      k.includes('builder') || k.includes('page') || k.includes('funnel') || k.includes('element')
    );
    
    return { found: 'none', windowKeys: builderKeys.slice(0, 15) };
  });
  console.log('App state:', JSON.stringify(appState));

  // Try to find and call the "add element" function 
  const addResult = await frame.evaluate(({htmlContent}) => {
    // Explore the Vue app
    const nuxt = document.querySelector('#__nuxt');
    const vApp = nuxt?.__vue_app__;
    if (!vApp) return 'no vue app';

    // Try to find page store
    const pinia = vApp.config?.globalProperties?.$pinia;
    if (!pinia) return 'no pinia';
    
    const stores = [...(pinia._s?.entries() || [])];
    const storeNames = stores.map(([k]) => k);
    
    // Find element/page store
    const pageStore = stores.find(([k]) => k.includes('page') || k.includes('element') || k.includes('section'));
    if (pageStore) {
      const [name, store] = pageStore;
      const actions = Object.keys(store).filter(k => typeof store[k] === 'function');
      // Try to call addElement or similar
      const addFn = actions.find(a => a.includes('add') || a.includes('create') || a.includes('insert'));
      return { storeName: name, actions: actions.slice(0,15), addFn };
    }
    
    return { storeNames: storeNames.slice(0, 15) };
  }, { htmlContent: HTML });
  console.log('Add result:', JSON.stringify(addResult));

  // Try direct click on the canvas + button
  const plusClick = await frame.evaluate(() => {
    // Find the + button in the empty canvas
    const btns = [...document.querySelectorAll('button, [class*="add-section"], [class*="add-row"]')];
    const plusBtn = btns.find(b => {
      const text = b.textContent.trim();
      const r = b.getBoundingClientRect();
      return (text === '+' || text === '') && r.y > 100 && r.width < 50 && r.height < 50 && r.width > 10;
    });
    if (plusBtn) {
      const r = plusBtn.getBoundingClientRect();
      plusBtn.click();
      return { clicked: true, x: r.x, y: r.y, class: plusBtn.className.slice(0, 50) };
    }
    
    // Try svg path for plus icon
    const svgs = [...document.querySelectorAll('svg')].filter(svg => {
      const r = svg.getBoundingClientRect();
      return r.y > 200 && r.y < 600 && r.width < 30 && r.height < 30;
    });
    return { clicked: false, svgCount: svgs.length };
  });
  console.log('Plus click:', plusClick);
  await outerPage.waitForTimeout(2000);

  await outerPage.screenshot({ path: '/tmp/ghl-canvas-plus.png' });
  execSync('cp /tmp/ghl-canvas-plus.png /Users/trevoradmin/.openclaw/workspace/ghl-canvas-plus.png');

  // Check what appeared
  const after = await frame.evaluate(() => ({
    newButtons: [...document.querySelectorAll('button')].filter(b => b.offsetHeight > 0).length,
    newPanels: [...document.querySelectorAll('[class*="n-drawer"], [class*="dialog"]')].filter(e => e.offsetHeight > 0).length
  }));
  console.log('After canvas click:', after);

  await browser.close();
}
main().catch(e => { console.error(e.message); process.exit(1); });
