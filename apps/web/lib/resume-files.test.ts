import { describe, expect, it } from 'vitest';
import { assertSafeResumeFile, resumeDiff, validateResumeFile } from './resume-files';
describe('resume versions', () => {
  it('rejects active HTML disguised as a PDF and requires the actual PDF signature', async () => {
    await expect(
      assertSafeResumeFile(
        new File(['<script>alert(1)</script>'], 'resume.pdf', { type: 'text/html' }),
      ),
    ).rejects.toThrow('类型');
    await expect(
      assertSafeResumeFile(new File(['not a PDF'], 'resume.pdf', { type: 'application/pdf' })),
    ).rejects.toThrow('PDF');
    await expect(
      assertSafeResumeFile(new File(['%PDF-1.4\n'], 'resume.pdf', { type: 'application/pdf' })),
    ).resolves.toBeUndefined();
    await expect(
      assertSafeResumeFile(new File(['<b>React</b>'], 'resume.txt', { type: 'text/plain' })),
    ).resolves.toBeUndefined();
  });
  it('compares actual lines, keeping common text and changed evidence', () => {
    expect(resumeDiff('教育\n负责开发\nReact', '教育\n通过性能分析减少重复渲染\nReact')).toEqual([
      { type: 'same', text: '教育' },
      { type: 'removed', text: '负责开发' },
      { type: 'added', text: '通过性能分析减少重复渲染' },
      { type: 'same', text: 'React' },
    ]);
  });
  it('rejects empty, unsupported and oversized uploads before storing bytes', () => {
    expect(validateResumeFile({ name: 'resume.pdf', size: 0 })).toContain('空');
    expect(validateResumeFile({ name: 'resume.exe', size: 10 })).toContain('PDF');
    expect(validateResumeFile({ name: 'resume.pdf', size: 11 * 1024 * 1024 })).toContain('10 MB');
    expect(validateResumeFile({ name: 'resume.TXT', size: 10 })).toBeNull();
  });
});
