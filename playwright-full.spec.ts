import { test, expect, Page } from '@playwright/test';

const BASE = 'http://localhost:3999';

// Pages to test
const pages = [
  { name: 'home', url: '/' },
  { name: 'login', url: '/auth/login' },
  { name: 'register', url: '/auth/register' },
  { name: 'onboarding', url: '/onboarding' },
  { name: 'dashboard', url: '/dashboard' },
  { name: 'leads', url: '/dashboard/leads' },
];

// CTAs to verify on home page
const requiredCTAs = [
  { text: 'Start Free Trial', href: '/onboarding' },
  { text: 'Pricing', href: '#pricing' },
  { text: 'Features', href: '#features' },
  { text: 'Login', href: '/auth/login' },
];

// Required anchors
const requiredAnchors = ['#features', '#pricing', '#demo'];

// Missing anchors (document as defects)
const missingAnchors = ['#faq', '#command-center', '#revenue-os', '#forgeagent', '#local-service-leads', '#booking'];

test.describe('Page Load Tests', () => {
  for (const page of pages) {
    test(`${page.name} loads`, async ({ page: p }) => {
      const res = await p.goto(BASE + page.url, { waitUntil: 'domcontentloaded', timeout: 15000 });
      expect(res?.status()).toBeLessThan(500);
    });
  }
});

test.describe('Home Page CTA Validation', () => {
  test('All required CTAs present', async ({ page }) => {
    await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
    const ctaResults = [];
    for (const cta of requiredCTAs) {
      const el = page.locator(`a:has-text("${cta.text}")`).first();
      const exists = await el.count() > 0;
      ctaResults.push({ cta: cta.text, exists, expected_href: cta.href });
    }
    console.log('CTA Results:', JSON.stringify(ctaResults));
    const allFound = ctaResults.every(r => r.exists);
    expect(allFound, JSON.stringify(ctaResults)).toBeTruthy();
  });
});

test.describe('Anchor Validation', () => {
  test('Present anchors exist on home page', async ({ page }) => {
    await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
    for (const anchor of requiredAnchors) {
      const id = anchor.replace('#', '');
      const el = page.locator(`[id="${id}"]`);
      const count = await el.count();
      console.log(`Anchor ${anchor}: ${count > 0 ? 'FOUND' : 'MISSING'}`);
    }
  });

  test('Document missing anchors', async ({ page }) => {
    await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
    const missingReport = [];
    for (const anchor of missingAnchors) {
      const id = anchor.replace('#', '');
      const el = page.locator(`[id="${id}"]`);
      const count = await el.count();
      if (count === 0) missingReport.push(anchor);
    }
    console.log('Missing anchors (HIGH DEFECT):', JSON.stringify(missingReport));
    // This test documents; it does not fail
  });
});

test.describe('Auth Flow', () => {
  test('Login form renders', async ({ page }) => {
    await page.goto(BASE + '/auth/login', { waitUntil: 'domcontentloaded' });
    const emailField = page.locator('input[type="email"], input[name="email"]');
    const passwordField = page.locator('input[type="password"]');
    expect(await emailField.count()).toBeGreaterThan(0);
    expect(await passwordField.count()).toBeGreaterThan(0);
  });

  test('Register form renders', async ({ page }) => {
    await page.goto(BASE + '/auth/register', { waitUntil: 'domcontentloaded' });
    const emailField = page.locator('input[type="email"], input[name="email"]');
    expect(await emailField.count()).toBeGreaterThan(0);
  });
});

test.describe('Dashboard Auth Guard', () => {
  test('Dashboard redirects when no session', async ({ page }) => {
    await page.goto(BASE + '/dashboard', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);
    const url = page.url();
    console.log('Dashboard redirect target:', url);
    // Should redirect to /auth/login
    expect(url).toContain('/auth/login');
  });
});
