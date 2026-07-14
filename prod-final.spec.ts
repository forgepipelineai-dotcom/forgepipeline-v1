import { test, expect } from '@playwright/test';

const PROD = 'https://forgepipeline-v1.vercel.app';
const GHL = 'https://forgepipelineai.com';

test.describe('Production Next.js App', () => {
  test('homepage loads', async ({page}) => {
    const r = await page.goto(PROD, {waitUntil:'domcontentloaded', timeout:20000});
    expect(r?.status()).toBeLessThan(400);
    await expect(page.locator('h1')).toBeVisible();
  });
  test('primary CTA exists', async ({page}) => {
    await page.goto(PROD, {waitUntil:'domcontentloaded'});
    const cta = page.locator('a:has-text("Start"), a:has-text("Trial"), a:has-text("Free"), a:has-text("Demo")').first();
    await expect(cta).toBeVisible();
  });
  test('login page loads', async ({page}) => {
    const r = await page.goto(`${PROD}/auth/login`, {waitUntil:'domcontentloaded', timeout:15000});
    expect(r?.status()).toBeLessThan(400);
  });
  test('register page loads', async ({page}) => {
    const r = await page.goto(`${PROD}/auth/register`, {waitUntil:'domcontentloaded', timeout:15000});
    expect(r?.status()).toBeLessThan(400);
  });
  test('onboarding page loads', async ({page}) => {
    const r = await page.goto(`${PROD}/onboarding`, {waitUntil:'domcontentloaded', timeout:15000});
    expect(r?.status()).toBeLessThan(400);
  });
  test('dashboard redirects to login (auth guard)', async ({page}) => {
    await page.goto(`${PROD}/dashboard`, {waitUntil:'domcontentloaded', timeout:15000});
    await page.waitForTimeout(3000);
    const url = page.url();
    expect(url).toContain('login');
  });
  test('metrics API returns 200', async ({page}) => {
    const r = await page.goto(`${PROD}/api/dashboard/metrics`, {timeout:10000});
    expect(r?.status()).toBe(200);
  });
  test('webhook POST-only (GET=405)', async ({page}) => {
    const r = await page.goto(`${PROD}/api/webhooks/ghl`, {timeout:10000});
    expect(r?.status()).toBe(405);
  });
});

test.describe('GHL Marketing Site', () => {
  test('homepage loads with unique content', async ({page}) => {
    const r = await page.goto(GHL, {waitUntil:'domcontentloaded', timeout:20000});
    expect(r?.status()).toBe(200);
    const size = (await page.content()).length;
    expect(size).toBeGreaterThan(100000);
  });
  test('voice-employee page has content', async ({page}) => {
    const r = await page.goto(`${GHL}/voice-employee`, {waitUntil:'domcontentloaded', timeout:20000});
    expect(r?.status()).toBe(200);
    const content = await page.content();
    expect(content.length).toBeGreaterThan(100000);
    expect(content).toContain('ForgePipeline');
  });
  test('pricing page loads', async ({page}) => {
    const r = await page.goto(`${GHL}/pricing`, {waitUntil:'domcontentloaded', timeout:20000});
    expect(r?.status()).toBe(200);
  });
  test('booking CTA exists on voice-employee', async ({page}) => {
    await page.goto(`${GHL}/voice-employee`, {waitUntil:'domcontentloaded', timeout:20000});
    const booking = page.locator('a[href*="booking"], a[href*="demo"], a:has-text("Demo"), a:has-text("Book")').first();
    await expect(booking).toBeVisible();
  });
  test('navigation links present', async ({page}) => {
    await page.goto(`${GHL}/voice-employee`, {waitUntil:'domcontentloaded', timeout:20000});
    const nav = page.locator('nav a');
    const count = await nav.count();
    expect(count).toBeGreaterThan(2);
  });
  test('footer present', async ({page}) => {
    await page.goto(`${GHL}/voice-employee`, {waitUntil:'domcontentloaded', timeout:20000});
    const footer = page.locator('footer');
    await expect(footer).toBeVisible();
  });
});
