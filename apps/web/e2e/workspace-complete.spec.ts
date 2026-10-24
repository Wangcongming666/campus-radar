import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

test('an outdated pipeline note cannot silently replace a note saved in another tab', async ({
  page,
}) => {
  await page.goto('/pipeline');
  await page.getByRole('button', { name: '游戏客户端开发工程师', exact: true }).click();
  await page.getByLabel('我的笔记与下一步计划').fill('本标签未保存的草稿');
  const other = await page.context().newPage();
  await other.goto('/pipeline');
  await other.getByRole('button', { name: '游戏客户端开发工程师', exact: true }).click();
  await other.getByLabel('我的笔记与下一步计划').fill('另一标签的新笔记');
  await other.getByRole('button', { name: '保存笔记', exact: true }).click();
  await page.bringToFront();
  await page.getByRole('button', { name: '保存笔记', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('记录已更新');
  await expect(page.getByLabel('我的笔记与下一步计划')).toHaveValue('本标签未保存的草稿');
  await page.getByRole('button', { name: '载入最新笔记' }).click();
  await expect(page.getByLabel('我的笔记与下一步计划')).toHaveValue('另一标签的新笔记');
  await other.close();
});

test('pointer drag moves an actual application into another Kanban stage', async ({ page }) => {
  await page.goto('/pipeline');
  const handle = page.getByRole('button', { name: '拖动 网易 游戏客户端开发工程师', exact: true });
  const source = await handle.boundingBox();
  const target = await page.locator('[data-stage="APPLIED"]').boundingBox();
  expect(source).toBeTruthy();
  expect(target).toBeTruthy();
  await page.mouse.move(source!.x + source!.width / 2, source!.y + source!.height / 2);
  await page.mouse.down();
  await page.mouse.move(source!.x + 20, source!.y + 10, { steps: 3 });
  await page.mouse.move(target!.x + target!.width / 2, target!.y + 270, { steps: 12 });
  await page.mouse.up();
  await expect(
    page.getByRole('combobox', { name: '移动 游戏客户端开发工程师 的阶段' }),
  ).toHaveValue('APPLIED');
  await page.reload();
  await expect(
    page.getByRole('combobox', { name: '移动 游戏客户端开发工程师 的阶段' }),
  ).toHaveValue('APPLIED');
});

test('calendar edits, completes, exports and deletes actual local events', async ({ page }) => {
  await page.goto('/calendar');
  await page.getByRole('button', { name: '新建日程', exact: true }).click();
  let dialog = page.getByRole('dialog');
  await dialog.getByLabel('日程标题', { exact: true }).fill('完整日程验收');
  await dialog.getByLabel('日期', { exact: true }).fill('2026-10-23');
  await dialog.getByLabel('时间', { exact: true }).fill('09:00');
  await dialog.getByLabel('时长（分钟）').fill('45');
  await dialog.getByLabel('地点或会议室').fill('本机准备区');
  await dialog.getByRole('button', { name: '保存到本机日程' }).click();
  await page.reload();
  await page.getByRole('button', { name: /09:00.*完整日程验收/ }).click();
  dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('本机准备区');
  await dialog.getByRole('button', { name: '编辑日程' }).click();
  await page.getByLabel('日程标题', { exact: true }).fill('修改后的安排');
  await page.getByRole('button', { name: '保存到本机日程' }).click();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: '导出日历', exact: true }).click();
  const download = await downloadPromise;
  expect(await readFile((await download.path())!, 'utf8')).toContain('SUMMARY:修改后的安排');
  await page.getByRole('button', { name: /09:00.*修改后的安排/ }).click();
  await page.getByRole('button', { name: '标记完成', exact: true }).click();
  await expect(page.getByRole('button', { name: '恢复未完成' })).toBeVisible();
  await page.getByRole('button', { name: '删除日程', exact: true }).click();
  await page.getByRole('button', { name: '确认删除日程' }).click();
  await expect(page.getByRole('button', { name: /09:00.*修改后的安排/ })).toHaveCount(0);
});

test('pipeline stage history, local notifications and calendar association form a working loop', async ({
  page,
}) => {
  await page.goto('/pipeline');
  const picker = page.getByRole('combobox', { name: '移动 游戏客户端开发工程师 的阶段' });
  await picker.selectOption('INTERVIEW_1');
  await page.getByRole('button', { name: '游戏客户端开发工程师', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('阶段变更记录');
  await expect(page.getByRole('dialog')).toContainText('待投递 →');
  await page.getByRole('link', { name: '安排面试日程' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByLabel('日程标题', { exact: true })).toHaveValue(/游戏客户端开发工程师/);
  await page.getByLabel('日期', { exact: true }).fill('2026-10-23');
  await page.getByRole('button', { name: '保存到本机日程' }).click();
  await page.goto('/notifications');
  await expect(page.getByRole('heading', { name: '投递阶段已更新' })).toBeVisible();
  await expect(page.getByRole('heading', { name: '新的日程已安排' })).toBeVisible();
  await page.getByRole('button', { name: '全部已读', exact: true }).click();
  await expect(page.locator('main')).toContainText('0 条未读');
});

test('complete backup restores local profile, feature records and actual resume attachments', async ({
  page,
}) => {
  await page.goto('/resumes');
  await page.getByRole('button', { name: '上传简历版本' }).click();
  await page.getByLabel('简历文件', { exact: true }).setInputFiles({
    name: '备份简历.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('备份附件正文 React TypeScript'),
  });
  await page.getByRole('button', { name: '保存简历版本' }).click();
  await expect(page.getByRole('dialog')).toBeHidden();
  await page.goto('/settings');
  await page.getByLabel('演示昵称', { exact: true }).fill('完整备份同学');
  await page.getByRole('button', { name: '保存资料与偏好' }).click();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: '导出完整备份' }).click();
  const download = await downloadPromise;
  const buffer = await readFile((await download.path())!);
  const backup = JSON.parse(buffer.toString());
  expect(backup.files).toHaveLength(1);
  expect(Buffer.from(backup.files[0].data, 'base64').toString()).toBe(
    '备份附件正文 React TypeScript',
  );
  expect(backup.entries['radar-extended-resume-library-v2']).toContain('备份简历.txt');
  await page.getByLabel('演示昵称', { exact: true }).fill('临时修改');
  await page.getByRole('button', { name: '保存资料与偏好' }).click();
  await page
    .getByLabel('导入备份文件')
    .setInputFiles({ name: 'campus-radar-backup.json', mimeType: 'application/json', buffer });
  await page.getByRole('button', { name: '确认恢复备份' }).click();
  await expect(page.getByLabel('演示昵称', { exact: true })).toHaveValue('完整备份同学');
  await page.goto('/resumes');
  await expect(page.getByLabel('简历提取文字', { exact: true })).toHaveValue(
    '备份附件正文 React TypeScript',
  );
  await expect(page.getByRole('button', { name: '下载原文件' })).toBeEnabled();
});

test('a locally authored experience can be found through global search, preview and favorites', async ({
  page,
}) => {
  await page.goto('/experiences');
  await page.getByRole('button', { name: '写一篇面经' }).click();
  await page.getByLabel('面经标题', { exact: true }).fill('全局联动验收面经');
  await page
    .getByLabel('复盘内容', { exact: true })
    .fill('这次面试重点讨论了事件循环机制和前端工程化，复盘后整理了项目证据。');
  await page.getByRole('button', { name: '发布到本机广场' }).click();
  await page.goto('/jobs');
  await page.getByRole('button', { name: '全局搜索', exact: true }).click();
  await page.getByRole('dialog').getByRole('combobox').fill('全局联动验收面经');
  await page.getByRole('option').filter({ hasText: '全局联动验收面经' }).click();
  await expect(page.getByRole('dialog')).toContainText('全局联动验收面经');
  await page.getByRole('button', { name: '收藏预览内容' }).click();
  await page.keyboard.press('Escape');
  await page.goto('/favorites?type=experience');
  await expect(page.locator('main')).toContainText('全局联动验收面经');
});
