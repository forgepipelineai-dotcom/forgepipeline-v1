const { chromium } = require('playwright');
const { execSync } = require('child_process');

const CDP_URL = 'http://127.0.0.1:18800';
const BUILDER_PATH = '/location/UGYrGVYl23V0VDIwrWe9/page-builder/WFyMdO2yfShaRGUAuKde';

async function main() {
  const browser = await chromium.connectOverCDP(CDP_URL);
  const contexts = browser.contexts();
  let outerPage = null;
  for (const ctx of contexts) {
    for (const p of ctx.pages()) {
      if (p.url().includes(BUILDER_PATH)) { outerPage = p; break; }
    }
    if (outerPage) break;
  }
  if (!outerPage) process.exit(1);

  // Capture ALL POST/PUT/PATCH requests with full body
  const captured = [];
  await outerPage.route('**', async route => {
    const req = route.request();
    if (['POST','PUT','PATCH'].includes(req.method())) {
      const url = req.url();
      const body = req.postData() || '';
      if (url.includes('leadconnector') || url.includes('gohighlevel')) {
        captured.push({ method: req.method(), url: url.slice(0,120), bodyLen: body.length, bodySnippet: body.slice(0,500) });
      }
    }
    await route.continue();
  });

  const iframeHandle = await outerPage.$('iframe[src*="page-builder.leadconnectorhq.com"]');
  const frame = await iframeHandle.contentFrame();
  await outerPage.waitForTimeout(2000);

  // Try: click the + in the canvas center, which opens an add-element dialog
  const plusResult = await frame.evaluate(() => {
    // Find the + button in the canvas
    const plus = [...document.querySelectorAll('button, [class*="add-section"], [class*="plus"]')].find(el => {
      const text = el.textContent?.trim();
      const classes = el.className;
      return (text === '+' || classes.includes('add') || classes.includes('plus')) && el.getBoundingClientRect().height > 0;
    });
    if (plus) { plus.click(); return { found: true, class: plus.className.slice(0,50) }; }
    // Try clicking in the center of the canvas area
    const canvas = document.querySelector('[class*="canvas-container"], [class*="builder-body"]');
    if (canvas) {
      const r = canvas.getBoundingClientRect();
      return { found: false, canvasCenter: { x: r.x + r.width/2, y: r.y + r.height/2 } };
    }
    return { found: false };
  });
  console.log('Plus result:', plusResult);

  // Click at canvas center
  if (!plusResult.found && plusResult.canvasCenter) {
    await frame.mouse.click(plusResult.canvasCenter.x, plusResult.canvasCenter.y);
    await outerPage.waitForTimeout(1500);
  }

  // Take screenshot to see current state
  await outerPage.screenshot({ path: '/tmp/ghl-plus-click.png' });
  execSync('cp /tmp/ghl-plus-click.png /Users/trevoradmin/.openclaw/workspace/ghl-plus.png');

  // Show all buttons now visible
  const buttonsNow = await frame.evaluate(() => {
    return [...document.querySelectorAll('button')].filter(b => b.offsetHeight > 0).map(b => ({
      text: b.textContent.trim().slice(0,30),
      class: b.className.slice(0,40),
      x: b.getBoundingClientRect().x,
      y: b.getBoundingClientRect().y
    })).slice(0,20);
  });
  console.log('Visible buttons after click:', JSON.stringify(buttonsNow.slice(0,10)));

  await outerPage.waitForTimeout(3000);
  console.log('\nCaptured requests:', captured.length);
  captured.forEach(r => console.log(`  ${r.method} ${r.url} (${r.bodyLen}B)`));

  await browser.unrouteAll();
  await browser.close();
}
main().catch(e => { console.error(e.message); process.exit(1); });
