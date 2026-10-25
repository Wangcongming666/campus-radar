import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rm } from 'node:fs/promises';

const fixtures = vi.hoisted(() => ({
  owner: '123e4567-e89b-42d3-a456-426614174000',
  other: '123e4567-e89b-42d3-a456-426614174001',
  queries: [] as string[],
}));
vi.mock('./auth', () => ({
  authenticate: vi.fn(async () => ({ userId: fixtures.owner, csrf: 'test-csrf' })),
  rateLimit: vi.fn(async () => undefined),
}));
vi.mock('./db', () => ({
  transaction: vi.fn(async (_owner: string, run: (sql: unknown) => Promise<unknown>) => {
    const sql = (parts: TemplateStringsArray) => {
      const query = parts.join('?');
      fixtures.queries.push(query);
      if (query.includes('display_name,school'))
        return [
          {
            display_name: '真实用户',
            school: null,
            graduation_year: null,
            education: null,
            preferences: {
              schemaVersion: 1,
              roles: [],
              cities: [],
              industries: [],
              recruitmentTypes: [],
              graduationYear: null,
            },
            theme: 'system',
            timezone: 'Asia/Shanghai',
            onboarding_step: 0,
          },
        ];
      return [];
    };
    return run(sql);
  }),
}));
import {
  exportAccountData,
  resetAccountData,
  importAccountData,
  signCloudBackup,
  validateCloudBackup,
  type CloudBackup,
} from './account-data';

const fileRoot = join(tmpdir(), 'campus-radar-account-data-unit-' + process.pid);
beforeEach(() => {
  fixtures.queries.length = 0;
  vi.stubEnv('SESSION_ENCRYPTION_KEY', Buffer.alloc(32, 7).toString('base64'));
  vi.stubEnv('PRIVATE_FILE_ROOT', fileRoot);
});
afterEach(async () => {
  vi.unstubAllEnvs();
  await rm(fileRoot, { recursive: true, force: true });
});
async function backup(): Promise<CloudBackup> {
  const result = await exportAccountData(
    new Request('http://localhost/api/v1/workspace/export?includeFiles=false'),
  );
  return (await result.json()).data;
}
const request = (path: string, value: unknown) =>
  new Request('http://localhost/api/v1/workspace/' + path, {
    method: 'POST',
    body: JSON.stringify(value),
    headers: { 'Content-Type': 'application/json' },
  });

describe('native account backup boundaries', () => {
  it('exports the database account snapshot with private records and no credentials or localStorage', async () => {
    const value = await backup();
    expect(value).toMatchObject({
      format: 'campus-radar-cloud',
      ownerId: fixtures.owner,
      profile: { displayName: '真实用户' },
      records: {},
      files: [],
    });
    expect(value.core).toEqual({
      applications: [],
      stageEvents: [],
      favorites: [],
      chapterProgress: [],
      taskReceipts: [],
      authoredContent: [],
    });
    expect(validateCloudBackup(value, fixtures.owner)).toEqual(value);
    expect(JSON.stringify(value)).not.toMatch(
      /password|token_hash|encrypted_provider_credentials|localStorage/,
    );
  });
  it('rejects local demo backups, another account, modified signatures and arbitrary workspace keys', async () => {
    const value = await backup();
    expect(() =>
      validateCloudBackup({ format: 'campus-radar', entries: {} }, fixtures.owner),
    ).toThrow('本地演示备份');
    expect(() => validateCloudBackup(value, fixtures.other)).toThrow('另一个账号');
    expect(() =>
      validateCloudBackup(
        { ...value, profile: { ...value.profile, displayName: '篡改用户' } },
        fixtures.owner,
      ),
    ).toThrow('签名');
    const { signature: _proof, ...unsigned } = value;
    const unsupported = signCloudBackup({
      ...unsigned,
      records: { 'jobs-catalog': { value: [], version: 1 } },
    });
    expect(() => validateCloudBackup(unsupported, fixtures.owner)).toThrow();
  });
  it('validates each file original against its metadata and rejects unsafe file names', async () => {
    const { signature: _proof, ...value } = await backup();
    const bytes = Buffer.from('实际简历文本');
    const file = {
      id: 'resume-user',
      name: 'resume.txt',
      type: 'text/plain',
      size: bytes.length,
      sha256: createHash('sha256').update(bytes).digest('hex'),
      updatedAt: '2026-10-24T00:00:00Z',
      data: bytes.toString('base64'),
    };
    expect(
      validateCloudBackup(signCloudBackup({ ...value, files: [file] }), fixtures.owner).files,
    ).toEqual([file]);
    expect(() =>
      validateCloudBackup(
        signCloudBackup({ ...value, files: [{ ...file, size: 1 }] }),
        fixtures.owner,
      ),
    ).toThrow('附件校验');
    expect(() =>
      validateCloudBackup(
        signCloudBackup({ ...value, files: [{ ...file, name: '../resume.txt' }] }),
        fixtures.owner,
      ),
    ).toThrow();
  });
  it('checks the current snapshot version before the destructive reset helper', async () => {
    const value = await backup();
    fixtures.queries.length = 0;
    await expect(
      resetAccountData(request('reset', { confirm: 'RESET', expectedVersion: '0'.repeat(64) })),
    ).rejects.toThrow('已更新');
    expect(fixtures.queries.some((query) => query.includes('reset_private_workspace'))).toBe(false);
    fixtures.queries.length = 0;
    const response = await resetAccountData(
      request('reset', { confirm: 'RESET', expectedVersion: value.stateVersion }),
    );
    expect((await response.json()).data).toMatchObject({
      reset: true,
      cleanupFailures: 0,
      publicContentRetained: true,
    });
    expect(
      fixtures.queries.filter((query) => query.includes('reset_private_workspace')),
    ).toHaveLength(1);
  });
  it('rejects a stale restore or invalid backup before clearing current records', async () => {
    const value = await backup();
    fixtures.queries.length = 0;
    await expect(
      importAccountData(
        request('import', { backup: value, confirm: 'RESTORE', expectedVersion: '0'.repeat(64) }),
      ),
    ).rejects.toThrow('已更新');
    expect(fixtures.queries.some((query) => query.includes('reset_private_workspace'))).toBe(false);
    await expect(
      importAccountData(
        request('import', {
          backup: { ...value, ownerId: fixtures.other },
          confirm: 'RESTORE',
          expectedVersion: value.stateVersion,
        }),
      ),
    ).rejects.toThrow('另一个账号');
    expect(fixtures.queries.some((query) => query.includes('reset_private_workspace'))).toBe(false);
  });
});

it('keeps native backups from before question_id was added valid without changing their signatures', async () => {
  const { signature: _proof, ...value } = await backup();
  const legacy = signCloudBackup({
    ...value,
    core: {
      ...value.core,
      favorites: [
        {
          id: '123e4567-e89b-42d3-a456-426614174002',
          user_id: fixtures.owner,
          target_type: 'job',
          job_id: '123e4567-e89b-42d3-a456-426614174003',
          experience_id: null,
          company_id: null,
          created_at: '2026-10-24T00:00:00Z',
          updated_at: '2026-10-24T00:00:00Z',
        },
      ],
    },
  });
  expect(validateCloudBackup(legacy, fixtures.owner)).toEqual(legacy);
});
