import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
});

test('subscription matches local jobs, records hits, edits, pauses and deletes', async ({
  page,
}) => {
  await page.goto('/subscriptions');
  await page.getByRole('button', { name: '新建订阅', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('订阅名称').fill('深圳React订阅');
  await dialog.getByLabel('岗位方向', { exact: true }).selectOption('前端开发');
  await dialog.getByLabel('工作城市').selectOption('深圳');
  await dialog.getByLabel('岗位关键词').fill('React');
  await expect(dialog).toContainText('当前条件命中');
  await dialog.getByRole('button', { name: '保存订阅', exact: true }).click();
  await expect(dialog).toBeHidden();
  await page.getByRole('button', { name: '命中记录', exact: true }).click();
  await expect(dialog.getByRole('link', { name: '前端开发工程师' })).toBeVisible();
  await dialog.getByRole('button', { name: '全部标记已读' }).click();
  await expect(dialog.getByText('已读', { exact: true }).first()).toBeVisible();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: '暂停', exact: true }).click();
  await expect(page.getByText('已暂停', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '编辑', exact: true }).click();
  await dialog.getByLabel('订阅名称').fill('修改后的订阅');
  await dialog.getByRole('button', { name: '保存订阅' }).click();
  await page.reload();
  await expect(page.getByRole('heading', { name: '修改后的订阅' })).toBeVisible();
  await page.getByRole('button', { name: '删除', exact: true }).click();
  await expect(page.getByText('还没有订阅信号')).toBeVisible();
});

test('referral records remain local and support progress changes', async ({ page }) => {
  await page.goto('/referral');
  await page.getByRole('button', { name: '新增内推进度', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('目标岗位').fill('研发校招联系记录');
  await dialog.getByLabel('联系人备注').fill('本人自行联系的校友');
  await dialog.getByRole('button', { name: '保存进度' }).click();
  await expect(page.getByText('腾讯 · 研发校招联系记录')).toBeVisible();
  await page.getByRole('button', { name: '编辑进度' }).click();
  await dialog.locator('select').last().selectOption('已自行联系');
  await dialog.getByLabel('进度备注').fill('已通过官方渠道核实身份');
  await dialog.getByRole('button', { name: '保存进度' }).click();
  await page.reload();
  await expect(page.getByText('已通过官方渠道核实身份')).toBeVisible();
  await page.getByRole('button', { name: '删除', exact: true }).click();
  await expect(page.getByText('暂无记录，选择内推卡片或新增自己的联系记录。')).toBeVisible();
});

test('planner milestones and tasks support state moves and persistence', async ({ page }) => {
  await page.goto('/planner');
  await page.getByRole('button', { name: '新增里程碑', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('里程碑名称').fill('完成秋招首轮');
  await dialog.getByLabel('目标日期').fill('2026-11-01');
  await dialog.getByRole('button', { name: '保存里程碑' }).click();
  await page.getByRole('button', { name: '新增任务', exact: true }).click();
  await dialog.getByLabel('任务名称').fill('复习浏览器原理');
  const id = await dialog.getByLabel('所属里程碑').locator('option').last().getAttribute('value');
  await dialog.getByLabel('所属里程碑').selectOption(id!);
  await dialog.getByLabel('截止日期').fill('2026-10-01');
  await dialog.getByRole('button', { name: '保存任务' }).click();
  await page.getByLabel('复习浏览器原理的任务状态').selectOption('已完成');
  await page.reload();
  await expect(page.getByLabel('复习浏览器原理的任务状态')).toHaveValue('已完成');
  await page.getByRole('button', { name: '删除里程碑' }).click();
  await expect(page.getByRole('heading', { name: '复习浏览器原理' })).toBeVisible();
  await page.getByRole('button', { name: '删除', exact: true }).click();
  await expect(page.getByRole('heading', { name: '复习浏览器原理' })).toHaveCount(0);
});

test('salary form contributes actual sample, quantiles and comparison', async ({ page }) => {
  await page.goto('/salary');
  await page.getByRole('button', { name: '添加薪资爆料' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('岗位方向', { exact: true }).fill('前端开发');
  await dialog.getByLabel('城市', { exact: true }).fill('深圳');
  await dialog.getByLabel('月薪（K）').fill('40');
  await dialog.getByLabel('薪资月数').fill('16');
  await dialog.getByLabel('保证奖金（K）').fill('10');
  await dialog.getByLabel('备注（不填写个人信息）').fill('测试保证薪酬记录');
  await dialog.getByRole('button', { name: '保存薪资记录' }).click();
  const row = page.getByRole('row').filter({ hasText: '测试保证薪酬记录' });
  await expect(row).toContainText('65.0 万');
  await row.getByRole('checkbox').check();
  await expect(page.getByText('公司与岗位对比', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText('测试保证薪酬记录')).toBeVisible();
  await row.getByRole('button', { name: '删除', exact: true }).click();
  await expect(page.getByText('测试保证薪酬记录')).toHaveCount(0);
});

test('offer comparison computes scores, handles zero weights and exports', async ({ page }) => {
  await page.goto('/offer-compare');
  await page.getByRole('button', { name: '新增 Offer', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('公司', { exact: true }).fill('本地测试公司');
  await dialog.getByLabel('岗位名称').fill('前端岗位');
  await dialog.getByLabel('工作城市').fill('杭州');
  await dialog.getByLabel('月薪（K）').fill('30');
  await dialog.getByLabel('薪资月数').fill('16');
  await dialog.getByLabel('技术成长评分（0–100）').fill('90');
  await dialog.getByRole('button', { name: '保存 Offer' }).click();
  await expect(page.getByRole('row').filter({ hasText: '本地测试公司' })).toContainText('48.0 万');
  await page.getByLabel('新增维度名称').fill('稳定性');
  await page.getByRole('button', { name: '添加维度', exact: true }).click();
  await expect(page.getByRole('columnheader', { name: '稳定性' })).toBeVisible();
  const downloadEvent = page.waitForEvent('download');
  await page.getByRole('button', { name: '导出对比 CSV' }).click();
  expect((await downloadEvent).suggestedFilename()).toBe('Offer决策对比.csv');
  for (const name of ['保证年薪', '技术成长', '团队匹配', '生活平衡', '城市偏好', '稳定性'])
    await page.getByLabel(`${name}权重（0–100）`).fill('0');
  await expect(page.locator('main').getByRole('alert')).toContainText('总权重为 0');
  await page.reload();
  await expect(page.getByRole('row').filter({ hasText: '本地测试公司' })).toContainText(
    '待设置权重',
  );
});

test('resume diagnosis analyzes input and applies a real text rewrite', async ({ page }) => {
  await page.goto('/resume-check');
  await page
    .getByLabel('简历文本', { exact: true })
    .fill('教育：计算机本科。技能：JavaScript。项目：参与校园论坛开发，负责前端页面实现。');
  await page.getByRole('button', { name: '开始规则诊断' }).click();
  await expect(page.getByText('/ 100 · 规则得分')).toBeVisible();
  await expect(page.getByText('目标岗位尚未出现的关键词')).toBeVisible();
  await page.getByRole('button', { name: '应用此条建议' }).first().click();
  await expect(page.getByLabel('简历文本', { exact: true })).toHaveValue(/可核实的结果/);
  const downloadEvent = page.waitForEvent('download');
  await page.getByRole('button', { name: '下载当前文本' }).click();
  expect((await downloadEvent).suggestedFilename()).toBe('优化简历.txt');
});

test('company notes, checklist and result timeline are editable local records', async ({
  page,
}) => {
  await page.goto('/company/tencent');
  await page.getByRole('button', { name: '员工评价', exact: true }).click();
  await page.getByRole('button', { name: '新增团队评价' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('记录标题').fill('我的团队沟通记录');
  await dialog.getByLabel('事实、感受与来源').fill('面试中确认有定期代码评审，具体安排仍需核实。');
  await dialog.getByRole('button', { name: '保存公司记录' }).click();
  await expect(page.getByRole('heading', { name: '我的团队沟通记录' })).toBeVisible();
  await page.getByRole('button', { name: '开奖时间轴', exact: true }).click();
  await page.getByRole('button', { name: '新增开奖记录' }).click();
  await dialog.getByLabel('事件标题').fill('收到本人二面通知');
  await dialog.getByLabel('对应岗位').fill('前端开发');
  await dialog.getByRole('button', { name: '保存开奖记录' }).click();
  await page.reload();
  await page.getByRole('button', { name: '开奖时间轴', exact: true }).click();
  await expect(page.getByRole('heading', { name: /收到本人二面通知/ })).toBeVisible();
  await page.getByRole('button', { name: '删除', exact: true }).click();
  await expect(page.getByText('暂无匹配的开奖记录。')).toBeVisible();
});

test('analytics derives daily values from persisted applications and honors archived filter', async ({
  page,
}) => {
  await page.evaluate(() => {
    const date = new Date().toLocaleDateString('sv-SE');
    localStorage.setItem(
      'campus-radar-demo-v1',
      JSON.stringify({
        state: {
          favorites: [],
          applications: [
            {
              id: 'analytics-1',
              jobId: 'job-1',
              stage: 'OFFER',
              notes: '',
              date,
              appliedAt: date,
              version: 1,
            },
            {
              id: 'analytics-2',
              jobId: 'job-2',
              stage: 'APPLIED',
              notes: '',
              date,
              appliedAt: date,
              archived: true,
              version: 1,
            },
          ],
          notes: {},
          completed: [],
          userName: '测试同学',
          profileComplete: true,
          notifications: [],
        },
        version: 0,
      }),
    );
  });
  await page.goto('/analytics');
  await page.getByText('展开每日与阶段数据').click();
  await expect(page.getByRole('row').filter({ hasText: 'Offer' })).toContainText('1');
  const today = await page.evaluate(() => new Date().toLocaleDateString('sv-SE'));
  const row = page.getByRole('row').filter({ hasText: today });
  await expect(row.getByRole('cell').nth(1)).toHaveText('1');
  await page.getByLabel('包含已归档记录').check();
  await expect(row.getByRole('cell').nth(1)).toHaveText('2');
});

test('damaged local growth records do not crash product pages', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.evaluate(() => {
    for (const key of [
      'subscriptions-v2',
      'referral-records-v2',
      'planner-tasks-v2',
      'planner-milestones-v2',
      'offers-v2',
      'resume-library-v2',
      'company-notes-v2-tencent',
      'company-results-v2-tencent',
    ])
      localStorage.setItem(`radar-extended-${key}`, JSON.stringify([null, { id: 'broken' }]));
    localStorage.setItem(
      'radar-extended-planner-reminded-v2',
      JSON.stringify({ task: { wrong: true } }),
    );
  });
  for (const route of [
    '/subscriptions',
    '/referral',
    '/planner',
    '/offer-compare',
    '/resume-check',
    '/company/tencent',
  ]) {
    await page.goto(route);
    await expect(page.locator('main h1')).toBeVisible();
    if (route === '/company/tencent') {
      await page.getByRole('button', { name: '开奖时间轴', exact: true }).click();
      await expect(page.getByText('暂无匹配的开奖记录。', { exact: true })).toBeVisible();
    }
  }
  expect(errors).toEqual([]);
});
