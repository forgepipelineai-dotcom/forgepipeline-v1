const { chromium } = require('playwright');
const fs = require('fs');
const { execSync } = require('child_process');

const CSS_AND_CONTENT = fs.readFileSync('/Users/trevoradmin/.openclaw/workspace/projects/ghl-pages/solutions.html', 'utf8');

// Extract just the body content and CSS from our HTML
const bodyMatch = CSS_AND_CONTENT.match(/<body[^>]*>([\s\S]*)<\/body>/);
const styleMatch = CSS_AND_CONTENT.match(/<style>([\s\S]*?)<\/style>/);
const BODY_HTML = bodyMatch ? bodyMatch[1] : CSS_AND_CONTENT;
const STYLE_CSS = styleMatch ? styleMatch[1] : '';

// Create a script that replaces GHL's empty preview container with our content
const INJECT_SCRIPT = `
<style>${STYLE_CSS}</style>
<script>
(function() {
  function injectContent() {
    var container = document.getElementById('preview-container');
    if (container) {
      container.innerHTML = ${JSON.stringify(BODY_HTML)};
      container.style.cssText = '';
    }
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectContent);
  } else {
    injectContent();
  }
})();
<\/script>
`;
console.log('Inject script size:', INJECT_SCRIPT.length);

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

  // Escape any open dialogs
  await outerPage.keyboard.press('Escape');
  await outerPage.waitForTimeout(500);

  // Open the Tracking Code panel via button at x=104 (</> button)
  await frame.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find(b => {
      const r = b.getBoundingClientRect();
      return r.x > 100 && r.x < 120 && r.y > 50 && r.y < 90;
    });
    if (btn) btn.click();
  });
  await outerPage.waitForTimeout(2000);

  // Check what opened
  const state = await frame.evaluate(() => ({
    hasCodeMirror: !!document.querySelector('.CodeMirror'),
    cmContent: document.querySelector('.CodeMirror')?.CodeMirror?.getValue()?.slice(0, 100)
  }));
  console.log('Tracking panel state:', state);

  if (state.hasCodeMirror) {
    // Click "Header Tracking" tab to ensure we're on the right tab
    await frame.evaluate(() => {
      const tabs = [...document.querySelectorAll('[class*="tab"], button')];
      const headerTab = tabs.find(t => t.textContent.trim() === 'Header Tracking');
      if (headerTab) headerTab.click();
    });
    await outerPage.waitForTimeout(500);

    // Inject our script into the Header Tracking CodeMirror
    const injected = await frame.evaluate(({script}) => {
      const cms = document.querySelectorAll('.CodeMirror');
      if (cms.length === 0) return 'no CM';
      // Use first CodeMirror (Header Tracking)
      const cm = cms[0].CodeMirror;
      cm.setValue(script);
      return 'injected len=' + cm.getValue().length;
    }, { script: INJECT_SCRIPT });
    console.log('Injected:', injected);

    await outerPage.waitForTimeout(500);

    // Click Save button in tracking code dialog
    const saved = await frame.evaluate(() => {
      const btns = [...document.querySelectorAll('button')];
      // Find Save (not Cancel, not Publish)
      const saveBtn = btns.find(b => {
        const r = b.getBoundingClientRect();
        return b.textContent.trim() === 'Save' && r.offsetHeight > 0 && r.y > 200;
      });
      if (saveBtn) { saveBtn.click(); return 'saved at y=' + saveBtn.getBoundingClientRect().y; }
      // Try any Save button
      const anyS = btns.find(b => /^save$/i.test(b.textContent.trim()));
      if (anyS) { anyS.click(); return 'any save clicked'; }
      return 'no save btn';
    });
    console.log('Save result:', saved);
    await outerPage.waitForTimeout(2000);

    // Publish
    await frame.evaluate(() => {
      [...document.querySelectorAll('button')].find(b => b.textContent.includes('Publish'))?.click();
    });
    console.log('Publishing...');
    await outerPage.waitForTimeout(15000);

    // Check if our content appeared
    const response = execSync('curl -sL --max-time 15 "https://forgepipelineai.com/solutions" 2>/dev/null').toString();
    const size = response.length;
    const hasTrades = response.includes('trade-grid') || response.includes('id="trades"') || response.includes('FF6B1F');
    console.log(`Live: ${size}B | has our content: ${hasTrades}`);
    if (hasTrades) {
      console.log('✅ Solutions page content live!');
    } else {
      console.log('CDN may be caching — will try again in 30s');
    }
  } else {
    console.log('Tracking panel did not open');
  }

  await browser.close();
}
main().catch(e => { console.error(e.message); process.exit(1); });
