/** Requires a disposable DB with 0001, 0003, 0004 and 0005; never point at production. */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import postgres from 'postgres';
import { randomUUID } from 'node:crypto';
import { POST as register } from '../app/api/v1/auth/register/route';
import { POST as login } from '../app/api/v1/auth/login/route';
import { POST as logout } from '../app/api/v1/auth/logout/route';
import { GET as me, PATCH as patchMe } from '../app/api/v1/me/route';
import { GET as csrf } from '../app/api/v1/auth/csrf/route';
import { hash } from './http';

const enabled = !!process.env.API_INTEGRATION_DATABASE_URL;
const origin = 'http://localhost:3000';
const emails = [0, 1].map(() => 'local-' + randomUUID() + '@example.invalid');
const password = 'Real local password 2026!';
let admin: ReturnType<typeof postgres>;
let web: ReturnType<typeof postgres>;
let csrfToken = '';
const users: string[] = [];

function request(
  path: string,
  method = 'GET',
  value?: unknown,
  session?: { token: string; csrf: string },
) {
  return new Request(origin + path, {
    method,
    headers: {
      Origin: origin,
      Cookie: session ? 'campus_session=' + session.token : 'campus_csrf=' + csrfToken,
      'X-CSRF-Token': session?.csrf ?? csrfToken,
      'Content-Type': 'application/json',
    },
    body: value === undefined ? undefined : JSON.stringify(value),
  });
}

async function signIn(email: string) {
  const response = await login(request('/api/v1/auth/login', 'POST', { email, password }));
  expect(response.status).toBe(200);
  const payload = await response.json();
  expect(payload.data).not.toHaveProperty('password');
  expect(payload.data).not.toHaveProperty('credentials');
  expect(payload.data).not.toHaveProperty('email');
  const cookies = response.headers.get('Set-Cookie') ?? '';
  expect(cookies).toContain('HttpOnly');
  expect(cookies).toContain('SameSite=Lax');
  const token = cookies.match(/campus_session=([A-Za-z0-9_-]{43})/)?.[1];
  expect(token).toBeTruthy();
  return { token: token!, csrf: response.headers.get('X-CSRF-Token')!, user: payload.data };
}

describe.skipIf(!enabled)('local PostgreSQL identity and opaque session lifecycle', () => {
  beforeAll(async () => {
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('AUTH_PROVIDER', 'local');
    vi.stubEnv('NEXT_PUBLIC_DATA_MODE', 'api');
    vi.stubEnv('SESSION_ENCRYPTION_KEY', Buffer.alloc(32, 19).toString('base64'));
    vi.stubEnv('APP_ORIGIN', origin);
    vi.stubEnv('SUPABASE_URL', '');
    vi.stubEnv('SUPABASE_ANON_KEY', '');
    admin = postgres(process.env.API_INTEGRATION_DATABASE_URL!, { max: 1 });
    web = postgres(process.env.DATABASE_URL!, { max: 1 });
    csrfToken = (await (await csrf(new Request(origin + '/api/v1/auth/csrf'))).json()).data
      .csrfToken;
  });
  afterAll(async () => {
    if (admin) {
      // Collect even when registration succeeds but a later assertion fails.
      const rows =
        await admin`select user_id from app.local_identities where email in (${emails[0]},${emails[1]})`;
      for (const row of rows) {
        await admin`delete from auth_sessions where user_id=${row.user_id}`;
        await admin`delete from users where id=${row.user_id}`;
      }
      await admin`delete from app.rate_limit_buckets where bucket in (${hash('register:' + emails[0])},${hash('register:' + emails[1])},${hash('login:' + emails[0])},${hash('login:' + emails[1])})`;
      await admin.end();
    }
    await web?.end();
    vi.unstubAllEnvs();
  });

  it('stores real salted identities, keeps credentials private and reports no email verification', async () => {
    const role =
      await web`select current_user, has_table_privilege(current_user,'app.local_identities','SELECT') can_read, has_table_privilege(current_user,'app.local_identities','INSERT') can_insert`;
    expect(role[0].current_user).not.toBe('postgres');
    expect(role[0].can_read).toBe(false);
    expect(role[0].can_insert).toBe(false);
    for (const email of emails) {
      const response = await register(
        request('/api/v1/auth/register', 'POST', {
          email: email.toUpperCase(),
          password,
          displayName: '真实同学',
        }),
      );
      expect(response.status).toBe(201);
      expect(await response.json()).toEqual({ data: { verificationRequired: false } });
      expect(response.headers.get('Set-Cookie')).toBeNull();
    }
    const stored =
      await admin`select user_id,email,password_hash from app.local_identities where email in (${emails[0]},${emails[1]}) order by email`;
    expect(stored).toHaveLength(2);
    users.push(...stored.map((row) => row.user_id));
    expect(stored[0].password_hash).not.toContain(password);
    expect(stored[0].password_hash).not.toBe(stored[1].password_hash);
    const duplicateName = 'dup-' + randomUUID().slice(0, 20);
    const duplicate = await register(
      request('/api/v1/auth/register', 'POST', {
        email: emails[0],
        password,
        displayName: duplicateName,
      }),
    );
    expect(duplicate.status).toBe(409);
    expect(await admin`select id from users where id in (${users[0]},${users[1]})`).toHaveLength(2);
    expect(await admin`select id from users where display_name=${duplicateName}`).toHaveLength(0);
  });

  it('rejects wrong passwords, missing users and requests without CSRF', async () => {
    for (const email of [emails[0], 'missing-' + randomUUID() + '@example.invalid']) {
      const response = await login(
        request('/api/v1/auth/login', 'POST', { email, password: password + 'wrong' }),
      );
      expect(response.status).toBe(401);
      expect((await response.json()).error.code).toBe('INVALID_CREDENTIALS');
      expect(response.headers.get('Set-Cookie')).toBeNull();
    }
    const noCsrf = new Request(origin + '/api/v1/auth/login', {
      method: 'POST',
      headers: { Origin: origin, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: emails[0], password }),
    });
    expect((await login(noCsrf)).status).toBe(403);
  });

  it('restores sessions, isolates account data and revokes on logout or expiration', async () => {
    const first = await signIn(emails[0].toUpperCase());
    const second = await signIn(emails[1]);
    expect(first.user.id).not.toBe(second.user.id);
    const restored = await me(request('/api/v1/me', 'GET', undefined, first));
    expect((await restored.json()).data.id).toBe(first.user.id);
    const updated = await patchMe(
      request('/api/v1/me', 'PATCH', { school: '仅第一个账号的学校' }, first),
    );
    expect(updated.status).toBe(200);
    const other = await me(request('/api/v1/me', 'GET', undefined, second));
    expect((await other.json()).data.school).toBeNull();
    expect((await logout(request('/api/v1/auth/logout', 'POST', undefined, first))).status).toBe(
      204,
    );
    expect((await me(request('/api/v1/me', 'GET', undefined, first))).status).toBe(401);
    expect((await me(request('/api/v1/me', 'GET', undefined, second))).status).toBe(200);
    await admin`update users set status='disabled' where id=${second.user.id}`;
    expect((await me(request('/api/v1/me', 'GET', undefined, second))).status).toBe(401);
    const disabledLogin = await login(
      request('/api/v1/auth/login', 'POST', { email: emails[1], password }),
    );
    expect(disabledLogin.status).toBe(401);
    await admin`update users set status='active' where id=${second.user.id}`;
    await admin`update auth_sessions set expires_at=now()-interval '1 second' where token_hash=${hash(second.token)}`;
    expect((await me(request('/api/v1/me', 'GET', undefined, second))).status).toBe(401);
  });
});
