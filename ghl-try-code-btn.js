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

  const frame = await (await outerPage.$('iframe[src*="page-builder.leadconnectorhq.com"]')).contentFrame();
  await outerPage.waitForTimeout(1000);

  // Click each toolbar button and screenshot to identify the code button
  for (let idx = 4; idx <= 14; idx++) {
    const btn = await frame.$(`button:nth-of-type(${idx+1})`);
    if (!btn) continue;
    const box = await btn.boundingBox();
    if (!box || box.y > 100) continue;
    
    await btn.evaluate(el => el.click());
    await outerPage.waitForTimeout(800);
    
    // Check if any code-related panel opened
    const codePanel = await frame.evaluate(() => {
      const keywords = ['code', 'html', 'javascript', 'script', 'head', 'body'];
      const panels = [...document.querySelectorAll('[class*="panel"], [class*="sidebar"], [class*="drawer"], [class*="modal"], [role="dialog"]')];
      for (const panel of panels) {
        if (panel.offsetHeight > 50) {
          const text = panel.textContent.toLowerCase();
          if (keywords.some(k => text.includes(k))) {
            return { found: true, text: panel.textContent.trim().slice(0,100), class: panel.className.slice(0,50) };
          }
        }
      }
      // Check for textareas (code editors)
      const ta = document.querySelector('textarea');
      if (ta && ta.offsetHeight > 20) return { found: true, type: 'textarea', h: ta.offsetHeight };
      const cm = document.querySelector('.CodeMirror, [class*="monaco"]');
      if (cm && cm.offsetHeight > 20) return { found: true, type: 'codemirror/monaco' };
      return { found: false };
    });
    
    if (codePanel.found) {
      console.log(`✅ Button ${idx} (x=${box.x}) opened code panel:`, codePanel);
      // This is our code button! Now inject HTML
      const injected = await frame.evaluate((htmlContent) => {
        const ta = document.querySelector('textarea');
        if (ta) {
          Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(ta, htmlContent);
          ta.dispatchEvent(new Event('input', { bubbles: true }));
          return 'textarea: ' + ta.offsetHeight;
        }
        const cm = document.querySelector('.CodeMirror');
        if (cm?.CodeMirror) { cm.CodeMirror.setValue(htmlContent); return 'CodeMirror'; }
        return 'no editor';
      }, HTML);
      console.log('Injection:', injected);

      await outerPage.waitForTimeout(500);
      // Save
      await frame.evaluate(() => {
        [...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Save')?.click();
      });
      await outerPage.waitForTimeout(1000);

      // Publish
      await frame.evaluate(() => {
        [...document.querySelectorAll('button')].find(b => b.textContent.includes('Publish'))?.click();
      });
      await outerPage.waitForTimeout(10000);

      const size = parseInt(execSync('curl -sL --max-time 15 "https://forgepipelineai.com/solutions" 2>/dev/null | wc -c').toString().trim());
      console.log(`Live: ${size}B`);
      console.log(size !== 85618 && size > 20000 ? '✅ DEPLOYED' : '❌ catch-all');
      break;
    }
    
    // Close any opened panel with Escape
    await outerPage.keyboard.press('Escape');
    await outerPage.waitForTimeout(300);
  }

  // Screenshot final state
  await outerPage.screenshot({ path: '/tmp/ghl-final.png' });
  execSync('cp /tmp/ghl-final.png /Users/trevoradmin/.openclaw/workspace/ghl-final.png');
  await browser.close();
}
main().catch(e => { console.error(e.message); process.exit(1); });
