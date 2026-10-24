export type ResumeVersion = {
  id: string;
  name: string;
  fileName: string;
  mime: string;
  size: number;
  text: string;
  role: string;
  createdAt: string;
  version: number;
  default: boolean;
  applicationIds: string[];
  extractionNote?: string;
};
export type ResumeDiffLine = { type: 'same' | 'added' | 'removed'; text: string };
export async function assertSafeResumeFile(file: Blob & { name: string }): Promise<void> {
  const invalid = validateResumeFile(file);
  if (invalid) throw new Error(invalid);
  const mime = file.type.toLowerCase().split(';')[0];
  if (/\.pdf$/i.test(file.name)) {
    if (!['', 'application/pdf', 'application/octet-stream'].includes(mime))
      throw new Error('文件类型与 PDF 不符，请选择原始 PDF 文件。');
    if ((await file.slice(0, 5).text()) !== '%PDF-')
      throw new Error('文件缺少 PDF 标记，无法作为 PDF 保存或预览。');
  } else if (
    !['', 'text/plain', 'text/markdown', 'text/x-markdown', 'application/octet-stream'].includes(
      mime,
    )
  ) {
    throw new Error('文件类型不受支持，TXT 和 MD 必须为纯文本文件。');
  }
}
export function resumeDiff(previous: string, current: string): ResumeDiffLine[] {
  const a = previous.replace(/\r\n/g, '\n').split('\n'),
    b = current.replace(/\r\n/g, '\n').split('\n');
  if (a.length * b.length > 1_000_000) {
    let start = 0,
      end = 0;
    while (start < a.length && start < b.length && a[start] === b[start]) start++;
    while (
      end < a.length - start &&
      end < b.length - start &&
      a[a.length - end - 1] === b[b.length - end - 1]
    )
      end++;
    return [
      ...a.slice(0, start).map((text) => ({ type: 'same' as const, text })),
      ...a.slice(start, a.length - end).map((text) => ({ type: 'removed' as const, text })),
      ...b.slice(start, b.length - end).map((text) => ({ type: 'added' as const, text })),
      ...a.slice(a.length - end).map((text) => ({ type: 'same' as const, text })),
    ];
  }
  const lengths = Array.from({ length: a.length + 1 }, () => new Uint16Array(b.length + 1));
  for (let i = a.length - 1; i >= 0; i--)
    for (let j = b.length - 1; j >= 0; j--)
      lengths[i][j] =
        a[i] === b[j] ? lengths[i + 1][j + 1] + 1 : Math.max(lengths[i + 1][j], lengths[i][j + 1]);
  const result: ResumeDiffLine[] = [];
  let i = 0,
    j = 0;
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) {
      result.push({ type: 'same', text: a[i] });
      i++;
      j++;
    } else if (i < a.length && (j === b.length || lengths[i + 1][j] >= lengths[i][j + 1]))
      result.push({ type: 'removed', text: a[i++] });
    else result.push({ type: 'added', text: b[j++] });
  }
  return result;
}
export function validateResumeFile(file: { name: string; size: number }): string | null {
  if (!file.size) return '文件为空，请选择包含内容的文件。';
  if (file.size > 10 * 1024 * 1024) return '文件不能超过 10 MB。';
  if (!/\.(pdf|txt|md)$/i.test(file.name)) return '支持 PDF、TXT、MD 文件。';
  return null;
}
export function isResumeLibrary(value: unknown): value is ResumeVersion[] {
  return (
    Array.isArray(value) &&
    value.every(
      (item) =>
        item &&
        typeof item === 'object' &&
        ['id', 'name', 'fileName', 'mime', 'text', 'role', 'createdAt'].every(
          (key) => typeof item[key] === 'string',
        ) &&
        typeof item.version === 'number' &&
        typeof item.size === 'number' &&
        typeof item.default === 'boolean' &&
        Array.isArray(item.applicationIds) &&
        item.applicationIds.every((id: unknown) => typeof id === 'string'),
    )
  );
}
