import { test, expect } from '@playwright/test';
import { writeFile, mkdir } from 'node:fs/promises';
const routes = [
  '/',
  '/login',
  '/register',
  '/onboarding',
  '/jobs',
  '/jobs/job-1',
  '/company/tencent',
  '/subscriptions',
  '/referral',
  '/pipeline',
  '/calendar',
  '/analytics',
  '/resumes',
  '/interview/app-1/timeline',
  '/interview/app-1/review',
  '/mock',
  '/style/tencent',
  '/experiences',
  '/experiences/exp-1',
  '/questions',
  '/handbook',
  '/pack/tencent',
  '/resume-check',
  '/planner',
  '/salary',
  '/offer-compare',
  '/community',
  '/buddy',
  '/radar',
  '/me',
  '/favorites',
  '/notifications',
  '/settings',
];

test('all 33 local product pages work at mobile width and main workspaces adapt to tablets', async ({
  page,
}) => {
  test.setTimeout(180000);
  const errors: string[] = [],
    report: { route: string; viewport: number; width: number }[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  for (const viewport of [390, 820]) {
    await page.setViewportSize({ width: viewport, height: 900 });
    for (const route of viewport === 390
      ? routes
      : ['/jobs', '/pipeline', '/calendar', '/resumes', '/questions', '/offer-compare']) {
      const response = await page.goto(route, { waitUntil: 'domcontentloaded' });
      expect(response?.status(), route).toBe(200);
      await expect(page.locator('h1').first(), route).toBeVisible();
      await expect
        .poll(() => page.evaluate(() => document.documentElement.scrollWidth), {
          message: `${route} at ${viewport}px`,
        })
        .toBeLessThanOrEqual(viewport);
      report.push({
        route,
        viewport,
        width: await page.evaluate(() => document.documentElement.scrollWidth),
      });
    }
  }
  expect(errors).toEqual([]);
  await mkdir('../../artifacts/qa', { recursive: true });
  await writeFile(
    '../../artifacts/qa/functional-responsive-report.json',
    JSON.stringify({ report, errors }, null, 2),
  );
});

test('shared tabs support keyboard selection and desktop layouts stay clear of the sidebar', async ({
  page,
}) => {
  await page.goto('/me');
  const first = page.getByRole('tab', { name: '我的概览', exact: true });
  await first.focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('tab', { name: '个人资料', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await page.keyboard.press('End');
  await expect(page.getByRole('tab', { name: '最近动态', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect
    .poll(() => page.locator('main').evaluate((node) => node.getBoundingClientRect().x))
    .toBe(248);
  for (const route of [
    '/jobs',
    '/pipeline',
    '/experiences',
    '/resumes',
    '/offer-compare',
    '/calendar',
  ]) {
    await page.goto(route);
    await page.screenshot({
      path: `../../artifacts/qa/functional-${route.slice(1)}-desktop.png`,
      fullPage: true,
      animations: 'disabled',
    });
  }
});
