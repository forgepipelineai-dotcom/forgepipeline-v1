import { test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import * as fs from 'fs';
import * as path from 'path';

const BASE = 'http://localhost:3999';
const OUTDIR = '/Users/trevoradmin/.openclaw/workspace/projects/phase-4-evidence/axe-report';

const pages = [
  { name: 'home', url: '/' },
  { name: 'auth-login', url: '/auth/login' },
  { name: 'auth-register', url: '/auth/register' },
  { name: 'onboarding', url: '/onboarding' },
  { name: 'dashboard', url: '/dashboard' },
];

test.describe('axe Accessibility Audit', () => {
  for (const p of pages) {
    test(`axe: ${p.name}`, async ({ page }) => {
      await page.goto(BASE + p.url, { waitUntil: 'domcontentloaded', timeout: 15000 });
      await page.waitForTimeout(2000);
      const results = await new AxeBuilder({ page }).analyze();
      const outFile = path.join(OUTDIR, `axe-${p.name}.json`);
      fs.writeFileSync(outFile, JSON.stringify({
        url: BASE + p.url,
        violations: results.violations,
        passes: results.passes.length,
        incomplete: results.incomplete.length,
        inapplicable: results.inapplicable.length,
        violationCount: results.violations.length,
      }, null, 2));
      console.log(`axe ${p.name}: ${results.violations.length} violations, ${results.passes.length} passes`);
    });
  }
});
