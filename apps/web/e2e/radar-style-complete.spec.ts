import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
});

test('company style computes sample topics and links both word cloud and ranked questions to the question bank', async ({
  page,
}) => {
  await page.evaluate(() =>
    localStorage.setItem(
      'radar-extended-knowledge-experiences',
      JSON.stringify([
        {
          id: 'style-e2e',
          companyId: 'tencent',
          title: 'React 组件沟通复盘',
          role: '前端开发',
          round: '一面',
          author: '本机测试',
          avatar: '本',
          date: '2026-10-23',
          readTime: '1分钟',
          tags: ['React'],
          views: 0,
          likes: 0,
          excerpt: 'React 项目原理',
          sections: [{ title: 'React 项目', content: '讨论 React 组件设计。' }],
        },
      ]),
    ),
  );
  await page.goto('/style/tencent');
  await expect(page.getByText('考察点云图 · 本机样本', { exact: true })).toBeVisible();
  await expect(page.getByText('高频题榜 · 本机关联样本', { exact: true })).toBeVisible();
  await page.getByText('查看云图计数依据', { exact: true }).click();
  await expect(page.getByText(/React：1 道关联题目 \+ \d+ 篇提及面经/)).toBeVisible();
  await page.getByRole('link', { name: /React，\d+ 条关联记录，进入题库/ }).click();
  await expect(page).toHaveURL(/\/questions\?topic=React/);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await page.goto('/style/tencent');
  await page.getByRole('link', { name: /React Fiber 如何实现可中断渲染/ }).click();
  await expect(page).toHaveURL(/question=q-2/);
  await expect(page.getByRole('dialog')).toContainText('React Fiber 如何实现可中断渲染');
});

test('radar toggles sample windows and persists followed company filtering', async ({ page }) => {
  await page.goto('/radar');
  await expect(page.getByText('公司热度排名与趋势 · 演示样本', { exact: true })).toBeVisible();
  await expect(page.getByRole('img', { name: /腾讯近 7 天每日样本趋势图/ })).toBeVisible();
  await page.getByRole('button', { name: '近 30 天', exact: true }).click();
  await expect(page.getByRole('img', { name: /腾讯近 30 天每日样本趋势图/ })).toBeVisible();
  await page.getByRole('button', { name: '关注腾讯公司', exact: true }).click();
  await page.getByRole('button', { name: '仅已关注', exact: true }).click();
  await expect(page.getByRole('table', { name: /公司样本热度排名/ }).getByRole('row')).toHaveCount(
    2,
  );
  await expect(page.getByRole('button', { name: '查看腾讯信号', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '查看字节跳动信号', exact: true })).toHaveCount(0);
  await page.reload();
  await page.getByRole('button', { name: '仅已关注', exact: true }).click();
  await expect(page.getByRole('table', { name: /公司样本热度排名/ }).getByRole('row')).toHaveCount(
    2,
  );
  await page.getByRole('button', { name: '取消关注腾讯公司', exact: true }).click();
  await expect(page.getByRole('heading', { name: '当前筛选下没有公司热度' })).toBeVisible();
});
