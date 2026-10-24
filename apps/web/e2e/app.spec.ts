import { test, expect } from '@playwright/test';
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
test('every product route renders without runtime errors', async ({ page }) => {
  test.setTimeout(180000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  for (const route of routes) {
    const response = await page.goto(route, { waitUntil: 'domcontentloaded' });
    expect(response?.status(), route).toBe(200);
    await expect(page.locator('h1').first(), route).toBeVisible();
  }
  expect(errors).toEqual([]);
});
test('job filters use shareable URLs and preview supports keyboard closing', async ({ page }) => {
  await page.goto('/jobs?city=北京&role=前端开发');
  await expect(page.locator('main')).toContainText('共 2 个符合条件的岗位');
  await page.getByRole('link', { name: '前端研发工程师 — 抖音', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('dialog')).toContainText('岗位职责');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toBeHidden();
  expect(page.url()).toContain('city=');
  expect(page.url()).not.toContain('preview=');
});
test('saved jobs persist after refresh', async ({ page }) => {
  await page.goto('/jobs?q=小米');
  const favorite = page.getByRole('button', { name: '收藏', exact: true });
  await favorite.click();
  await page.reload();
  await expect(page.getByRole('button', { name: '取消收藏', exact: true })).toBeVisible();
  await page.goto('/favorites?type=job');
  await expect(page.locator('main')).toContainText('产品经理');
});
test('pipeline can move a card, undo the move and save notes', async ({ page }) => {
  await page.goto('/pipeline');
  const picker = page.getByRole('combobox', { name: '移动 游戏客户端开发工程师 的阶段' });
  await picker.selectOption('OFFER');
  await expect(picker).toHaveValue('OFFER');
  await page.getByRole('button', { name: '撤销最近移动' }).click();
  await expect(picker).toHaveValue('PENDING');
  await page.getByRole('button', { name: '游戏客户端开发工程师', exact: true }).click();
  await page.getByLabel('我的笔记与下一步计划').fill('准备好演示项目，明天完成投递');
  await page.getByRole('button', { name: '保存笔记', exact: true }).click();
  await page.keyboard.press('Escape');
  await page.reload();
  await expect(page.locator('main')).toContainText('准备好演示项目，明天完成投递');
});
test('command search reaches questions and theme can be changed', async ({ page }) => {
  await page.goto('/jobs');
  await page.getByRole('button', { name: '全局搜索', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await dialog.getByRole('combobox').fill('事件循环');
  await page.getByRole('option').filter({ hasText: '事件循环' }).first().click();
  await expect(page).toHaveURL(/\/questions\?preview=/);
  await page.keyboard.press('Escape');
  const before = await page.locator('html').getAttribute('class');
  await page.getByRole('button', { name: '切换明暗主题' }).click();
  await expect.poll(() => page.locator('html').getAttribute('class')).not.toBe(before);
});
test('mobile workspace fills viewport and has no page overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const route of ['/jobs', '/pipeline', '/experiences', '/offer-compare', '/settings']) {
    await page.goto(route, { waitUntil: 'networkidle' });
    const dimensions = await page.evaluate(() => ({
      viewport: innerWidth,
      width: document.documentElement.scrollWidth,
      mainX: document.querySelector('main')?.getBoundingClientRect().x,
    }));
    expect(dimensions.width, route).toBeLessThanOrEqual(dimensions.viewport);
    expect(dimensions.mainX, route).toBe(0);
  }
  await page.goto('/jobs');
  await expect(page.getByRole('navigation', { name: '底部导航' })).toBeVisible();
  await page.getByRole('button', { name: '打开导航', exact: true }).click();
  await expect(page.getByRole('complementary', { name: '主导航' })).toBeVisible();
});

test('calendar detects overlapping interviews', async ({ page }) => {
  await page.goto('/calendar');
  await page.getByRole('button', { name: '新建日程', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('日程标题').fill('临时技术面谈');
  await dialog.getByLabel('日期', { exact: true }).fill('2026-10-23');
  await dialog.getByLabel('时间', { exact: true }).fill('14:30');
  await dialog.getByRole('button', { name: '保存到本机日程' }).click();
  await expect(page.getByRole('alert').filter({ hasText: '日程时间重叠' })).toBeVisible();
});
test('mock practice produces an input-driven local report with per-question review', async ({
  page,
}) => {
  await page.goto('/mock');
  await page.getByRole('button', { name: '开始本地模拟', exact: true }).click();
  await page.getByRole('textbox').fill('事件循环在每个宏任务后清空微任务队列，再在合适时机渲染。');
  await page.getByRole('button', { name: '下一题', exact: true }).click();
  await page.getByRole('textbox').fill('Fiber 将渲染工作拆成可调度的单元。');
  await page.getByRole('button', { name: '下一题', exact: true }).click();
  await page.getByRole('textbox').fill('先测量，再用虚拟列表减少同时渲染的节点。');
  await page.getByRole('button', { name: '结束并查看报告' }).click();
  await expect(page.getByText('逐题回顾', { exact: true })).toBeVisible();
  await expect(page.getByRole('img', { name: /本地规则评分雷达/ })).toBeVisible();
  await expect(
    page.getByText('事件循环在每个宏任务后清空微任务队列，再在合适时机渲染。', { exact: true }),
  ).toBeVisible();
});
