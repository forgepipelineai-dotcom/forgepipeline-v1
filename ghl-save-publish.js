const { chromium } = require('playwright');
const fs = require('fs');
const { execSync } = require('child_process');

const HTML = fs.readFileSync('/Users/trevoradmin/.openclaw/workspace/projects/ghl-pages/solutions.html', 'utf8');
const CDP_URL = 'http://127.0.0.1:18800';
const BUILDER_PATH = '/location/UGYrGVYl23V0VDIwrWe9/page-builder/WFyMdO2yfShaRGUAuKde';

const styleMatch = HTML.match(/<style>([\s\S]*?)<\/style>/);
const bodyMatch = HTML.match(/<body[^>]*>([\s\S]*)<\/body>/);
const CSS = styleMatch ? styleMatch[1] : '';
const BODY = bodyMatch ? bodyMatch[1] : HTML;
const FOOTER_CODE = `<style>${CSS}#fp-solutions-page{display:block!important}.hl_page-preview--content>div{display:none!important}</style><div id="fp-solutions-page">${BODY}</div>`;

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

  // Escape
  await outerPage.keyboard.press('Escape');
  await outerPage.waitForTimeout(500);

  // Step 1: Open Tracking Code (button at x=104)
  await frame.evaluate(() => {
    [...document.querySelectorAll('button')].find(b => {
      const r = b.getBoundingClientRect();
      return r.x > 100 && r.x < 120 && r.y > 50 && r.y < 90;
    })?.click();
  });
  await outerPage.waitForTimeout(2000);

  // Step 2: Click Footer Tracking tab
  const tabClicked = await frame.evaluate(() => {
    const allText = [...document.querySelectorAll('*')].find(el => el.textContent.trim() === 'Footer Tracking' && el.offsetHeight > 0);
    if (allText) { allText.click(); return 'Footer Tracking tab clicked'; }
    return 'not found';
  });
  console.log('Tab:', tabClicked);
  await outerPage.waitForTimeout(500);

  // Step 3: Inject into the visible CodeMirror
  const injected = await frame.evaluate(({code}) => {
    const cms = [...document.querySelectorAll('.CodeMirror')].filter(cm => cm.offsetHeight > 0);
    if (!cms.length) return 'no visible CM';
    const cm = cms[cms.length - 1].CodeMirror;
    if (!cm) return 'no CM instance';
    cm.setValue(code);
    return `injected ${cm.getValue().length} chars`;
  }, { code: FOOTER_CODE });
  console.log('Injected:', injected);
  await outerPage.waitForTimeout(300);

  // Step 4: Save tracking code dialog
  await frame.evaluate(() => {
    [...document.querySelectorAll('button')].find(b => /^save$/i.test(b.textContent.trim()))?.click();
  });
  console.log('Dialog saved');
  await outerPage.waitForTimeout(2000);

  // Step 5: Click the PAGE-LEVEL save button (diskette icon at x=765, y=8 in iframe)
  const pageSaved = await frame.evaluate(() => {
    // The second button in the top-right area is the save button
    const btns = [...document.querySelectorAll('button')].filter(b => {
      const r = b.getBoundingClientRect();
      return r.y > 0 && r.y < 50 && r.x > 700 && r.x < 800;
    });
    console.log('Top-right btns:', btns.map(b => ({ x: b.getBoundingClientRect().x, text: b.textContent.trim().slice(0,20) })));
    const saveBtn = btns.find(b => !b.textContent.trim());  // Icon buttons have no text
    if (saveBtn) { saveBtn.click(); return 'page save clicked'; }
    if (btns.length > 0) { btns[0].click(); return 'first top-right btn clicked'; }
    return 'no save btn';
  });
  console.log('Page save:', pageSaved);
  await outerPage.waitForTimeout(3000);

  // Step 6: Publish
  await frame.evaluate(() => {
    [...document.querySelectorAll('button')].find(b => b.textContent.includes('Publish'))?.click();
  });
  console.log('Publishing...');
  await outerPage.waitForTimeout(15000);

  const raw = execSync('curl -sL --max-time 20 "https://forgepipelineai.com/solutions" 2>/dev/null').toString();
  const hasFp = raw.includes('fp-solutions-page') || raw.includes('trade-grid');
  console.log(`Live: ${raw.length}B | our content: ${hasFp}`);
  if (hasFp) console.log('✅ LIVE with content!');
  else console.log('❌ Content not in live page');

  await browser.close();
}
main().catch(e => { console.error(e.message); process.exit(1); });
