// GHL Page Publisher — deploys all 4 remaining ForgePipeline pages
// Uses force-click on gui__builder-card--label to add Code element
const { chromium } = require('playwright');
const fs = require('fs');
const { execSync } = require('child_process');

const CDP_URL = 'http://127.0.0.1:18800';
const GHL_BASE = 'https://app.gohighlevel.com';
const LOC = 'UGYrGVYl23V0VDIwrWe9';
const SITE = 'wvAYQalMuBA6As7WZUJ6';
const PAGES_DIR = '/Users/trevoradmin/.openclaw/workspace/projects/ghl-pages';
const SS_DIR = '/Users/trevoradmin/.openclaw/workspace/projects/phase-final-evidence/screenshots';

const PAGES = [
  { slug: 'solutions',     file: 'solutions.html',    pageId: 'WFyMdO2yfShaRGUAuKde', exists: true  },
  { slug: 'how-it-works',  file: 'how-it-works.html', pageId: null,                   exists: false },
  { slug: 'results',       file: 'results.html',       pageId: null,                   exists: false },
  { slug: 'contact',       file: 'contact.html',       pageId: null,                   exists: false },
];

async function getToken(page) {
  return page.evaluate(() =>
    document.cookie.split(';').find(c => c.trim().startsWith('access-token-v2='))?.split('=').slice(1).join('=') || ''
  );
}

async function createPage(page, token, slug) {
  // Create a new GHL page via the pages list UI
  await page.goto(`${GHL_BASE}/v2/location/${LOC}/funnels-websites/websites/${SITE}/pages`);
  await page.waitForTimeout(4000);
  const result = await page.evaluate(async ({slug, siteId, locId, tok}) => {
    const r = await fetch(`https://backend.leadconnectorhq.com/funnels/${siteId}/steps`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${tok}`,
        'Content-Type': 'application/json',
        'Version': '2021-07-28',
        'channel': 'APP',
        'source': 'WEB_USER'
      },
      body: JSON.stringify({ name: slug.replace(/-/g, ' ').replace(/\b\w/g, c=>c.toUpperCase()), url: `/${slug}`, locationId: locId })
    });
    const d = await r.json();
    return { status: r.status, id: d._id || d.id, keys: Object.keys(d).slice(0,8) };
  }, { slug, siteId: SITE, locId: LOC, tok: token });
  console.log(`  Create page result: ${JSON.stringify(result)}`);
  return result.id;
}

async function injectContent(outerPage, pageId, html) {
  // Navigate to the page builder
  await outerPage.goto(`${GHL_BASE}/location/${LOC}/page-builder/${pageId}?source=website`);
  await outerPage.waitForTimeout(8000);

  const iframeEl = await outerPage.$('iframe[src*="page-builder.leadconnectorhq.com"]');
  if (!iframeEl) { console.log('  No iframe found'); return false; }
  const frame = await iframeEl.contentFrame();
  await outerPage.waitForTimeout(3000);

  // Try the force-click approach on the gui__builder-card--label
  // Step 1: Open Quick Add
  await frame.evaluate(() => {
    document.getElementById('hl-menu-item-quickAdd')?.click();
  });
  await outerPage.waitForTimeout(1500);

  // Step 2: Search for Code
  await frame.evaluate(() => {
    const i = [...document.querySelectorAll('input')].find(i => i.placeholder?.toLowerCase().includes('search'));
    if (i) { i.value = 'Code'; i.dispatchEvent(new Event('input', {bubbles: true})); }
  });
  await outerPage.waitForTimeout(1000);

  // Step 3: Force-click the Code card using its specific class
  const clicked = await frame.evaluate(() => {
    // Try gui__builder-card--label with text "Code"
    const labels = [...document.querySelectorAll('p.gui__builder-card--label, [class*="builder-card"][class*="label"], [class*="card-label"]')];
    const codeLabel = labels.find(el => el.textContent.trim() === 'Code');
    if (codeLabel) {
      const parent = codeLabel.closest('[tabindex], [draggable], [class*="card"]') || codeLabel.parentElement;
      parent?.click();
      codeLabel.click();
      return { found: true, tag: codeLabel.tagName, parentClass: parent?.className?.slice(0,50) };
    }
    // Try any element with exact text "Code" that has a sibling image (card structure)
    const allCode = [...document.querySelectorAll('*')].filter(el =>
      el.childElementCount <= 1 && el.textContent?.trim() === 'Code' && el.getBoundingClientRect().width > 0
    );
    if (allCode.length > 0) {
      allCode.forEach(el => el.click());
      return { found: true, count: allCode.length, fallback: true };
    }
    return { found: false };
  });
  console.log(`  Code click: ${JSON.stringify(clicked)}`);
  await outerPage.waitForTimeout(3000);

  // Step 4: Check for Open Code Editor
  const hasEditor = await frame.evaluate(() =>
    !!([...document.querySelectorAll('button')].find(b => b.textContent.includes('Open Code Editor')))
  );
  console.log(`  Has Open Code Editor: ${hasEditor}`);

  if (hasEditor) {
    await frame.evaluate(() => {
      [...document.querySelectorAll('button')].find(b => b.textContent.includes('Open Code Editor'))?.click();
    });
    await outerPage.waitForTimeout(3000);

    const injected = await frame.evaluate(({html}) => {
      const cm = document.querySelector('.CodeMirror');
      if (cm?.CodeMirror) { cm.CodeMirror.setValue(html); return 'CodeMirror ' + cm.CodeMirror.getValue().length; }
      const ta = [...document.querySelectorAll('textarea')].find(t => t.offsetHeight > 50);
      if (ta) {
        Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(ta, html);
        ta.dispatchEvent(new Event('input', {bubbles: true}));
        return 'textarea ' + ta.offsetHeight;
      }
      return 'no editor';
    }, { html });
    console.log(`  Inject: ${injected}`);

    if (!injected.includes('no editor')) {
      await outerPage.waitForTimeout(500);
      await frame.evaluate(() => {
        [...document.querySelectorAll('button')].find(b => /^save$/i.test(b.textContent.trim()))?.click();
      });
      await outerPage.waitForTimeout(2000);
      await frame.evaluate(() => {
        [...document.querySelectorAll('button')].find(b => b.textContent.includes('Publish'))?.click();
      });
      await outerPage.waitForTimeout(12000);
      return true;
    }
  }

  // Fallback: inject via tracking code with full page replacement
  console.log('  Falling back to tracking code approach...');
  // The </> button at x=104 in the toolbar opens tracking code
  await outerPage.keyboard.press('Escape');
  await outerPage.waitForTimeout(500);
  await frame.evaluate(() => {
    [...document.querySelectorAll('button')].find(b => {
      const r = b.getBoundingClientRect();
      return r.x > 100 && r.x < 120 && r.y > 50 && r.y < 90;
    })?.click();
  });
  await outerPage.waitForTimeout(2000);

  // Click Header Tracking tab, inject full replacement script
  await frame.evaluate(() => {
    const tabs = [...document.querySelectorAll('*')].find(el => el.textContent.trim() === 'Header Tracking' && el.offsetHeight > 0);
    if (tabs) tabs.click();
  });
  await outerPage.waitForTimeout(500);

  const htmlEscaped = html.replace(/`/g, '\\`').replace(/\${/g, '\\${');
  const INJECT = `<script>
window.__fpHTML = \`${htmlEscaped}\`;
(function run(){
  var pc = document.getElementById('preview-container');
  if(pc){ var d=document.createElement('div'); d.innerHTML=window.__fpHTML; document.body.insertBefore(d,pc); pc.style.display='none'; }
  else { setTimeout(run,200); }
})();
<\/script>`;

  const injRes = await frame.evaluate(({code}) => {
    const cms = [...document.querySelectorAll('.CodeMirror')].filter(cm => cm.offsetHeight > 0);
    if (!cms.length) return 'no CM';
    cms[0].CodeMirror.setValue(code);
    return 'CM set: ' + cms[0].CodeMirror.getValue().length;
  }, { code: INJECT });
  console.log(`  Tracking code: ${injRes}`);

  await frame.evaluate(() => {
    [...document.querySelectorAll('button')].find(b => /^save$/i.test(b.textContent.trim()))?.click();
  });
  await outerPage.waitForTimeout(2000);
  await frame.evaluate(() => {
    [...document.querySelectorAll('button')].find(b => b.textContent.includes('Publish'))?.click();
  });
  await outerPage.waitForTimeout(12000);
  return true;
}

async function verifyPage(slug) {
  const url = `https://forgepipelineai.com/${slug}`;
  const raw = execSync(`curl -sL --max-time 15 "${url}" 2>/dev/null`).toString();
  const size = raw.length;
  const isLive = size !== 85618 && size !== 85809 && size > 15000;
  const title = raw.match(/<title>([^<]*)<\/title>/)?.[1] || 'none';
  const canonical = raw.includes(`/${slug}`) ? 'present' : 'missing';
  const hasFPContent = raw.includes('FF6B1F') || raw.includes('Montserrat') || raw.includes('ForgePipeline');
  return { url, size, isLive, title, canonical, hasFPContent };
}

async function screenshot(page, url, name, viewport) {
  await page.setViewportSize(viewport);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: `${SS_DIR}/${name}.png`, fullPage: false });
  console.log(`  Screenshot: ${name}.png`);
}

async function main() {
  const browser = await chromium.connectOverCDP(CDP_URL);

  // Find an existing GHL page context
  let ghlPage = null;
  for (const ctx of browser.contexts()) {
    for (const p of ctx.pages()) {
      if (p.url().includes('gohighlevel.com')) { ghlPage = p; break; }
    }
    if (ghlPage) break;
  }
  if (!ghlPage) {
    const ctx = browser.contexts()[0];
    ghlPage = await ctx.newPage();
    await ghlPage.goto(`${GHL_BASE}/v2/location/${LOC}/funnels-websites/websites/${SITE}/pages`);
    await ghlPage.waitForTimeout(5000);
  }

  const token = await getToken(ghlPage);
  console.log(`Token: ${token.length > 50 ? 'obtained' : 'MISSING'}`);

  const results = {};

  for (const p of PAGES) {
    console.log(`\n=== Processing /${p.slug} ===`);
    const html = fs.readFileSync(`${PAGES_DIR}/${p.file}`, 'utf8');

    // Create page in GHL if needed
    let pageId = p.pageId;
    if (!p.exists && token) {
      const created = await createPage(ghlPage, token, p.slug);
      if (created) { pageId = created; console.log(`  Created: ${pageId}`); }
      else console.log('  Create failed — may need manual page creation');
    }

    if (!pageId) {
      console.log(`  No pageId for ${p.slug} — skipping injection`);
      results[p.slug] = { status: 'needs_manual', reason: 'no pageId' };
      continue;
    }

    // Inject content
    const ok = await injectContent(ghlPage, pageId, html);
    console.log(`  Injection: ${ok}`);
    await new Promise(r => setTimeout(r, 3000));

    // Verify
    const v = await verifyPage(p.slug);
    results[p.slug] = v;
    console.log(`  Live: ${v.size}B | FP content: ${v.hasFPContent} | Title: ${v.title.slice(0,50)}`);

    // Screenshots if live
    if (v.isLive) {
      const scrPage = await browser.contexts()[0].newPage();
      try {
        await screenshot(scrPage, v.url, `${p.slug}-desktop`, {width:1440, height:900});
        await screenshot(scrPage, v.url, `${p.slug}-tablet`,  {width:768,  height:1024});
        await screenshot(scrPage, v.url, `${p.slug}-mobile`,  {width:375,  height:812});
      } catch(e) { console.log('  Screenshot error:', e.message); }
      await scrPage.close();
    }
  }

  console.log('\n=== RESULTS ===');
  for (const [slug, v] of Object.entries(results)) {
    console.log(`/${slug}: ${JSON.stringify(v)}`);
  }

  // Save results JSON
  fs.writeFileSync(
    '/Users/trevoradmin/.openclaw/workspace/projects/phase-final-evidence/ghl-deployment-results.json',
    JSON.stringify(results, null, 2)
  );

  await browser.close();
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
