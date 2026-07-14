const { chromium } = require('playwright');
const fs = require('fs');
const { execSync } = require('child_process');

const HTML_FILE = '/Users/trevoradmin/.openclaw/workspace/projects/ghl-pages/solutions.html';
const CDP_URL = 'http://127.0.0.1:18800';
const BUILDER_PATH = '/location/UGYrGVYl23V0VDIwrWe9/page-builder/WFyMdO2yfShaRGUAuKde';

async function main() {
  const html = fs.readFileSync(HTML_FILE, 'utf8');
  const browser = await chromium.connectOverCDP(CDP_URL);
  const contexts = browser.contexts();

  let outerPage = null;
  for (const ctx of contexts) {
    for (const p of ctx.pages()) {
      if (p.url().includes(BUILDER_PATH)) { outerPage = p; break; }
    }
    if (outerPage) break;
  }
  if (!outerPage) {
    const ctx = contexts[0];
    outerPage = await ctx.newPage();
    await outerPage.goto(`https://app.gohighlevel.com${BUILDER_PATH}?source=website`);
    await outerPage.waitForLoadState('networkidle');
    await outerPage.waitForTimeout(8000);
  }

  const iframeHandle = await outerPage.$('iframe[src*="page-builder.leadconnectorhq.com"]');
  const frame = await iframeHandle.contentFrame();
  await outerPage.waitForTimeout(3000);

  // Step 1: Click Quick Add via evaluate (bypasses visibility)
  const step1 = await frame.evaluate(() => {
    const btn = document.getElementById('hl-menu-item-quickAdd') || 
                [...document.querySelectorAll('button')].find(b => b.textContent.trim().includes('Quick Add'));
    if (btn) { btn.click(); return 'clicked QuickAdd: ' + btn.id; }
    return 'QA btn not found';
  });
  console.log('Step 1:', step1);
  await outerPage.waitForTimeout(1500);

  // Step 2: Fill search and find Code
  const step2 = await frame.evaluate(() => {
    const inputs = [...document.querySelectorAll('input')];
    const search = inputs.find(i => i.placeholder?.toLowerCase().includes('search') || i.type === 'search') || inputs[0];
    if (search) {
      search.value = 'Code';
      search.dispatchEvent(new Event('input', { bubbles: true }));
      return 'search filled: ' + search.placeholder;
    }
    return 'no search input';
  });
  console.log('Step 2:', step2);
  await outerPage.waitForTimeout(800);

  // Step 3: Find Code tile info and drag to canvas
  const dragInfo = await frame.evaluate(() => {
    // Find Code tiles
    const elements = [...document.querySelectorAll('[tabindex], [draggable]')].filter(el => {
      const text = el.textContent?.trim();
      return text === 'Code' || text?.includes('Code');
    });
    const canvasSel = ['[class*="canvas"]', '[class*="builder-content"]', '[class*="preview-container"]', 'main', 'section'];
    let canvas = null;
    for (const sel of canvasSel) {
      canvas = document.querySelector(sel);
      if (canvas && canvas.getBoundingClientRect().width > 400) break;
    }
    return {
      codeEls: elements.map(el => { const r = el.getBoundingClientRect(); return {tag:el.tagName, class:el.className.slice(0,40), x:r.x, y:r.y, w:r.width, h:r.height, draggable:el.draggable}; }).filter(e => e.w > 0),
      canvas: canvas ? (() => { const r = canvas.getBoundingClientRect(); return {x:r.x, y:r.y, w:r.width, h:r.height}; })() : null
    };
  });
  console.log('Drag info:', JSON.stringify(dragInfo, null, 2));

  // Perform drag using mouse
  if (dragInfo.codeEls.length > 0 && dragInfo.canvas) {
    const src = dragInfo.codeEls[0];
    const dst = dragInfo.canvas;
    const srcX = src.x + src.w/2;
    const srcY = src.y + src.h/2;
    const dstX = dst.x + dst.w/2;
    const dstY = dst.y + dst.h/2;
    
    console.log(`Dragging from (${srcX},${srcY}) to (${dstX},${dstY})`);
    
    await frame.mouse.move(srcX, srcY);
    await frame.mouse.down();
    await outerPage.waitForTimeout(500);
    
    // Move gradually
    for (let step = 1; step <= 20; step++) {
      const x = srcX + (dstX - srcX) * (step / 20);
      const y = srcY + (dstY - srcY) * (step / 20);
      await frame.mouse.move(x, y);
      await outerPage.waitForTimeout(50);
    }
    await frame.mouse.up();
    console.log('Drag complete');
    await outerPage.waitForTimeout(3000);
  }

  // Check result
  const check = await frame.evaluate(() => {
    const openBtn = [...document.querySelectorAll('button')].find(b => b.textContent.includes('Open Code Editor'));
    const customCode = document.querySelector('[class*="custom-code"], [data-type*="code"]');
    return { hasOpenBtn: !!openBtn, hasCustomCode: !!customCode };
  });
  console.log('After drag:', check);

  if (check.hasOpenBtn) {
    console.log('🎉 Code element added! Opening editor...');
    await frame.evaluate(() => {
      const btn = [...document.querySelectorAll('button')].find(b => b.textContent.includes('Open Code Editor'));
      btn?.click();
    });
    await outerPage.waitForTimeout(3000);

    const injected = await frame.evaluate((htmlContent) => {
      const cm = document.querySelector('.CodeMirror');
      if (cm?.CodeMirror) { cm.CodeMirror.setValue(htmlContent); return 'CodeMirror'; }
      if (window.monaco?.editor) { const m=window.monaco.editor.getModels(); if(m.length){m[0].setValue(htmlContent);return 'Monaco';} }
      const ta=[...document.querySelectorAll('textarea')].sort((a,b)=>b.offsetHeight-a.offsetHeight)[0];
      if(ta){Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(ta,htmlContent);ta.dispatchEvent(new Event('input',{bubbles:true}));return 'textarea';}
      return 'none';
    }, html);
    console.log('HTML injected:', injected);

    if (injected !== 'none') {
      await outerPage.waitForTimeout(500);
      await frame.evaluate(() => { const s=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Save'); s?.click(); });
      await outerPage.waitForTimeout(2000);
      await frame.evaluate(() => { const p=[...document.querySelectorAll('button')].find(b=>b.textContent.includes('Publish')); p?.click(); });
      console.log('Published!');
      await outerPage.waitForTimeout(12000);

      const size = parseInt(execSync('curl -sL --max-time 15 "https://forgepipelineai.com/solutions" 2>/dev/null | wc -c').toString().trim());
      const title = execSync('curl -sL --max-time 10 "https://forgepipelineai.com/solutions" 2>/dev/null | grep -o "<title>[^<]*</title>" | head -1 2>/dev/null').toString().trim();
      console.log(`Live: ${size}B | ${title}`);
      console.log(size !== 85618 && size > 15000 ? '✅ SOLUTIONS PAGE LIVE' : '❌ Still catch-all');
    }
  } else {
    console.log('Code element not added to canvas — drag may have missed');
    await outerPage.screenshot({ path: '/tmp/ghl-drag-result.png' });
    execSync('cp /tmp/ghl-drag-result.png /Users/trevoradmin/.openclaw/workspace/ghl-drag-result.png');
    console.log('Screenshot saved to workspace/ghl-drag-result.png');
  }

  await browser.close();
}
main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
