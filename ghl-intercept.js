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

  // Enable request interception to capture save calls
  const capturedRequests = [];
  outerPage.on('request', req => {
    const url = req.url();
    if ((url.includes('backend.leadconnector') || url.includes('services.leadconnector') || url.includes('api.gohighlevel')) &&
        (req.method() === 'POST' || req.method() === 'PUT' || req.method() === 'PATCH')) {
      capturedRequests.push({ url, method: req.method(), body: req.postData()?.slice(0, 200) });
    }
  });

  const iframeHandle = await outerPage.$('iframe[src*="page-builder.leadconnectorhq.com"]');
  const frame = await iframeHandle.contentFrame();
  
  // Also intercept from the frame's page
  const frameRequests = [];
  // Can't add request listener to frame directly, but we can add it to the page

  // Trigger a save by calling keyboard shortcut Cmd+S
  await outerPage.keyboard.press('Meta+s');
  await outerPage.waitForTimeout(2000);

  // Also try clicking the save button
  const saveResult = await frame.evaluate(() => {
    // Find save button (not publish)  
    const btns = [...document.querySelectorAll('button')];
    const save = btns.find(b => b.title?.toLowerCase().includes('save') && !b.textContent.includes('Publish'));
    if (save) { save.click(); return 'save clicked'; }
    // Try Ctrl+S
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 's', ctrlKey: true, metaKey: true, bubbles: true }));
    return 'keyboard shortcut sent';
  });
  console.log('Save attempt:', saveResult);
  await outerPage.waitForTimeout(3000);

  console.log('Captured requests:', capturedRequests.length);
  capturedRequests.forEach((r, i) => console.log(`  [${i}] ${r.method} ${r.url.slice(0,100)}`));

  // Now let's try calling the backend API to update the page with our HTML
  // Use the token from cookies
  const token = await outerPage.evaluate(() => {
    return document.cookie.split(';').find(c=>c.trim().startsWith('access-token-v2='))?.split('=').slice(1).join('=') || '';
  });

  console.log('\nToken obtained:', token.length > 100 ? 'yes' : 'no');

  // Try various API patterns for updating page content
  const TESTS = [
    { url: `https://backend.leadconnectorhq.com/funnels/${BUILDER_PATH.split('/')[4]}/headAndBodyCode`, method: 'PUT' },
    { url: `https://backend.leadconnectorhq.com/funnels/page/${BUILDER_PATH.split('/')[4]}`, method: 'PUT' },
    { url: `https://backend.leadconnectorhq.com/funnels/${BUILDER_PATH.split('/')[4]}`, method: 'PATCH' },
  ];

  const pageId = BUILDER_PATH.split('/')[4]; // WFyMdO2yfShaRGUAuKde
  const locId = 'UGYrGVYl23V0VDIwrWe9';

  // Try headCode injection via fetch
  const apiResult = await outerPage.evaluate(async ({token, pageId, locId, htmlCode}) => {
    const endpoints = [
      `https://backend.leadconnectorhq.com/funnels/page/${pageId}/head-body-code`,
      `https://backend.leadconnectorhq.com/funnels/page/${pageId}?locationId=${locId}`,
      `https://backend.leadconnectorhq.com/website/${pageId}?locationId=${locId}`,
    ];
    const headers = { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json', 'Version': '2021-07-28', 'channel': 'APP', 'source': 'WEB_USER' };
    const results = [];
    for (const url of endpoints) {
      try {
        const r = await fetch(url, { method: 'PUT', headers, body: JSON.stringify({ headCode: htmlCode, locationId: locId }) });
        results.push({ url: url.slice(0,80), status: r.status });
      } catch(e) { results.push({ url: url.slice(0,80), error: e.message.slice(0,40) }); }
    }
    return results;
  }, { token, pageId, locId, htmlCode: html });

  console.log('\nAPI test results:', JSON.stringify(apiResult, null, 2));

  await browser.close();
}
main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
