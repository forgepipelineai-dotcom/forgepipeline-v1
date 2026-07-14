const { chromium } = require('playwright');
const fs = require('fs');
const { execSync } = require('child_process');

const HTML = fs.readFileSync('/Users/trevoradmin/.openclaw/workspace/projects/ghl-pages/solutions.html', 'utf8');
const CDP_URL = 'http://127.0.0.1:18800';
const BUILDER_PATH = '/location/UGYrGVYl23V0VDIwrWe9/page-builder/WFyMdO2yfShaRGUAuKde';

// Extract CSS and body
const styleMatch = HTML.match(/<style>([\s\S]*?)<\/style>/);
const bodyMatch = HTML.match(/<body[^>]*>([\s\S]*)<\/body>/);
const CSS = styleMatch ? styleMatch[1] : '';
const BODY = bodyMatch ? bodyMatch[1] : HTML;

// Footer tracking code: hide GHL shell, show our content
const FOOTER_CODE = `<style>
#preview-container > div:first-child { display: none !important; }
.hl_page-preview--content > div { display: none !important; }
${CSS}
#fp-solutions-page { display: block !important; }
</style>
<div id="fp-solutions-page">${BODY}</div>`;

console.log(`Footer code: ${FOOTER_CODE.length} bytes`);

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
  await outerPage.keyboard.press('Escape');
  await outerPage.waitForTimeout(500);

  // Open Tracking Code panel
  await frame.evaluate(() => {
    [...document.querySelectorAll('button')].find(b => {
      const r = b.getBoundingClientRect();
      return r.x > 100 && r.x < 120 && r.y > 50 && r.y < 90;
    })?.click();
  });
  await outerPage.waitForTimeout(2000);

  // Click "Footer Tracking" tab
  await frame.evaluate(() => {
    const tabs = [...document.querySelectorAll('[role="tab"], button, [class*="tab"]')];
    const footerTab = tabs.find(t => t.textContent.trim().includes('Footer'));
    if (footerTab) footerTab.click();
    else {
      // Try second CM (footer tracking)
      const cms = document.querySelectorAll('.CodeMirror');
      if (cms.length > 1) cms[1].CodeMirror?.focus();
    }
  });
  await outerPage.waitForTimeout(800);

  // Inject into the FOOTER CodeMirror (second one)
  const result = await frame.evaluate(({code}) => {
    const cms = [...document.querySelectorAll('.CodeMirror')];
    if (cms.length === 0) return 'no CM';
    // Use the last visible CodeMirror
    const cm = cms[cms.length - 1].CodeMirror;
    if (!cm) return 'no CM instance';
    cm.setValue(code);
    return `injected ${cm.getValue().length} chars into CM[${cms.length-1}]`;
  }, { code: FOOTER_CODE });
  console.log('Inject result:', result);

  await outerPage.waitForTimeout(500);

  // Save
  const saved = await frame.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find(b => /^save$/i.test(b.textContent.trim()));
    if (btn) { btn.click(); return 'clicked save'; }
    return 'no save btn';
  });
  console.log('Save:', saved);
  await outerPage.waitForTimeout(2000);

  // Publish
  await frame.evaluate(() => {
    [...document.querySelectorAll('button')].find(b => b.textContent.includes('Publish'))?.click();
  });
  console.log('Published');
  await outerPage.waitForTimeout(15000);

  const raw = execSync('curl -sL --max-time 15 "https://forgepipelineai.com/solutions" 2>/dev/null').toString();
  const size = raw.length;
  const hasTrades = raw.includes('trade-grid') || raw.includes('id="trades"') || raw.includes('#FF6B1F') || raw.includes('fp-solutions-page');
  console.log(`Live: ${size}B | our content: ${hasTrades}`);
  if (hasTrades) console.log('✅ Solutions content live!');

  await browser.close();
}
main().catch(e => { console.error(e.message); process.exit(1); });
