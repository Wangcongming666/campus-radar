import { randomBytes, createCipheriv, createDecipheriv, createHmac } from 'node:crypto';
import { z } from 'zod';
import {
  ApiError,
  assertCsrf,
  assertOrigin,
  body,
  cookie,
  cookieName,
  hash,
  json,
  safeEqual,
  setCookie,
  unavailable,
  dataMode,
} from './http';
import { database, transaction, type Db, camel } from './db';
import type { User } from '../lib/api/contracts';
const credentialSchema = z.object({
  access_token: z.string(),
  refresh_token: z.string(),
  expires_at: z.number(),
  email: z.string(),
  userId: z.string().uuid(),
});
type Credentials = z.infer<typeof credentialSchema>;
export interface Session {
  userId: string;
  tokenHash: string;
  createdAt: string;
  csrf: string;
  credentials: Credentials;
}
function key(): Buffer {
  const raw = process.env.SESSION_ENCRYPTION_KEY;
  if (!raw) throw unavailable();
  const value = Buffer.from(raw, 'base64');
  if (value.length !== 32) throw unavailable();
  return value;
}
function authConfig() {
  if (process.env.NODE_ENV === 'production' && !process.env.APP_ORIGIN) throw unavailable();
  if (
    dataMode() !== 'api' ||
    !process.env.DATABASE_URL ||
    !process.env.SUPABASE_URL ||
    !process.env.SUPABASE_ANON_KEY
  )
    throw unavailable();
  key();
  return {
    url: process.env.SUPABASE_URL.replace(/\/$/, ''),
    apiKey: process.env.SUPABASE_ANON_KEY,
  };
}
export function seal(value: unknown): Buffer {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]);
}
function unseal(value: Buffer): unknown {
  const decipher = createDecipheriv('aes-256-gcm', key(), value.subarray(0, 12));
  decipher.setAuthTag(value.subarray(12, 28));
  return JSON.parse(
    Buffer.concat([decipher.update(value.subarray(28)), decipher.final()]).toString(),
  );
}
export function sessionCsrf(tokenHash: string): string {
  return createHmac('sha256', key())
    .update('csrf:' + tokenHash)
    .digest('base64url');
}
export async function authenticate(request: Request, write = false): Promise<Session> {
  if (write) assertOrigin(request);
  authConfig();
  const token = cookie(request, cookieName('session'));
  if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token))
    throw new ApiError(401, 'AUTH_REQUIRED', '请先登录。');
  const tokenHash = hash(token);
  const rows = await database()`select * from app.resolve_session(${tokenHash})`;
  const row = rows[0];
  if (!row) throw new ApiError(401, 'AUTH_REQUIRED', '会话已过期，请重新登录。');
  const session: Session = {
    userId: String(row.user_id),
    tokenHash,
    createdAt: new Date(row.created_at).toISOString(),
    csrf: sessionCsrf(tokenHash),
    credentials: credentialSchema.parse(unseal(row.encrypted_provider_credentials as Buffer)),
  };
  if (write) assertCsrf(request, session.csrf);
  return session;
}
export async function rateLimit(sql: Db, bucket: string, max: number, seconds: number) {
  const rows = await sql`select app.consume_rate_limit(${hash(bucket)},${max},${seconds}) allowed`;
  if (!rows[0]?.allowed) throw new ApiError(429, 'RATE_LIMITED', '请求过于频繁，请稍后再试。');
}
async function provider(path: string, payload?: unknown, accessToken?: string) {
  const config = authConfig();
  let response: Response;
  try {
    response = await fetch(config.url + '/auth/v1' + path, {
      method: 'POST',
      headers: {
        apikey: config.apiKey,
        'Content-Type': 'application/json',
        ...(accessToken ? { Authorization: 'Bearer ' + accessToken } : {}),
      },
      body: payload === undefined ? undefined : JSON.stringify(payload),
      signal: AbortSignal.timeout(10000),
      cache: 'no-store',
    });
  } catch {
    throw new ApiError(503, 'UPSTREAM_UNAVAILABLE', '身份服务暂时不可用。');
  }
  if (!response.ok) {
    if (response.status === 400 || response.status === 401 || response.status === 422)
      throw new ApiError(401, 'INVALID_CREDENTIALS', '邮箱、密码或验证链接无效。');
    throw new ApiError(503, 'UPSTREAM_UNAVAILABLE', '身份服务暂时不可用。');
  }
  if (response.status === 204) return null;
  return response.json();
}
const providerSessionSchema = z.object({
  access_token: z.string(),
  refresh_token: z.string(),
  expires_in: z.number(),
  user: z.object({
    id: z.string().uuid(),
    email: z.string().email(),
    user_metadata: z.record(z.string(), z.unknown()).optional(),
    email_confirmed_at: z.string().nullable().optional(),
  }),
});
async function createSession(value: unknown, response: Response) {
  const providerSession = providerSessionSchema.parse(value);
  if (!providerSession.user.email_confirmed_at)
    throw new ApiError(401, 'INVALID_CREDENTIALS', '请先完成邮箱验证。');
  const token = randomBytes(32).toString('base64url');
  const tokenHash = hash(token);
  const credentials: Credentials = {
    access_token: providerSession.access_token,
    refresh_token: providerSession.refresh_token,
    expires_at: Date.now() + providerSession.expires_in * 1000,
    email: providerSession.user.email,
    userId: providerSession.user.id,
  };
  const displayName = String(providerSession.user.user_metadata?.display_name ?? '同学').slice(
    0,
    40,
  );
  await database()`select app.create_auth_session(${credentials.userId}::uuid,${displayName},${seal(credentials)},${tokenHash},${new Date(Date.now() + 7 * 86400000)})`;
  setCookie(response, 'session', token, 7 * 86400);
  setCookie(response, 'csrf', '', 0);
  response.headers.set('X-CSRF-Token', sessionCsrf(tokenHash));
  return { userId: credentials.userId, email: credentials.email };
}
export async function userDto(sql: Db, userId: string, email: string): Promise<User> {
  const rows = await sql`select * from users where id=${userId}::uuid and status='active'`;
  const row = rows[0];
  if (!row) throw new ApiError(401, 'AUTH_REQUIRED', '账户不可用。');
  const user = camel<User>(row);
  const counts =
    await sql`select count(*)::int applications,count(*) filter(where stage in ('INTERVIEW_1','INTERVIEW_2','HR'))::int interviews,count(*) filter(where stage='OFFER')::int offers from applications where user_id=${userId}::uuid and archived_at is null`;
  const favorites =
    await sql`select count(*)::int count from favorites where user_id=${userId}::uuid`;
  const [local, domain] = email.split('@');
  return {
    id: user.id,
    displayName: user.displayName,
    emailMasked: local.slice(0, 1) + '***@' + domain,
    avatarUrl: user.avatarUrl,
    graduationYear: user.graduationYear,
    education: user.education,
    school: user.school,
    onboardingStep: user.onboardingStep,
    preferences: user.preferences,
    theme: user.theme,
    timezone: user.timezone,
    overview: {
      applications: counts[0].applications,
      interviews: counts[0].interviews,
      offers: counts[0].offers,
      favorites: favorites[0].count,
    },
  };
}
export async function csrf(request: Request): Promise<Response> {
  assertOriginForRead(request);
  const token = randomBytes(32).toString('base64url');
  const response = json({ data: { csrfToken: token } });
  setCookie(response, 'csrf', token, 900);
  return response;
}
function assertOriginForRead(request: Request) {
  const origin = request.headers.get('origin');
  if (origin) assertOrigin(request);
  if (request.headers.get('sec-fetch-site') === 'cross-site')
    throw new ApiError(403, 'CSRF_REJECTED', '请求来源验证失败。');
}
export async function login(request: Request): Promise<Response> {
  assertCsrf(request);
  authConfig();
  const input = await body(
    request,
    z.object({ email: z.string().email().max(254), password: z.string().min(1).max(128) }).strict(),
  );
  await transaction(null, (sql) => rateLimit(sql, 'login:' + input.email.toLowerCase(), 5, 900));
  const session = await provider('/token?grant_type=password', input);
  const response = json({ data: null });
  const identity = await createSession(session, response);
  const user = await transaction(identity.userId, (sql) =>
    userDto(sql, identity.userId, identity.email),
  );
  const final = json({ data: user });
  for (const [name, value] of response.headers) final.headers.append(name, value);
  return final;
}
export async function register(request: Request): Promise<Response> {
  assertCsrf(request);
  authConfig();
  const input = await body(
    request,
    z
      .object({
        email: z.string().email().max(254),
        password: z.string().min(12).max(128),
        displayName: z.string().min(1).max(40),
      })
      .strict(),
  );
  await transaction(null, (sql) => rateLimit(sql, 'register:' + input.email.toLowerCase(), 5, 900));
  const verifier = randomBytes(48).toString('base64url'),
    state = randomBytes(32).toString('base64url');
  const origin = process.env.APP_ORIGIN ?? new URL(request.url).origin;
  const redirect = new URL('/auth/callback', origin);
  redirect.searchParams.set('state', state);
  await provider('/signup?redirect_to=' + encodeURIComponent(redirect.toString()), {
    email: input.email,
    password: input.password,
    data: { display_name: input.displayName },
    code_challenge: Buffer.from(hash(verifier), 'hex').toString('base64url'),
    code_challenge_method: 's256',
  });
  const response = json({ data: { verificationRequired: true } }, 202);
  setCookie(
    response,
    'pkce',
    seal({ verifier, state, returnTo: '/onboarding', expiresAt: Date.now() + 3600000 }).toString(
      'base64url',
    ),
    3600,
  );
  return response;
}
export async function callback(request: Request): Promise<Response> {
  authConfig();
  const params = new URL(request.url).searchParams;
  const raw = cookie(request, cookieName('pkce'));
  if (!raw) throw new ApiError(401, 'INVALID_CREDENTIALS', '验证链接已失效。');
  let state: z.infer<typeof pkceSchema>;
  try {
    state = pkceSchema.parse(unseal(Buffer.from(raw, 'base64url')));
  } catch {
    throw new ApiError(401, 'INVALID_CREDENTIALS', '验证链接已失效。');
  }
  if (
    state.expiresAt < Date.now() ||
    !safeEqual(params.get('state') ?? '', state.state) ||
    !params.get('code')
  )
    throw new ApiError(401, 'INVALID_CREDENTIALS', '验证链接已失效。');
  const value = await provider('/token?grant_type=pkce', {
    auth_code: params.get('code'),
    code_verifier: state.verifier,
  });
  const origin = process.env.APP_ORIGIN ?? new URL(request.url).origin;
  const target =
    state.returnTo.startsWith('/') &&
    !state.returnTo.startsWith('//') &&
    !state.returnTo.includes('\\')
      ? state.returnTo
      : '/';
  const response = new Response(null, {
    status: 303,
    headers: { Location: new URL(target, origin).toString() },
  });
  await createSession(value, response);
  setCookie(response, 'pkce', '', 0);
  return response;
}
const pkceSchema = z.object({
  verifier: z.string(),
  state: z.string(),
  returnTo: z.string(),
  expiresAt: z.number(),
});
export async function logout(request: Request): Promise<Response> {
  const session = await authenticate(request, true);
  await database()`select app.revoke_session(${session.tokenHash})`;
  const response = new Response(null, { status: 204 });
  setCookie(response, 'session', '', 0);
  return response;
}
