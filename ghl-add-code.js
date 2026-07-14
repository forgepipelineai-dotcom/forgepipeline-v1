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
  
  // Escape any open panels
  await outerPage.keyboard.press('Escape');
  await outerPage.waitForTimeout(500);

  // Open Quick Add
  await frame.evaluate(() => {
    document.getElementById('hl-menu-item-quickAdd')?.click();
  });
  await outerPage.waitForTimeout(1500);

  // Search for Code
  await frame.evaluate(() => {
    const input = [...document.querySelectorAll('input')].find(i =>
      i.placeholder?.toLowerCase().includes('search')
    );
    if (input) {
      input.value = 'Code';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));
    }
  });
  await outerPage.waitForTimeout(1200);

  // Get tile & canvas info
  const info = await frame.evaluate(() => {
    const codeTiles = [...document.querySelectorAll('*')].filter(el => {
      const text = el.textContent?.trim();
      const r = el.getBoundingClientRect();
      return text === 'Code' && r.width > 40 && r.height > 20 && r.y > 100;
    }).map(el => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; });
    
    const canvas = document.querySelector('.previewer, [class*="preview-container"], [class*="page-preview"]');
    const cr = canvas?.getBoundingClientRect();
    
    return { tiles: codeTiles, canvas: cr ? { x: cr.x, y: cr.y, w: cr.width, h: cr.height } : null };
  });
  console.log('Tiles:', JSON.stringify(info.tiles));
  console.log('Canvas:', JSON.stringify(info.canvas));

  if (info.tiles.length === 0) {
    console.log('No tiles found — taking screenshot');
    await outerPage.screenshot({ path: '/tmp/ghl-notile.png' });
    execSync('cp /tmp/ghl-notile.png /Users/trevoradmin/.openclaw/workspace/ghl-notile.png');
    await browser.close();
    return;
  }

  const tile = info.tiles[0];
  const canvas = info.canvas || { x: 450, y: 200, w: 400, h: 400 };
  const srcX = tile.x + tile.w / 2;
  const srcY = tile.y + tile.h / 2;
  const dstX = canvas.x + canvas.w / 2;
  const dstY = canvas.y + 150;

  console.log(`Drag: (${srcX},${srcY}) → (${dstX},${dstY})`);

  // Proper drag with outerPage mouse (which controls the outer frame's viewport)
  await outerPage.mouse.move(srcX + 455, srcY); // offset for iframe left edge ≈455px?
  
  // Actually the frame coordinates ARE relative to the iframe viewport, not the outer page
  // Let's use the frame's mouse events via evaluate
  await frame.evaluate((sx, sy, dx, dy) => {
    const el = document.elementFromPoint(sx, sy);
    if (!el) { console.log('No element at', sx, sy); return; }
    
    ['dragstart', 'drag'].forEach(type => {
      el.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, clientX: sx, clientY: sy }));
    });
    
    const target = document.elementFromPoint(dx, dy) || document.body;
    ['dragenter', 'dragover'].forEach(type => {
      target.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, clientX: dx, clientY: dy }));
    });
    target.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, clientX: dx, clientY: dy }));
    el.dispatchEvent(new DragEvent('dragend', { bubbles: true, clientX: dx, clientY: dy }));
  }, srcX, srcY, dstX, dstY);
  await outerPage.waitForTimeout(3000);

  await outerPage.screenshot({ path: '/tmp/ghl-drag3.png' });
  execSync('cp /tmp/ghl-drag3.png /Users/trevoradmin/.openclaw/workspace/ghl-drag3.png');

  const check = await frame.evaluate(() => ({
    openBtn: !!([...document.querySelectorAll('button')].find(b => b.textContent.includes('Open Code Editor'))),
    customCodeEls: [...document.querySelectorAll('[class*="custom-code"], [data-component="code"]')].length
  }));
  console.log('After drag:', check);

  if (check.openBtn) {
    await frame.evaluate(() => {
      [...document.querySelectorAll('button')].find(b => b.textContent.includes('Open Code Editor'))?.click();
    });
    await outerPage.waitForTimeout(3000);

    const injected = await frame.evaluate((html) => {
      const cm = document.querySelector('.CodeMirror');
      if (cm?.CodeMirror) { cm.CodeMirror.setValue(html); return 'CodeMirror'; }
      const ta = [...document.querySelectorAll('textarea')].find(t => t.offsetHeight > 40);
      if (ta) {
        Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(ta, html);
        ta.dispatchEvent(new Event('input', { bubbles: true }));
        return 'textarea h=' + ta.offsetHeight;
      }
      return 'no editor found';
    }, HTML);
    console.log('Injection:', injected);

    if (!injected.includes('no editor')) {
      await frame.evaluate(() => {
        [...document.querySelectorAll('button')].find(b => /^save$/i.test(b.textContent.trim()))?.click();
      });
      await outerPage.waitForTimeout(2000);
      await frame.evaluate(() => {
        [...document.querySelectorAll('button')].find(b => b.textContent.includes('Publish'))?.click();
      });
      await outerPage.waitForTimeout(12000);
      const size = parseInt(execSync('curl -sL --max-time 15 "https://forgepipelineai.com/solutions" 2>/dev/null | wc -c').toString().trim());
      console.log('Live:', size, 'B');
    }
  }

  await browser.close();
}
main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
