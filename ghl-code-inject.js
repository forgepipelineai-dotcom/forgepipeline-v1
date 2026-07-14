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
  if (!outerPage) {
    const ctx = browser.contexts()[0];
    outerPage = await ctx.newPage();
    await outerPage.goto(`https://app.gohighlevel.com${BUILDER_PATH}?source=website`);
    await outerPage.waitForTimeout(10000);
  }

  const iframeEl = await outerPage.$('iframe[src*="page-builder.leadconnectorhq.com"]');
  const frame = await iframeEl.contentFrame();
  await outerPage.waitForTimeout(2000);

  // Press Escape to close panels
  await outerPage.keyboard.press('Escape');
  await outerPage.waitForTimeout(500);

  // Click the button at x=104,y=72 (the </> code button)
  await frame.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find(b => {
      const r = b.getBoundingClientRect();
      return r.x > 100 && r.x < 120 && r.y > 50 && r.y < 90;
    });
    if (btn) btn.click();
  });
  await outerPage.waitForTimeout(2000);

  await outerPage.screenshot({ path: '/tmp/ghl-code-click.png' });
  execSync('cp /tmp/ghl-code-click.png /Users/trevoradmin/.openclaw/workspace/ghl-code-click.png');

  // Check what opened
  const state = await frame.evaluate(() => ({
    textareas: [...document.querySelectorAll('textarea')].filter(t => t.offsetHeight > 0).length,
    hasCodeMirror: !!document.querySelector('.CodeMirror'),
    openPanels: [...document.querySelectorAll('[class*="n-drawer"], [class*="n-modal"]')]
      .filter(el => el.offsetHeight > 0)
      .map(el => el.textContent.trim().slice(0, 80))
  }));
  console.log('State:', JSON.stringify(state));

  // If a code editor appeared, inject
  if (state.hasCodeMirror || state.textareas > 0) {
    const injected = await frame.evaluate(({html}) => {
      const cm = document.querySelector('.CodeMirror');
      if (cm?.CodeMirror) { cm.CodeMirror.setValue(html); return 'CodeMirror'; }
      const ta = [...document.querySelectorAll('textarea')].find(t => t.offsetHeight > 0);
      if (ta) {
        Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(ta, html);
        ta.dispatchEvent(new Event('input', { bubbles: true }));
        return 'textarea h=' + ta.offsetHeight;
      }
      return 'none';
    }, { html: HTML });
    console.log('Injected:', injected);

    if (!injected.includes('none')) {
      await outerPage.waitForTimeout(500);
      await frame.evaluate(() => {
        [...document.querySelectorAll('button')].find(b => /^save$/i.test(b.textContent.trim()))?.click();
      });
      await outerPage.waitForTimeout(2000);
      await frame.evaluate(() => {
        [...document.querySelectorAll('button')].find(b => b.textContent.includes('Publish'))?.click();
      });
      await outerPage.waitForTimeout(10000);
      const sz = parseInt(execSync('curl -sL --max-time 15 "https://forgepipelineai.com/solutions" 2>/dev/null | wc -c').toString().trim());
      console.log('Live:', sz, 'B | catch-all=85618');
    }
  }

  await browser.close();
}
main().catch(e => { console.error(e.message); process.exit(1); });
