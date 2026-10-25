import { describe, expect, it } from 'vitest';
import { workspaceSpec, validateWorkspaceValue } from './workspace-schema';
import { inspectPrivateFile } from './files';

describe('workspace resource contract', () => {
  it('rejects arbitrary and prefixed keys', () => {
    expect(() => workspaceSpec('arbitrary-table')).toThrow();
    expect(() => workspaceSpec('radar-extended-offers-v2')).toThrow();
    expect(workspaceSpec('offers-v2').table).toBe('offers');
  });
  it('validates parent application ids before any query', () => {
    expect(() => workspaceSpec('interview-rounds-v2-other-user')).toThrow();
    expect(
      workspaceSpec('interview-rounds-v2-123e4567-e89b-42d3-a456-426614174000').applicationId,
    ).toBe('123e4567-e89b-42d3-a456-426614174000');
  });
  it('routes actual UI discussion keys to their typed parent resources', () => {
    const id = '123e4567-e89b-42d3-a456-426614174000';
    expect(workspaceSpec(`discussion-experience-${id}`)).toMatchObject({
      table: 'experience_comments',
      experienceKey: id,
    });
    expect(workspaceSpec('discussion-local-exp-original')).toMatchObject({
      table: 'experience_comments',
      experienceKey: 'local-exp-original',
    });
    expect(workspaceSpec('discussion-community-1792844438221')).toMatchObject({
      table: 'post_comments',
      postKey: '1792844438221',
    });
    expect(() => workspaceSpec('discussion-community-not-a-post')).toThrow();
  });
  it('rejects oversized, duplicate, and unexpected records', () => {
    expect(() => validateWorkspaceValue('diagnosis-text-v2', 'x'.repeat(200001))).toThrow();
    expect(() => validateWorkspaceValue('offers-v2', [{ id: '1', company: 'x' }])).toThrow();
    expect(() =>
      validateWorkspaceValue('planner-milestones-v2', [
        { id: '1', title: 'x', date: '2026-01-01', sql: 'drop' },
      ]),
    ).toThrow();
    expect(() =>
      validateWorkspaceValue('planner-milestones-v2', [
        { id: '1', title: 'x', date: '' },
        { id: '1', title: 'y', date: '' },
      ]),
    ).toThrow();
  });
  it('supports explicit private core settings', () => {
    expect(validateWorkspaceValue('radar-core-notes', { 'chapter-x': 'note' })).toEqual({
      'chapter-x': 'note',
    });
    expect(() => validateWorkspaceValue('radar-core-notes', { bad: { nested: true } })).toThrow();
    expect(() => validateWorkspaceValue('radar-core-favorites', [])).toThrow();
  });
});
describe('private file inspection', () => {
  it('checks actual headers and strict size limits', () => {
    expect(inspectPrivateFile(Buffer.from('%PDF-1.7\n'), 'application/pdf', 'resume.pdf')).toBe(
      'application/pdf',
    );
    expect(() =>
      inspectPrivateFile(Buffer.from('not pdf'), 'application/pdf', 'resume.pdf'),
    ).toThrow();
    expect(() =>
      inspectPrivateFile(Buffer.alloc(10 * 1024 * 1024 + 1), 'text/plain', 'resume.txt'),
    ).toThrow();
    expect(() => inspectPrivateFile(Buffer.from('<html>'), 'text/html', 'x.html')).toThrow();
  });
  it('allows UTF-8 text but rejects binary pretending to be text', () => {
    expect(inspectPrivateFile(Buffer.from('中文简历'), 'text/plain', '简历.txt')).toBe(
      'text/plain',
    );
    expect(() => inspectPrivateFile(Buffer.from([0, 1, 2]), 'text/plain', 'x.txt')).toThrow();
  });
});
