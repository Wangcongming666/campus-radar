import { test, expect, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';

// No page.route() stubs: browser → Next API → restricted login → real PostgreSQL.
// The runner creates and drops a disposable database, never the business DB.
async function account(page: Page) {
  const email = `browser-${randomUUID()}@example.invalid`;
  const password = `Campus-${randomUUID()}-2026`;
  await page.goto('/register');
  await page.getByLabel('昵称', { exact: true }).fill('数据库验收同学');
  await page.getByLabel('邮箱', { exact: true }).fill(email);
  await page.getByLabel('密码', { exact: true }).fill(password);
  await page.getByRole('button', { name: '注册', exact: true }).click();
  await expect(page.getByRole('heading', { name: /已创建/ })).toBeVisible();
  await page.goto('/login');
  await page.getByLabel('邮箱', { exact: true }).fill(email);
  await page.getByLabel('密码', { exact: true }).fill(password);
  await page.getByRole('button', { name: '登录', exact: true }).click();
  await expect(page).not.toHaveURL(/\/login/);
  await page.goto('/jobs');
  await expect(page.getByRole('button', { name: '全局搜索', exact: true })).toBeVisible();
  return { email, password };
}
async function workspace(page: Page) {
  const response = await page.request.get('/api/v1/workspace');
  expect(response.status()).toBe(200);
  return (await response.json()).data.records;
}
async function withoutLocalState(page: Page) {
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.getByRole('button', { name: '全局搜索', exact: true })).toBeVisible();
}
test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  (page as Page & { runtimeErrors?: string[] }).runtimeErrors = errors;
});
test.afterEach(async ({ page }) => {
  expect((page as Page & { runtimeErrors?: string[] }).runtimeErrors).toEqual([]);
});

test('official catalog, drawer, favorite, pipeline and account isolation persist in PostgreSQL', async ({ page, browser }) => {
  await account(page);
  const catalog = await (await page.request.get('/api/v1/catalog')).json();
  expect(catalog.data.jobs).toHaveLength(20);
  expect(catalog.data.companies.some((company: { name: string }) => company.name.includes('小米'))).toBe(true);
  const job = catalog.data.jobs[0];
  await page.getByRole('link', { name: job.title, exact: true }).first().click();
  await expect(page.getByRole('dialog')).toContainText(job.title);
  await page.getByRole('button', { name: '收藏预览内容', exact: true }).click();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: '加入投递', exact: true }).first().click();
  await expect.poll(async () => (await (await page.request.get('/api/v1/applications')).json()).data.items.length).toBe(1);
  await page.goto('/pipeline');
  const picker = page.getByRole('combobox', { name: `移动 ${job.title} 的阶段` });
  await picker.selectOption('INTERVIEW_1');
  await expect(picker).toHaveValue('INTERVIEW_1');
  await page.getByRole('button', { name: job.title, exact: true }).click();
  await page.getByLabel('我的笔记与下一步计划').fill('保存在数据库里的项目复盘计划');
  await page.getByRole('button', { name: '保存笔记', exact: true }).click();
  await expect(page.getByText('笔记已保存', { exact: true })).toBeVisible();
  await withoutLocalState(page);
  await page.getByRole('button', { name: job.title, exact: true }).click();
  await expect(page.getByLabel('我的笔记与下一步计划')).toHaveValue('保存在数据库里的项目复盘计划');
  await page.keyboard.press('Escape');
  await expect(picker).toHaveValue('INTERVIEW_1');
  const favorites = await (await page.request.get('/api/v1/favorites')).json();
  expect(favorites.data.some((value: { targetId: string }) => value.targetId === job.id)).toBe(true);
  const application = (await (await page.request.get('/api/v1/applications')).json()).data.items[0];
  await page.goto(`/interview/${application.id}/timeline`);
  await page.getByRole('button', { name: '添加面试轮次', exact: true }).click();
  const roundDialog = page.getByRole('dialog');
  await roundDialog.getByLabel('轮次名称', { exact: true }).fill('数据库项目深挖');
  await roundDialog.getByLabel('题目与准备要点', { exact: true }).fill('解释方案约束和验证方法');
  await roundDialog.getByRole('button', { name: '保存面试轮次', exact: true }).click();
  await expect(roundDialog).toBeHidden();
  await withoutLocalState(page);
  await page.getByRole('button', { name: /数据库项目深挖/ }).click();
  await page.getByRole('link', { name: '打开本轮复盘', exact: true }).click();
  await page.getByLabel('面试转写文字', { exact: true }).fill('背景是查询性能下降，任务是定位瓶颈。我通过执行计划测量耗时，最后对比验证结果。');
  await page.getByLabel('我的复盘笔记', { exact: true }).fill('保存在真实数据库的复盘笔记');
  await page.getByRole('button', { name: '保存复盘', exact: true }).click();
  await expect(page.getByText('转写、笔记与自评已保存', { exact: true })).toBeVisible();
  await withoutLocalState(page);
  await expect(page.getByLabel('我的复盘笔记', { exact: true })).toHaveValue('保存在真实数据库的复盘笔记');
  const other = await browser.newContext();
  try {
    const otherPage = await other.newPage();
    await account(otherPage);
    expect((await (await otherPage.request.get('/api/v1/applications')).json()).data.items).toEqual([]);
    expect((await (await otherPage.request.get('/api/v1/favorites')).json()).data).toEqual([]);
    expect(await workspace(otherPage)).toEqual({});
  } finally { await other.close(); }
  await page.goto('/pipeline');
  await expect(page.getByRole('heading', { name: '投递看板', exact: true })).toBeVisible();
  await page.screenshot({ path: '../../artifacts/qa/real-api-pipeline.png', fullPage: true });
});

test('planner, calendar, offer weights and subscription writes survive cleared browser storage', async ({ page }) => {
  await account(page);
  await page.goto('/planner');
  await page.getByRole('button', { name: '新增里程碑', exact: true }).click();
  let dialog = page.getByRole('dialog');
  await dialog.getByLabel('里程碑名称').fill('数据库校招里程碑');
  await dialog.getByLabel('目标日期').fill('2026-11-01');
  await dialog.getByRole('button', { name: '保存里程碑' }).click();
  await expect(dialog).toBeHidden();
  await withoutLocalState(page);
  await expect(page.getByRole('heading', { name: '数据库校招里程碑' })).toBeVisible();
  await page.goto('/calendar');
  await page.getByRole('button', { name: '新建日程', exact: true }).click();
  dialog = page.getByRole('dialog');
  await dialog.getByLabel('日程标题', { exact: true }).fill('数据库面试安排');
  await dialog.getByLabel('日期', { exact: true }).fill('2026-10-24');
  await dialog.getByLabel('时间', { exact: true }).fill('09:00');
  await dialog.getByRole('button', { name: /保存.*日程/ }).click();
  await expect(dialog).toBeHidden();
  await withoutLocalState(page);
  await expect(page.getByRole('button', { name: /09:00.*数据库面试安排/ })).toBeVisible();
  await page.goto('/offer-compare');
  await page.getByRole('button', { name: '新增 Offer', exact: true }).click();
  dialog = page.getByRole('dialog');
  await dialog.getByLabel('公司', { exact: true }).fill('用户自行记录的公司');
  await dialog.getByLabel('岗位名称').fill('校招研发');
  await dialog.getByLabel('工作城市').fill('北京');
  await dialog.getByLabel('月薪（K）').fill('30');
  await dialog.getByRole('button', { name: '保存 Offer' }).click();
  await expect(dialog).toBeHidden();
  await page.getByLabel('技术成长权重（0–100）').fill('37');
  await page.getByLabel('技术成长权重（0–100）').blur();
  await expect.poll(async () => (await workspace(page))['offer-dimensions-v2']?.value?.find((v: { name: string }) => v.name === '技术成长')?.weight).toBe(37);
  await withoutLocalState(page);
  await expect(page.getByLabel('技术成长权重（0–100）')).toHaveValue('37');
  await expect(page.getByRole('row').filter({ hasText: '用户自行记录的公司' })).toBeVisible();
  await page.goto('/subscriptions');
  await page.getByRole('button', { name: '新建订阅', exact: true }).click();
  dialog = page.getByRole('dialog');
  await dialog.getByLabel('订阅名称').fill('数据库订阅');
  await dialog.getByRole('button', { name: '保存订阅', exact: true }).click();
  await expect(dialog).toBeHidden();
  await withoutLocalState(page);
  await expect(page.getByRole('heading', { name: '数据库订阅' })).toBeVisible();
});

test('private resume bytes, original experience, discussion and native backup are real server records', async ({ page }) => {
  await account(page);
  const content = '教育背景\nReact TypeScript PostgreSQL\n项目中通过测量优化查询性能';
  await page.goto('/resumes');
  await page.getByRole('button', { name: '上传简历版本', exact: true }).click();
  await page.getByLabel('简历文件', { exact: true }).setInputFiles({ name: '数据库简历.txt', mimeType: 'text/plain', buffer: Buffer.from(content) });
  await page.getByRole('button', { name: '保存简历版本', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeHidden();
  await withoutLocalState(page);
  await expect(page.getByLabel('简历提取文字', { exact: true })).toHaveValue(content);
  const downloadEvent = page.waitForEvent('download');
  await page.getByRole('button', { name: '下载原文件' }).click();
  const download = await downloadEvent;
  expect(await readFile((await download.path())!, 'utf8')).toBe(content);
  await page.goto('/experiences');
  await page.getByRole('button', { name: '写一篇面经' }).click();
  await page.getByLabel('面经标题', { exact: true }).fill('数据库原创面经验收');
  await page.getByLabel('复盘内容', { exact: true }).fill('这是测试用户自己提交的面试复盘内容。项目中讨论了如何验证数据库查询性能，下一次补充指标与约束。');
  await page.getByRole('button', { name: '发布面经', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeHidden();
  await page.getByRole('heading', { name: '数据库原创面经验收', exact: true }).click();
  await expect(page).toHaveURL(/\/experiences\/[a-f0-9-]{36}$/);
  await page.getByLabel('讨论内容').fill('记录在当前账号数据库中的讨论');
  await page.getByRole('button', { name: '保存讨论' }).click();
  await expect(page.locator('main')).toContainText('记录在当前账号数据库中的讨论');
  await withoutLocalState(page);
  await expect(page.locator('main')).toContainText('记录在当前账号数据库中的讨论');
  await page.goto('/settings');
  await page.getByLabel('包含简历与录音附件（合计最多 50 MB）').check();
  const backupDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: '导出账号备份', exact: true }).click();
  const backup = JSON.parse(await readFile((await (await backupDownload).path())!, 'utf8'));
  expect(JSON.stringify(backup)).toContain('数据库简历.txt');
  expect(JSON.stringify(backup)).toContain('数据库原创面经验收');
  expect(JSON.stringify(backup)).not.toContain('passwordHash');
  await page.getByRole('button', { name: '清空私有数据', exact: true }).click();
  await page.getByRole('button', { name: '确认清空本账户私有数据', exact: true }).click();
  await expect.poll(async () => Object.keys(await workspace(page)).length).toBe(0);
  await page.getByLabel('导入账号备份文件').setInputFiles({ name: 'native-backup.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(backup)) });
  await page.getByRole('button', { name: '确认替换并恢复账号备份', exact: true }).click();
  await expect.poll(async () => (await workspace(page))['resume-library-v2']?.value?.length).toBe(1);
  await page.goto('/resumes');
  await expect(page.getByLabel('简历提取文字', { exact: true })).toHaveValue(content);
  const restoredFile = page.waitForEvent('download');
  await page.getByRole('button', { name: '下载原文件' }).click();
  expect(await readFile((await (await restoredFile).path())!, 'utf8')).toBe(content);
  await page.goto('/settings');
  await expect(page.getByRole('button', { name: '导出账号备份', exact: true })).toBeVisible();
  await page.screenshot({ path: '../../artifacts/qa/real-api-settings.png', fullPage: true });
  await page.goto('/community');
  await page.getByRole('button', { name: '记录动态', exact: true }).click();
  await page.getByLabel('动态内容', { exact: true }).fill('数据库中的个人准备动态');
  await page.getByRole('button', { name: '保存动态', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeHidden();
  await page.getByRole('button', { name: '交流讨论', exact: true }).click();
  const discussion = page.getByRole('dialog');
  await discussion.getByLabel('讨论内容').fill('数据库中的动态讨论');
  await discussion.getByRole('button', { name: '保存讨论', exact: true }).click();
  await expect(discussion).toContainText('数据库中的动态讨论');
  await page.keyboard.press('Escape');
  await withoutLocalState(page);
  await page.getByRole('button', { name: '交流讨论', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('数据库中的动态讨论');
});

test('all independent API routes render without demo records or runtime exceptions', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('20 个已收录岗位', { exact: true })).toBeVisible();
  await expect(page.getByText('官方公开来源 · 注册后保存你的求职进度')).toBeVisible();
  await account(page);
  const targetTheme = (await page.locator('html').getAttribute('class'))?.includes('dark') ? 'light' : 'dark';
  await page.getByRole('button', { name: '切换明暗主题', exact: true }).click();
  await expect.poll(async () => (await (await page.request.get('/api/v1/me')).json()).data.theme).toBe(targetTheme);
  await withoutLocalState(page);
  await expect(page.locator('html')).toHaveClass(new RegExp(targetTheme));
  const catalog = (await (await page.request.get('/api/v1/catalog')).json()).data;
  const paths = ['/jobs','/jobs/' + catalog.jobs[0].id, '/company/' + catalog.companies[0].id,
    '/subscriptions','/referral','/pipeline','/calendar','/analytics','/resumes','/mock',
    '/style/' + catalog.companies[0].id, '/experiences','/questions','/handbook',
    '/pack/' + catalog.companies[0].id, '/resume-check','/planner','/salary','/offer-compare',
    '/community','/buddy','/radar','/me','/favorites','/notifications','/settings'];
  for (const path of paths) {
    await page.goto(path);
    await expect(page.locator('main')).toBeVisible();
    await expect(page.getByRole('button', { name: '全局搜索', exact: true })).toBeVisible();
    await expect(page.locator('main')).not.toContainText('正在接入云端');
    await expect(page.locator('main')).not.toContainText('游戏客户端开发工程师');
  }
  await page.setViewportSize({ width: 390, height: 844 });
  for (const path of ['/jobs', '/pipeline', '/settings', '/resumes']) {
    await page.goto(path);
    await expect(page.getByRole('button', { name: '全局搜索', exact: true })).toBeVisible();
    const width = await page.evaluate(() => ({ content: document.documentElement.scrollWidth, viewport: innerWidth }));
    expect(width.content, path).toBeLessThanOrEqual(width.viewport);
  }
  await page.screenshot({ path: '../../artifacts/qa/real-api-mobile.png', fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/jobs');
  await expect(page.getByRole('heading', { name: '岗位广场', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '加入投递', exact: true }).first()).toBeVisible();
  await page.screenshot({ path: '../../artifacts/qa/real-api-jobs.png', fullPage: true });
});

test('a conflicting save preserves the editor and can recover without a full reload', async ({ page }) => {
  await account(page);
  await page.goto('/planner');
  await page.getByRole('button', { name: '新增里程碑', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('里程碑名称').fill('冲突前保留的当前草稿');
  await dialog.getByLabel('目标日期').fill('2026-11-10');
  const me = await page.request.get('/api/v1/me');
  const remote = [{ id: 'other-tab-milestone', title: '另一窗口的新记录', date: '2026-11-01' }];
  const write = await page.request.put('/api/v1/workspace/records/planner-milestones-v2', {
    headers: { Origin: 'http://127.0.0.1:3300', 'X-CSRF-Token': me.headers()['x-csrf-token'] },
    data: { value: remote, expectedVersion: 0 },
  });
  expect(write.status(), await write.text()).toBe(200);
  await dialog.getByRole('button', { name: '保存里程碑' }).click();
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel('里程碑名称')).toHaveValue('冲突前保留的当前草稿');
  await dialog.getByRole('button', { name: '载入服务器最新版本' }).click();
  await expect(dialog.getByRole('button', { name: '载入服务器最新版本' })).toBeHidden();
  await expect(dialog.getByLabel('里程碑名称')).toHaveValue('冲突前保留的当前草稿');
  await dialog.getByRole('button', { name: '保存里程碑' }).click();
  await expect(dialog).toBeHidden();
  await withoutLocalState(page);
  await expect(page.getByRole('heading', { name: '另一窗口的新记录' })).toBeVisible();
  await expect(page.getByRole('heading', { name: '冲突前保留的当前草稿' })).toBeVisible();
});

test('manual source-linked job entry saves actual fields and leaves unknown facts empty', async ({ page }) => {
  await account(page);
  await page.getByRole('button', { name: '录入岗位', exact: true }).click();
  const drawer = page.getByRole('dialog');
  await drawer.getByLabel('公司名称', { exact: true }).fill('验收用户自行录入公司');
  await drawer.getByLabel('岗位名称', { exact: true }).fill('用户来源记录验收岗位');
  await drawer.getByLabel('岗位方向', { exact: true }).fill('frontend');
  await drawer.getByLabel('工作城市', { exact: true }).fill('上海');
  await drawer.getByLabel('真实来源链接', { exact: true }).fill('https://careers.example.invalid/campus/entry');
  await drawer.getByLabel('届别', { exact: true }).fill('2027');
  await drawer.getByLabel('岗位说明', { exact: true }).fill('这是隔离数据库中用户手动填写的说明，并非已核验官方招聘信息。');
  await drawer.getByRole('button', { name: '保存到云端目录', exact: true }).click();
  await expect(drawer).toBeHidden();
  await withoutLocalState(page);
  const catalog = (await (await page.request.get('/api/v1/catalog')).json()).data;
  const job = catalog.jobs.find((item: { title: string }) => item.title === '用户来源记录验收岗位');
  expect(job.canonicalUrl).toBe('https://careers.example.invalid/campus/entry');
  expect(job.education).toBe('学历未注明');
  const dto = (await (await page.request.get('/api/v1/jobs/' + job.id)).json()).data;
  expect(dto.education).toBeNull();
  expect(dto.publishedAt).toBeNull();
  expect(dto.publishedPrecision).toBe('unknown');
  expect(dto.verifiedAt).toBeNull();
  expect(dto.source.name).toContain('官方未核验');
});
