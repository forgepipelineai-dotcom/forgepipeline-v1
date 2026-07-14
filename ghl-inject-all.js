const { chromium } = require('playwright');
const fs = require('fs');
const { execSync } = require('child_process');

const CDP_URL = 'http://127.0.0.1:18800';
const GHL_BASE = 'https://app.gohighlevel.com';
const LOC = 'UGYrGVYl23V0VDIwrWe9';
const PAGES_DIR = '/Users/trevoradmin/.openclaw/workspace/projects/ghl-pages';
const SS_DIR = '/Users/trevoradmin/.openclaw/workspace/projects/phase-final-evidence/screenshots';

const PAGES = [
  { slug: 'solutions',    file: 'solutions.html',    pageId: 'WFyMdO2yfShaRGUAuKde' },
  { slug: 'how-it-works', file: 'how-it-works.html', pageId: 'Qnl1qx9xOEiR1jCjBhBH' },
  { slug: 'results',      file: 'results.html',      pageId: 'wtCuPzqwKYs5GLKfZiSF' },
  { slug: 'contact',      file: 'contact.html',      pageId: 'HPNhgFmQmpGf6DG43Lsi' },
];

async function injectAndPublish(browser, pageId, html, slug) {
  const ctx = browser.contexts()[0];
  const pg = await ctx.newPage();
  try {
    await pg.goto(`${GHL_BASE}/location/${LOC}/page-builder/${pageId}?source=website`);
    await pg.waitForTimeout(8000);

    const iEl = await pg.$('iframe[src*="page-builder.leadconnectorhq.com"]');
    if (!iEl) { console.log(`  [${slug}] No iframe`); return false; }
    const frame = await iEl.contentFrame();
    await pg.waitForTimeout(2000);

    // Escape any open panels
    await pg.keyboard.press('Escape');
    await pg.waitForTimeout(400);

    // Step 1: Open Quick Add
    await frame.evaluate(() => { document.getElementById('hl-menu-item-quickAdd')?.click(); });
    await pg.waitForTimeout(1500);

    // Step 2: Search for Code
    await frame.evaluate(() => {
      const i = [...document.querySelectorAll('input')].find(x => x.placeholder?.toLowerCase().includes('search'));
      if (i) { i.value='Code'; i.dispatchEvent(new Event('input',{bubbles:true})); }
    });
    await pg.waitForTimeout(1000);

    // Step 3: Find Code card and click (force)
    const codeClicked = await frame.evaluate(() => {
      // Try the specific class seen in errors
      const el = document.querySelector('p.gui__builder-card--label');
      if (el && el.textContent.trim() === 'Code') {
        const card = el.closest('[tabindex], [class*="card"], [class*="element"]') || el.parentElement;
        card?.click();
        el.click();
        return 'gui__builder-card--label clicked';
      }
      // Fallback: find by text Code in any tile-like element
      const all = [...document.querySelectorAll('[tabindex]')].filter(e => e.textContent.trim() === 'Code');
      if (all.length) { all.forEach(e => e.click()); return `tabindex clicked ${all.length}`; }
      return 'not found';
    });
    console.log(`  [${slug}] Code click: ${codeClicked}`);
    await pg.waitForTimeout(2500);

    // Step 4: Check for code editor in right panel
    const hasBtn = await frame.evaluate(() =>
      !!([...document.querySelectorAll('button')].find(b => b.textContent.includes('Open Code Editor')))
    );
    console.log(`  [${slug}] Has editor button: ${hasBtn}`);

    let injected = false;
    if (hasBtn) {
      await frame.evaluate(() => {
        [...document.querySelectorAll('button')].find(b => b.textContent.includes('Open Code Editor'))?.click();
      });
      await pg.waitForTimeout(3000);

      const res = await frame.evaluate(({h}) => {
        const cm = document.querySelector('.CodeMirror');
        if (cm?.CodeMirror) { cm.CodeMirror.setValue(h); return 'CM:'+cm.CodeMirror.getValue().length; }
        const ta = [...document.querySelectorAll('textarea')].find(t => t.offsetHeight > 50);
        if (ta) {
          Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(ta, h);
          ta.dispatchEvent(new Event('input',{bubbles:true}));
          return 'ta:'+ta.offsetHeight;
        }
        return 'none';
      }, { h: html });
      console.log(`  [${slug}] Inject: ${res}`);
      injected = !res.includes('none');
    }

    // Regardless of code element, also try the tracking code panel as backup
    if (!hasBtn || !injected) {
      await pg.keyboard.press('Escape');
      await pg.waitForTimeout(400);
      // Open tracking code panel (button at x~104 in toolbar)
      await frame.evaluate(() => {
        [...document.querySelectorAll('button')].find(b => {
          const r = b.getBoundingClientRect();
          return r.x > 100 && r.x < 120 && r.y > 50 && r.y < 90;
        })?.click();
      });
      await pg.waitForTimeout(2000);

      // Get current CM content to check if ours is already there
      const current = await frame.evaluate(() => {
        const cm = document.querySelector('.CodeMirror');
        return cm?.CodeMirror?.getValue()?.slice(0,50) || 'no CM';
      });
      console.log(`  [${slug}] Current tracking code: ${current.slice(0,40)}`);

      if (!current.includes('<!DOCTYPE') && !current.includes('ForgePipeline')) {
        const tcRes = await frame.evaluate(({h}) => {
          const cms = [...document.querySelectorAll('.CodeMirror')].filter(cm => cm.offsetHeight > 0);
          if (!cms.length) return 'no CM';
          cms[0].CodeMirror.setValue(h);
          return 'TC:'+cms[0].CodeMirror.getValue().length;
        }, { h: html });
        console.log(`  [${slug}] Tracking code: ${tcRes}`);
        injected = true;
      } else {
        console.log(`  [${slug}] HTML already in tracking code`);
        injected = true;
      }

      // Save dialog
      await frame.evaluate(() => {
        [...document.querySelectorAll('button')].find(b => /^save$/i.test(b.textContent.trim()))?.click();
      });
      await pg.waitForTimeout(1500);
    }

    // Always: Save the page and Publish
    if (hasBtn && injected) {
      await frame.evaluate(() => {
        [...document.querySelectorAll('button')].find(b => /^save$/i.test(b.textContent.trim()))?.click();
      });
      await pg.waitForTimeout(1500);
    }

    await frame.evaluate(() => {
      [...document.querySelectorAll('button')].find(b => b.textContent.includes('Publish'))?.click();
    });
    console.log(`  [${slug}] Publishing...`);
    await pg.waitForTimeout(12000);
    return true;
  } catch(e) {
    console.log(`  [${slug}] Error: ${e.message.slice(0,80)}`);
    return false;
  } finally {
    await pg.close();
  }
}

async function verify(slug) {
  const url = `https://forgepipelineai.com/${slug}`;
  try {
    const raw = execSync(`curl -sL --max-time 15 "${url}" 2>/dev/null`).toString();
    const size = raw.length;
    const isReal = size !== 85618 && size !== 85809 && size > 20000;
    const title = raw.match(/<title>([^<]*)<\/title>/)?.[1] || 'none';
    const hasOurContent = raw.includes('FF6B1F') || raw.includes('Montserrat') || raw.includes('ForgePipeline') || raw.includes('section-tag');
    return { url, size, isReal, title: title.slice(0,60), hasOurContent };
  } catch(e) { return { url, error: e.message }; }
}

async function takeScreenshots(browser, slug, url) {
  const ctx = browser.contexts()[0];
  const pg = await ctx.newPage();
  try {
    for (const [name, vp] of [['desktop',{w:1440,h:900}],['tablet',{w:768,h:1024}],['mobile',{w:375,h:812}]]) {
      await pg.setViewportSize({width:vp.w, height:vp.h});
      await pg.goto(url, {waitUntil:'domcontentloaded', timeout:20000});
      await pg.waitForTimeout(2000);
      await pg.screenshot({path:`${SS_DIR}/${slug}-${name}.png`, fullPage:false});
      console.log(`  Screenshot: ${slug}-${name}.png`);
    }
  } catch(e) { console.log(`  Screenshot error: ${e.message.slice(0,60)}`); }
  finally { await pg.close(); }
}

async function main() {
  const browser = await chromium.connectOverCDP(CDP_URL);
  const results = {};

  for (const p of PAGES) {
    console.log(`\n=== /${p.slug} (${p.pageId}) ===`);
    const html = fs.readFileSync(`${PAGES_DIR}/${p.file}`, 'utf8');
    await injectAndPublish(browser, p.pageId, html, p.slug);
    
    // Wait for CDN
    await new Promise(r => setTimeout(r, 5000));
    
    const v = await verify(p.slug);
    results[p.slug] = v;
    console.log(`  LIVE: ${v.size}B | real:${v.isReal} | fp:${v.hasOurContent} | "${v.title}"`);

    if (v.isReal) {
      await takeScreenshots(browser, p.slug, v.url);
    }
  }

  console.log('\n=== FINAL RESULTS ===');
  for (const [s,v] of Object.entries(results)) {
    const ok = v.isReal ? '✅' : '❌';
    console.log(`${ok} /${s}: ${v.size}B | ${v.title?.slice(0,40)}`);
  }

  fs.writeFileSync(
    '/Users/trevoradmin/.openclaw/workspace/projects/phase-final-evidence/ghl-results.json',
    JSON.stringify(results, null, 2)
  );

  await browser.close();
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
