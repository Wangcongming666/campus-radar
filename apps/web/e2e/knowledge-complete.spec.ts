import { test, expect } from '@playwright/test';

test('authored experience is readable after reload, editable and removable', async ({ page }) => {
  await page.goto('/experiences');
  await page.getByRole('button', { name: '写一篇面经' }).click();
  await page.getByLabel('面经标题', { exact: true }).fill('本机发布与复盘验收');
  await page
    .getByLabel('复盘内容', { exact: true })
    .fill('面试讨论了事件循环和微任务。我的改进是先给出执行顺序，再用示例验证。');
  await page.getByLabel('知识标签（逗号分隔）').fill('JavaScript');
  await page.getByRole('button', { name: '发布到本机广场' }).click();
  await page.getByRole('link', { name: '本机发布与复盘验收' }).click();
  await expect(page).toHaveURL(/\/experiences\/local-exp-/);
  await page.reload();
  await expect(page.getByRole('heading', { name: '本机发布与复盘验收' })).toBeVisible();
  await page.getByRole('button', { name: '一键提炼正文重点' }).click();
  await expect(page.locator('main')).toContainText('复盘 1：我的改进');
  await page.getByRole('button', { name: '编辑面经', exact: true }).click();
  await page.getByLabel('面经标题', { exact: true }).fill('已修改的本机复盘');
  await page.getByRole('button', { name: '保存面经修改' }).click();
  await expect(page.getByRole('heading', { name: '已修改的本机复盘' })).toBeVisible();
  await page.getByLabel('讨论内容').fill('下一次补充项目约束与取舍');
  await page.getByRole('button', { name: '保存讨论' }).click();
  await page.reload();
  await expect(page.locator('main')).toContainText('下一次补充项目约束与取舍');
  await page.getByRole('button', { name: '删除面经', exact: true }).click();
  await page.getByRole('button', { name: '确认删除面经' }).click();
  await expect(page.getByRole('heading', { name: '这篇面经还未收录或已经删除' })).toBeVisible();
});

test('self assessment and company pack create persistent progress and a real collection', async ({
  page,
}) => {
  await page.goto('/pack/tencent');
  await page.getByRole('button', { name: '一键收藏与题单入库' }).click();
  await page.getByRole('link', { name: '打开入库练习集合' }).click();
  await page.getByRole('button', { name: '开始筛选结果练习' }).click();
  await expect(page.getByRole('button', { name: '需要复习 · 加入错题' })).toBeDisabled();
  await page.getByRole('button', { name: '展示参考答案' }).click();
  await page.getByRole('button', { name: '需要复习 · 加入错题' }).click();
  await page.keyboard.press('Escape');
  await page.reload();
  await page.getByRole('tab', { name: '错题本', exact: true }).click();
  await expect(page.locator('main')).toContainText('说说浏览器的事件循环机制');
});

test('community posts, replies and reports are stored locally', async ({ page }) => {
  await page.goto('/community');
  await page.getByRole('button', { name: '发布演示动态' }).click();
  await page.getByLabel('动态内容').fill('今天完成了第一轮本地题库练习');
  await page.getByRole('button', { name: '保存演示动态' }).click();
  await page.reload();
  await expect(page.locator('main')).toContainText('今天完成了第一轮本地题库练习');
  await page.getByRole('button', { name: '交流讨论' }).first().click();
  await page.getByLabel('讨论内容').fill('明天继续练习项目介绍');
  await page.getByRole('button', { name: '保存讨论' }).click();
  await page.getByRole('button', { name: '回复', exact: true }).click();
  await page.getByLabel('讨论内容').fill('加上结果验证与反思');
  await page.getByRole('button', { name: '保存讨论' }).click();
  await expect(page.getByRole('dialog')).toContainText('加上结果验证与反思');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: '举报演示内容' }).first().click();
  await page.getByRole('button', { name: '确认本机举报' }).click();
  await page.getByRole('button', { name: '我的举报', exact: true }).click();
  await expect(page.locator('main')).toContainText('已在本机隐藏');
});

test('created room shares actual question ids and persists learning notes', async ({ page }) => {
  await page.goto('/buddy');
  await page.getByRole('button', { name: '创建本机练习组' }).click();
  await page.getByLabel('练习组名称').fill('周六项目互面');
  await page.getByLabel('练习安排').fill('周六 15:00 每次四十分钟');
  await page.getByRole('checkbox').first().check();
  await page.getByRole('button', { name: '创建并加入练习组' }).click();
  await page.getByRole('button', { name: '共享题单加入我的题库' }).click();
  await page.getByLabel('组队备忘').fill('先独立作答，再对照参考要点');
  await page.getByRole('button', { name: '保存组队备忘' }).click();
  await page.keyboard.press('Escape');
  await page.reload();
  await page.getByRole('button', { name: '打开练习房间' }).click();
  await expect(page.getByRole('dialog')).toContainText('先独立作答，再对照参考要点');
  await page.keyboard.press('Escape');
  await page.goto('/questions');
  await expect(page.getByRole('combobox', { name: '练习集合' })).toContainText('周六项目互面');
});

test('handbook saves chapter notes, fills a real answer template and exports a document', async ({
  page,
}) => {
  await page.goto('/handbook?chapter=star');
  await page.getByLabel('当前章节学习笔记').fill('用自己的行动解释协作结果');
  await page.getByRole('button', { name: '保存笔记', exact: true }).click();
  await page.getByRole('button', { name: 'STAR 模板', exact: true }).click();
  await expect(page.getByLabel('我的回答模板')).toHaveValue(/Situation/);
  await page
    .getByLabel('我的回答模板')
    .fill(
      'Situation：项目需求发生变化。Task：协调两位同学。Action：拆解任务。Result：按时完成演示。',
    );
  await page.getByRole('button', { name: '保存回答模板' }).click();
  await page.reload();
  await expect(page.getByLabel('当前章节学习笔记')).toHaveValue('用自己的行动解释协作结果');
  await expect(page.getByLabel('我的回答模板')).toHaveValue(/按时完成演示/);
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: '导出章节与笔记' }).click();
  expect((await download).suggestedFilename()).toContain('STAR');
});

test('failed local publishing preserves the editor and shows a retryable storage error', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === 'radar-extended-knowledge-experiences')
        throw new DOMException('Storage full', 'QuotaExceededError');
      return original.call(this, key, value);
    };
  });
  await page.goto('/experiences');
  await page.getByRole('button', { name: '写一篇面经' }).click();
  await page.getByLabel('面经标题', { exact: true }).fill('存储失败时保留的草稿');
  await page
    .getByLabel('复盘内容', { exact: true })
    .fill('存储失败后这段复盘内容需要继续保留，释放空间后才能重试。');
  await page.getByRole('button', { name: '发布到本机广场' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText('保存失败');
  await expect(page.getByLabel('面经标题', { exact: true })).toHaveValue('存储失败时保留的草稿');
  await expect(page.getByLabel('复盘内容', { exact: true })).toHaveValue(/释放空间后才能重试/);
});
