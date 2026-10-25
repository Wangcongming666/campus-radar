import { afterEach, describe, expect, it, vi } from 'vitest';
import { hashPassword, verifyPassword } from './local-auth';
import { authenticate, callback } from './auth';

describe('local account password hashing', () => {
  it('uses fresh salts and verifies only the exact password', async () => {
    const password = '真实账号 password 2026';
    const first = await hashPassword(password);
    const second = await hashPassword(password);
    expect(first).not.toBe(second);
    expect(first).not.toContain(password);
    expect(await verifyPassword(password, first)).toBe(true);
    expect(await verifyPassword(password + ' ', first)).toBe(false);
    expect(await verifyPassword('wrong password', first)).toBe(false);
  });

  it('rejects missing, corrupted or unsupported credentials without authenticating', async () => {
    for (const value of [null, '', 'plain-password', 'scrypt$999999999$8$1$salt$hash']) {
      expect(await verifyPassword('password123456', value)).toBe(false);
    }
    const valid = await hashPassword('password123456');
    expect(await verifyPassword('password123456', valid.slice(0, -1))).toBe(false);
  });
});

afterEach(() => vi.unstubAllEnvs());
describe('explicit local provider configuration', () => {
  function localEnvironment() {
    vi.stubEnv('AUTH_PROVIDER', 'local');
    vi.stubEnv('NEXT_PUBLIC_DATA_MODE', 'api');
    vi.stubEnv('DATABASE_URL', 'postgres://restricted@127.0.0.1/unopened');
    vi.stubEnv('SESSION_ENCRYPTION_KEY', Buffer.alloc(32, 7).toString('base64'));
    vi.stubEnv('SUPABASE_URL', '');
    vi.stubEnv('SUPABASE_ANON_KEY', '');
    vi.stubEnv('APP_ORIGIN', 'http://localhost:3000');
  }

  it('requires a genuine session without requiring Supabase credentials', async () => {
    localEnvironment();
    await expect(
      authenticate(new Request('http://localhost:3000/api/v1/me')),
    ).rejects.toMatchObject({
      status: 401,
      code: 'AUTH_REQUIRED',
    });
  });

  it('fails closed for an unknown provider and for missing session encryption', async () => {
    localEnvironment();
    vi.stubEnv('AUTH_PROVIDER', 'locla');
    await expect(
      authenticate(new Request('http://localhost:3000/api/v1/me')),
    ).rejects.toMatchObject({ status: 503 });
    vi.stubEnv('AUTH_PROVIDER', 'local');
    vi.stubEnv('SESSION_ENCRYPTION_KEY', '');
    await expect(
      authenticate(new Request('http://localhost:3000/api/v1/me')),
    ).rejects.toMatchObject({ status: 503 });
  });

  it('does not pretend local registration has an email verification callback', async () => {
    localEnvironment();
    await expect(
      callback(new Request('http://localhost:3000/auth/callback?code=fake')),
    ).rejects.toMatchObject({
      status: 401,
      code: 'INVALID_CREDENTIALS',
    });
  });
});
