import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';

async function uploadResume(page: Page, fileName: string, content: string) {
  await page.getByRole('button', { name: '上传简历版本', exact: true }).click();
  const modal = page.getByRole('dialog');
  await modal
    .getByLabel('简历文件', { exact: true })
    .setInputFiles({ name: fileName, mimeType: 'text/plain', buffer: Buffer.from(content) });
  await modal.getByRole('button', { name: '保存简历版本', exact: true }).click();
  await expect(modal).toBeHidden();
}

test('resume files survive refresh, compare real changes, download original and clear links on deletion', async ({
  page,
}) => {
  await page.goto('/resumes');
  await uploadResume(page, '前端初版.txt', '教育背景\n负责前端开发\n技能 React');
  await expect(page.getByRole('textbox', { name: '简历提取文字' })).toHaveValue(
    '教育背景\n负责前端开发\n技能 React',
  );
  await page.reload();
  await expect(page.getByRole('textbox', { name: '简历提取文字' })).toHaveValue(
    '教育背景\n负责前端开发\n技能 React',
  );
  await uploadResume(
    page,
    '前端改进版.txt',
    '教育背景\n通过日志与性能分析减少重复渲染\n技能 React',
  );
  await page.getByRole('button', { name: '对比版本变化' }).click();
  const diff = page.getByRole('dialog');
  await expect(diff).toContainText('负责前端开发');
  await expect(diff).toContainText('通过日志与性能分析减少重复渲染');
  await page.keyboard.press('Escape');
  await page.getByRole('checkbox').first().check();
  await page.reload();
  await expect(page.getByRole('checkbox').first()).toBeChecked();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: '下载原文件' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('前端改进版.txt');
  expect(await readFile((await download.path())!, 'utf8')).toBe(
    '教育背景\n通过日志与性能分析减少重复渲染\n技能 React',
  );
  await page.getByRole('button', { name: '删除当前简历版本' }).click();
  await page.getByRole('button', { name: '确认删除版本' }).click();
  await expect(page.getByRole('dialog')).toBeHidden();
  await expect(page.getByRole('textbox', { name: '简历提取文字' })).toHaveValue(
    '教育背景\n负责前端开发\n技能 React',
  );
  await expect(page.getByRole('checkbox').first()).not.toBeChecked();
});

test('practice configuration, pause and recovery preserve answers and complete persistent per-question reports', async ({
  page,
}) => {
  await page.goto('/mock');
  await page.getByRole('combobox', { name: '目标方向', exact: true }).selectOption('后端开发');
  await page.getByRole('combobox', { name: '模拟公司', exact: true }).selectOption('美团');
  await page.getByRole('combobox', { name: '题目难度', exact: true }).selectOption('深度挑战');
  await page.getByRole('button', { name: '开始本地模拟', exact: true }).click();
  await expect(page.getByRole('heading', { level: 2 }).filter({ hasText: 'MySQL' })).toContainText(
    '失败边界',
  );
  await expect(page.getByRole('heading', { level: 2 }).filter({ hasText: 'MySQL' })).toContainText(
    '本地生活履约团队',
  );
  const answer =
    '首先联合索引基于 B+ 树按字段排序，因此遵循最左前缀。项目中我通过执行计划验证索引选择，并比较查询耗时与回表成本。';
  await page.getByRole('textbox', { name: '本题回答' }).fill(answer);
  await page.getByRole('button', { name: '暂停练习', exact: true }).click();
  await expect(page.getByRole('textbox', { name: '本题回答' })).toBeDisabled();
  await page.getByRole('button', { name: '保存退出', exact: true }).click();
  await page.reload();
  await page.getByRole('button', { name: '恢复上次练习', exact: true }).click();
  await expect(page.getByRole('textbox', { name: '本题回答' })).toHaveValue(answer);
  await page.getByRole('button', { name: '下一题', exact: true }).click();
  await page.getByRole('textbox', { name: '本题回答' }).fill('我需要进一步学习缓存');
  await page.getByRole('button', { name: '下一题', exact: true }).click();
  await page.getByRole('button', { name: '结束并查看报告', exact: true }).click();
  await expect(page.getByText('逐题回顾', { exact: true })).toBeVisible();
  await expect(page.getByText(answer, { exact: true })).toBeVisible();
  await expect(page.getByText('本题未作答。', { exact: true })).toBeVisible();
  await expect(page.getByRole('img', { name: /本地规则评分雷达/ })).toBeVisible();
  await page.reload();
  await page.getByRole('tab', { name: '练习历史', exact: true }).click();
  await page.getByRole('button', { name: '查看报告', exact: true }).click();
  await expect(page.getByText(answer, { exact: true })).toBeVisible();
});

test('PDF upload extracts actual text, previews the original and downloads identical bytes', async ({
  page,
}) => {
  const content = 'BT /F1 18 Tf 50 780 Td (Campus Radar React TypeScript) Tj ET';
  const secondContent = 'BT /F1 18 Tf 50 780 Td (Campus Radar Page Two) Tj ET';
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R 6 0 R] /Count 2 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${Buffer.byteLength(content, 'ascii')} >>\nstream\n${content}\nendstream`,
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 7 0 R >>',
    `<< /Length ${Buffer.byteLength(secondContent, 'ascii')} >>\nstream\n${secondContent}\nendstream`,
  ];
  let document = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(document, 'ascii'));
    document += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = Buffer.byteLength(document, 'ascii');
  document += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  document += offsets
    .slice(1)
    .map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`)
    .join('');
  document += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  const original = Buffer.from(document, 'ascii');
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/resumes');
  await page.getByRole('button', { name: '上传简历版本', exact: true }).click();
  const modal = page.getByRole('dialog');
  await modal
    .getByLabel('简历文件', { exact: true })
    .setInputFiles({ name: 'PDF简历.pdf', mimeType: 'application/pdf', buffer: original });
  await modal.getByRole('button', { name: '保存简历版本', exact: true }).click();
  await expect(modal).toBeHidden();
  await expect(page.getByRole('textbox', { name: '简历提取文字' })).toHaveValue(
    /Campus Radar React TypeScript/,
  );
  const canvas = page.locator('canvas[data-pdf-page]');
  await expect(canvas).toHaveAttribute('data-rendered-page', '1');
  expect(await canvas.evaluate((element) => (element as HTMLCanvasElement).width)).toBeGreaterThan(
    0,
  );
  expect(await canvas.evaluate((element) => (element as HTMLCanvasElement).height)).toBeGreaterThan(
    0,
  );
  await expect(page.getByLabel('PDF页码', { exact: true })).toHaveText('第 1 / 2 页');
  await page.getByRole('button', { name: 'PDF下一页', exact: true }).click();
  await expect(canvas).toHaveAttribute('data-rendered-page', '2');
  await expect(page.getByLabel('PDF页码', { exact: true })).toHaveText('第 2 / 2 页');
  await expect(page.getByRole('button', { name: 'PDF下一页', exact: true })).toBeDisabled();
  const normalWidth = await canvas.evaluate((element) => (element as HTMLCanvasElement).width);
  await page.getByRole('combobox', { name: 'PDF缩放', exact: true }).selectOption('1.5');
  await expect
    .poll(() => canvas.evaluate((element) => (element as HTMLCanvasElement).width))
    .toBeGreaterThan(normalWidth);
  await page.getByRole('button', { name: 'PDF上一页', exact: true }).click();
  await expect(canvas).toHaveAttribute('data-rendered-page', '1');
  await page.reload();
  await expect(page.getByRole('textbox', { name: '简历提取文字' })).toHaveValue(
    /Campus Radar React TypeScript/,
  );
  await expect(canvas).toHaveAttribute('data-rendered-page', '1');
  const downloadPromise = page.waitForEvent('download');
  await page.screenshot({ path: '../../artifacts/qa/functional-resume-pdf-desktop.png', fullPage: true, animations: 'disabled' });
  await page.getByRole('button', { name: '下载原文件', exact: true }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('PDF简历.pdf');
  expect(await readFile((await download.path())!)).toEqual(original);
  expect(errors).toEqual([]);
});

test('rejects HTML disguised as a PDF before saving or rendering a preview', async ({ page }) => {
  await page.goto('/resumes');
  await page.getByRole('button', { name: '上传简历版本', exact: true }).click();
  const modal = page.getByRole('dialog');
  await modal.getByLabel('简历文件', { exact: true }).setInputFiles({
    name: 'disguised.pdf',
    mimeType: 'text/html',
    buffer: Buffer.from('<script>window.parent.__unsafeResume = true</script>'),
  });
  await modal.getByRole('button', { name: '保存简历版本', exact: true }).click();
  await expect(modal.getByRole('alert')).toContainText('文件类型与 PDF 不符');
  await modal.getByLabel('简历文件', { exact: true }).setInputFiles({
    name: 'disguised.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('<html>This is not a PDF</html>'),
  });
  await modal.getByRole('button', { name: '保存简历版本', exact: true }).click();
  await expect(modal.getByRole('alert')).toContainText('文件缺少 PDF 标记');
  await expect(page.locator('iframe')).toHaveCount(0);
  expect(
    await page.evaluate(() => localStorage.getItem('radar-extended-resume-library-v2')),
  ).toBeNull();
});

test('timeline rounds and editable review, manual score and imported audio survive a reload', async ({
  page,
}) => {
  await page.goto('/interview/app-1/timeline');
  await page.getByRole('button', { name: '添加面试轮次', exact: true }).click();
  const modal = page.getByRole('dialog');
  await modal.getByLabel('轮次名称', { exact: true }).fill('项目深挖面试');
  await modal.getByLabel('题目与准备要点', { exact: true }).fill('解释性能测量和方案取舍');
  await modal.getByLabel('轮次笔记', { exact: true }).fill('周五前整理项目证据');
  await modal.getByRole('combobox', { name: '轮次状态', exact: true }).selectOption('已完成');
  await modal.getByRole('button', { name: '保存面试轮次', exact: true }).click();
  await page.reload();
  await page.getByRole('button', { name: /项目深挖面试/ }).click();
  await expect(page.getByText('周五前整理项目证据', { exact: true })).toBeVisible();
  await page.getByRole('link', { name: '打开本轮复盘', exact: true }).click();
  const transcript =
    '背景是长列表输入卡顿，我的任务是优化交互。我采取的行动是查看日志并测量渲染耗时，结果减少重复渲染，最后通过同设备对比验证结果。';
  await page.getByRole('textbox', { name: '面试转写文字' }).fill(transcript);
  await page.getByRole('textbox', { name: '我的复盘笔记' }).fill('下次补充失败边界');
  await page.getByRole('combobox', { name: '本轮自评', exact: true }).selectOption('4');
  await page.getByRole('button', { name: '生成本地规则报告', exact: true }).click();
  // A small PCM WAV fixture exercises importing and IndexedDB without microphone access.
  const wav = Buffer.alloc(46);
  wav.write('RIFF', 0);
  wav.writeUInt32LE(38, 4);
  wav.write('WAVEfmt ', 8);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(8000, 24);
  wav.writeUInt32LE(16000, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write('data', 36);
  wav.writeUInt32LE(2, 40);
  await page
    .getByLabel('导入面试音频', { exact: true })
    .setInputFiles({ name: '本轮录音.wav', mimeType: 'audio/wav', buffer: wav });
  await expect(page.getByText('本轮录音.wav · 已保存', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('textbox', { name: '面试转写文字' })).toHaveValue(transcript);
  await expect(page.getByRole('textbox', { name: '我的复盘笔记' })).toHaveValue('下次补充失败边界');
  await expect(page.getByRole('combobox', { name: '本轮自评', exact: true })).toHaveValue('4');
  await expect(
    page.getByText('你的手动自评：4/5（与规则完成度分别记录）', { exact: true }),
  ).toBeVisible();
  await expect(page.locator('audio')).toHaveAttribute('src', /^blob:/);
  await page.getByRole('button', { name: '删除录音', exact: true }).click();
  await expect(page.locator('audio')).toHaveCount(0);
});

test('corrupt interview metadata produces recoverable errors instead of runtime crashes', async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem('radar-extended-mock-reports-v2', '[{"id":"broken"}]');
    localStorage.setItem('radar-extended-resume-library-v2', '[{"id":"broken"}]');
  });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/mock');
  await expect(page.getByRole('alert').filter({ hasText: '数据可能损坏' })).toBeVisible();
  await page.goto('/resumes');
  await expect(page.getByRole('alert').filter({ hasText: '数据可能损坏' })).toBeVisible();
  expect(errors).toEqual([]);
});
