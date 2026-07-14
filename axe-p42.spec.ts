import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const PAGES = [
  { name: 'home', url: '/' },
  { name: 'login', url: '/auth/login' },
  { name: 'register', url: '/auth/register' },
  { name: 'onboarding', url: '/onboarding' },
  { name: 'dashboard', url: '/dashboard' },
];

for (const p of PAGES) {
  test(`axe - ${p.name}`, async ({ page }) => {
    await page.goto(`http://localhost:3999${p.url}`, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForTimeout(2000);
    const results = await new AxeBuilder({ page }).analyze();
    const critical = results.violations.filter(v => v.impact === 'critical');
    const serious = results.violations.filter(v => v.impact === 'serious');
    console.log(`${p.name}: ${results.violations.length} violations | critical:${critical.length} serious:${serious.length}`);
    results.violations.forEach(v => console.log(`  [${v.impact?.toUpperCase()}] ${v.id}: ${v.description}`));
    expect(critical.length, `Critical violations on ${p.name}`).toBe(0);
    expect(serious.length, `Serious violations on ${p.name}`).toBe(0);
  });
}
