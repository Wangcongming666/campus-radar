import { test, expect } from '@playwright/test';

test('table previews preserve filters, view and sorting and all company filters are available', async ({
  page,
}) => {
  await page.goto('/jobs?city=深圳&role=前端开发&view=table&sort=deadline');
  await page.getByRole('link', { name: '前端开发工程师', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  const opened = new URL(page.url());
  expect(opened.searchParams.get('city')).toBe('深圳');
  expect(opened.searchParams.get('role')).toBe('前端开发');
  expect(opened.searchParams.get('view')).toBe('table');
  expect(opened.searchParams.get('sort')).toBe('deadline');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toBeHidden();
  expect(new URL(page.url()).searchParams.get('view')).toBe('table');
  await page.getByRole('button', { name: /^华为/ }).click();
  await expect(page.locator('main')).toContainText('还没有探测到匹配的岗位');
});

test('job detail uses profile terms and explicit official portal while unknown company experience stays empty', async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      'campus-radar-demo-v1',
      JSON.stringify({
        version: 0,
        state: {
          favorites: [],
          applications: [],
          completed: [],
          userName: '王同学',
          profileComplete: true,
          notifications: [],
          notes: {
            'onboarding-profile': JSON.stringify({
              name: '王同学',
              degree: '本科',
              year: '2027',
              roles: ['前端开发'],
              cities: ['深圳'],
              resumeText: 'JavaScript React TypeScript Vue 工程化',
            }),
          },
        },
      }),
    );
  });
  await page.goto('/jobs/job-1');
  await expect(page.getByLabel('本机规则匹配依据')).toContainText('你的方向：前端开发');
  await expect(page.getByLabel('本机规则匹配依据')).toContainText('岗位：深圳');
  await expect(page.locator('main')).toContainText('简历与岗位关键词交集：');
  await expect(page.getByRole('link', { name: '前往官方招聘门户' })).toHaveAttribute(
    'href',
    'https://careers.tencent.com/',
  );
  await expect(page.locator('main')).toContainText('不代表该样本岗位真实存在');
  await page.goto('/jobs/job-9');
  await page.getByRole('tab', { name: '相关面经', exact: true }).click();
  await expect(page.locator('main')).toContainText('这家公司还没有对应面经');
});

test('registration keeps return destination and onboarding resumes drafts, parses a sample and creates planner tasks', async ({
  page,
}) => {
  const destination = '/questions?topic=React';
  await page.goto(`/login?returnTo=${encodeURIComponent(destination)}`);
  await page.getByRole('link', { name: '创建演示资料', exact: true }).click();
  expect(new URL(page.url()).searchParams.get('returnTo')).toBe(destination);
  await page.getByLabel('演示昵称', { exact: true }).fill('引导验收同学');
  await page.getByLabel('演示邮箱', { exact: true }).fill('student@example.com');
  await page.getByLabel('演示口令（不保存）', { exact: true }).fill('demo2027');
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: '创建演示资料', exact: true }).click();
  await expect(page.getByRole('heading', { name: '先认识一下，未来的职场人。' })).toBeVisible();
  expect(new URL(page.url()).searchParams.get('returnTo')).toBe(destination);
  await page.getByLabel('学校（选填）').fill('本机验收大学');
  await page.getByRole('button', { name: '下一步', exact: true }).click();
  await page.getByRole('button', { name: '解析示例简历', exact: true }).click();
  await expect(page.getByLabel('简历提取文字（可校正）')).toHaveValue(/校园活动平台/);
  await page.getByRole('button', { name: '下一步', exact: true }).click();
  await page.getByRole('button', { name: '后端开发', exact: true }).click();
  await page.reload();
  await expect(page.getByRole('button', { name: '后端开发', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.getByRole('button', { name: '下一步', exact: true }).click();
  await expect(page.locator('main')).toContainText('完成 后端开发 方向的一轮基础题练习');
  await page.getByRole('button', { name: '保存计划并进入工作台' }).click();
  await expect(page).toHaveURL(/\/questions\?topic=React$/);
  await page.goto('/planner');
  await expect(page.locator('main')).toContainText('完成 后端开发 方向的一轮基础题练习');
});

test('onboarding reads an actual local TXT and shares its persisted resume with the version library', async ({
  page,
}) => {
  await page.goto('/onboarding');
  await page.getByRole('button', { name: '下一步', exact: true }).click();
  await page.getByLabel('选择本机简历文件').setInputFiles({
    name: '后端开发验收.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('2028届 硕士\n技能：Java SQL\n项目：检索服务\n实习：后端研发'),
  });
  await expect(page.getByLabel('简历提取文字（可校正）')).toHaveValue(/检索服务/);
  await expect(page.locator('main')).toContainText('本地识别 2 项技能');
  await page.reload();
  await expect(page.getByLabel('简历提取文字（可校正）')).toHaveValue(/2028届 硕士/);
  await page.goto('/resumes');
  await expect(page.locator('main')).toContainText('后端开发验收');
  await expect(page.locator('main')).toContainText('检索服务');
});

test('onboarding cannot navigate away or partially save profile when planner persistence fails', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === 'radar-extended-planner-tasks-v2')
        throw new DOMException('Full', 'QuotaExceededError');
      return original.call(this, key, value);
    };
  });
  await page.goto('/onboarding?returnTo=%2Fquestions');
  await page.getByLabel('如何称呼你').fill('保存失败验收');
  await page.getByRole('button', { name: '下一步', exact: true }).click();
  await page.getByRole('button', { name: '跳过，下一步', exact: true }).click();
  await page.getByRole('button', { name: '下一步', exact: true }).click();
  const beforeProfile = await page.evaluate(() => localStorage.getItem('campus-radar-demo-v1'));
  await page.getByRole('button', { name: '保存计划并进入工作台' }).click();
  await expect(page.getByRole('main').getByRole('alert')).toContainText('保存未完成');
  expect(await page.evaluate(() => localStorage.getItem('campus-radar-demo-v1'))).toBe(
    beforeProfile,
  );
  await expect(page).toHaveURL(/\/onboarding\?returnTo=/);
  expect(
    await page.evaluate(() => localStorage.getItem('radar-extended-planner-tasks-v2')),
  ).toBeNull();
});
