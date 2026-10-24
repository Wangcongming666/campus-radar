import { describe, it, expect } from 'vitest';
import {
  parseLocalValue,
  validateLocalBackup,
  restoreLocalBackup,
  type LocalBackup,
} from './local-workspace';

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
    removeItem: (key: string) => {
      values.delete(key);
    },
  };
}
describe('local workspace persistence', () => {
  it('rejects malformed records rather than crashing list pages', () => {
    expect(parseLocalValue('not json', [{ id: 'a', title: 'title' }])).toEqual([
      { id: 'a', title: 'title' },
    ]);
    expect(parseLocalValue('["bad"]', [{ id: 'a', title: 'title' }])).toEqual([
      { id: 'a', title: 'title' },
    ]);
    expect(parseLocalValue('[{"id":"b","title":"new"}]', [{ id: 'a', title: 'title' }])).toEqual([
      { id: 'b', title: 'new' },
    ]);
  });
  it('never restores unrelated browser keys or unknown backup formats', () => {
    expect(() =>
      validateLocalBackup({ product: 'Campus Radar', schemaVersion: 1, entries: { token: 'bad' } }),
    ).toThrow();
    expect(() =>
      validateLocalBackup({ product: 'other', schemaVersion: 1, entries: {} }),
    ).toThrow();
  });
  it('rejects corrupt calendar fields before backup restoration', () => {
    expect(() =>
      validateLocalBackup({
        product: 'Campus Radar',
        schemaVersion: 1,
        createdAt: '2026-10-23',
        entries: {
          'radar-extended-events': JSON.stringify([
            {
              id: 1,
              title: '面试',
              date: '2026-10-23',
              time: '09:00',
              duration: '60 分钟',
              type: '面试',
              companyId: 'tencent',
              notes: {},
            },
          ]),
        },
      }),
    ).toThrow('日程备份格式不正确');
  });
  it('rolls back earlier writes if a backup restore runs out of storage', () => {
    const storage = memoryStorage();
    storage.setItem('radar-extended-a', '["old"]');
    const faulty = {
      ...storage,
      setItem: (key: string, value: string) => {
        if (key === 'radar-extended-b') throw new Error('quota');
        storage.setItem(key, value);
      },
    };
    const backup: LocalBackup = {
      product: 'Campus Radar',
      schemaVersion: 1,
      createdAt: '2026-10-23',
      entries: { 'radar-extended-a': '["new"]', 'radar-extended-b': '[]' },
    };
    expect(() => restoreLocalBackup(faulty, backup)).toThrow('quota');
    expect(storage.getItem('radar-extended-a')).toBe('["old"]');
    expect(storage.getItem('radar-extended-b')).toBeNull();
  });
});
