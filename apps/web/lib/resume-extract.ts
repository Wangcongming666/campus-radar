'use client';
import { assertSafeResumeFile } from './resume-files';
export async function extractResumeText(file: File): Promise<{ text: string; note?: string }> {
  await assertSafeResumeFile(file);
  if (!/\.pdf$/i.test(file.name)) {
    const text = (await file.text()).replace(/\u0000/g, '').slice(0, 500_000);
    return {
      text,
      ...(text.length >= 500_000 ? { note: '文本过长，仅提取前 50 万字；原文件完整保存。' } : {}),
    };
  }
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
  const loading = pdfjs.getDocument({
    data: new Uint8Array(await file.arrayBuffer()),
    cMapUrl: '/pdfjs/cmaps/',
    cMapPacked: true,
    standardFontDataUrl: '/pdfjs/standard_fonts/',
    wasmUrl: '/pdfjs/wasm/',
  });
  try {
    const document = await loading.promise;
    const lines: string[] = [];
    for (let page = 1; page <= Math.min(document.numPages, 30); page++) {
      const content = await (await document.getPage(page)).getTextContent();
      let line = '';
      for (const item of content.items) {
        if ('str' in item) {
          line += item.str + ' ';
          if (item.hasEOL) {
            lines.push(line.trim());
            line = '';
          }
        }
      }
      if (line.trim()) lines.push(line.trim());
      lines.push('');
    }
    const text = lines.join('\n').trim().slice(0, 500_000);
    return {
      text,
      ...(!text
        ? { note: '此 PDF 没有可提取文字，可能是扫描件。可预览原件，并手动补充文字进行对比。' }
        : document.numPages > 30
          ? { note: '仅提取前 30 页文字；原文件完整保存。' }
          : {}),
    };
  } finally {
    await loading.destroy();
  }
}
