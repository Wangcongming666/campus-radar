import { afterEach, describe, expect, it, vi } from 'vitest';
import { GET as jobs } from '../app/api/v1/jobs/route';
import { GET as companies } from '../app/api/v1/companies/route';
import { GET as experience } from '../app/api/v1/experiences/[id]/route';
import { GET as chapters } from '../app/api/v1/handbook/chapters/route';
import { GET as search } from '../app/api/v1/search/route';
import { POST as login } from '../app/api/v1/auth/login/route';
import { GET as me, PATCH as patchMe } from '../app/api/v1/me/route';
import { POST as batch } from '../app/api/internal/v1/crawl/batches/route';
import { GET as csrf } from '../app/api/v1/auth/csrf/route';
import { workerSignature, verifyWorkerSignature } from './worker';
import { MockAdapter, HttpAdapter, createAdapter } from '../lib/api/adapter';
const origin = 'http://localhost:3000';
const request = (path: string, init?: RequestInit) => new Request(origin + path, init);
afterEach(() => vi.unstubAllEnvs());
describe('public MVP BFF', () => {
  it('exposes mock metadata, UUID DTOs and stable pagination', async () => {
    vi.stubEnv('NEXT_PUBLIC_DATA_MODE', 'mock');
    const first = await jobs(request('/api/v1/jobs?limit=3&includeTotal=true'));
    expect(first.headers.get('X-Campus-Data-Mode')).toBe('mock');
    expect(first.headers.get('X-Request-Id')).toBeTruthy();
    const a = await first.json();
    expect(a.data).toHaveLength(3);
    expect(a.meta.total).toBe(12);
    expect(a.data[0].id).toMatch(/^[a-f0-9-]{36}$/);
    expect(a.data[0].source.name).toContain('演示');
    expect(a.data[0].descriptionMd).toBeUndefined();
    const b = await (
      await jobs(request('/api/v1/jobs?limit=3&includeTotal=true&cursor=' + a.page.nextCursor))
    ).json();
    expect(b.data).toHaveLength(3);
    expect(b.meta.total).toBeUndefined();
    expect(
      b.data.some((j: { id: string }) => a.data.some((k: { id: string }) => k.id === j.id)),
    ).toBe(false);
  });
  it('applies AND across dimensions, OR within each dimension and trimmed q', async () => {
    const value = await (
      await jobs(
        request('/api/v1/jobs?city=北京,深圳&role=frontend&q=%20前端%20&includeTotal=true'),
      )
    ).json();
    expect(value.meta.total).toBe(3);
    expect(
      value.data.every(
        (j: { role: string; cities: string[] }) =>
          j.role === 'frontend' && j.cities.some((c) => ['北京', '深圳'].includes(c)),
      ),
    ).toBe(true);
  });
  it('keeps null deadlines last', async () => {
    const value = await (await jobs(request('/api/v1/jobs?sort=deadline&limit=100'))).json();
    expect(value.data.at(-1).deadlineAt).toBeNull();
    expect(value.data[0].deadlineAt).toContain('2026-10-26');
  });
  it('rejects malformed or mismatched cursors, limits and sort', async () => {
    const a = await (await jobs(request('/api/v1/jobs?limit=1'))).json();
    for (const path of [
      '/api/v1/jobs?cursor=garbage',
      '/api/v1/jobs?limit=101',
      '/api/v1/jobs?sort=sql',
      '/api/v1/jobs?city=北京&cursor=' + a.page.nextCursor,
    ]) {
      const response = await jobs(request(path));
      expect(response.status).toBe(422);
      expect((await response.json()).error.requestId).toBeTruthy();
    }
  });
  it('serves company search, grouped links, chapter summaries and validates detail IDs', async () => {
    const list = await (await companies(request('/api/v1/companies?q=腾讯'))).json();
    expect(list.data).toHaveLength(1);
    const found = await (await search(request('/api/v1/search?q=前端&types=job,handbook'))).json();
    expect(found.data.jobs.length).toBeGreaterThan(0);
    expect(found.data.companies).toEqual([]);
    expect(found.data.jobs[0].href).toMatch(/^\/jobs\//);
    const all = await (await chapters(request('/api/v1/handbook/chapters'))).json();
    expect(all.data).toHaveLength(6);
    expect(all.data[0].bodyMd).toBeUndefined();
    expect(
      (
        await experience(request('/api/v1/experiences/not-a-uuid'), {
          params: Promise.resolve({ id: 'not-a-uuid' }),
        })
      ).status,
    ).toBe(422);
  });
  it('never falls back when live DB is absent', async () => {
    vi.stubEnv('NEXT_PUBLIC_DATA_MODE', 'api');
    vi.stubEnv('DATABASE_URL', '');
    const response = await jobs(request('/api/v1/jobs'));
    expect(response.status).toBe(503);
    expect((await response.json()).error.code).toBe('SERVICE_UNAVAILABLE');
  });
});
describe('auth and CSRF', () => {
  it('rejects cross-origin writes before configuration checks', async () => {
    const response = await login(
      request('/api/v1/auth/login', {
        method: 'POST',
        headers: { Origin: 'https://evil.example', 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'student@example.com', password: 'password123456' }),
      }),
    );
    expect(response.status).toBe(403);
    expect(
      (
        await patchMe(
          request('/api/v1/me', { method: 'PATCH', headers: { Origin: 'https://evil.example' } }),
        )
      ).status,
    ).toBe(403);
  });
  it('issues an HttpOnly double-submit token and fails honestly without provider', async () => {
    const response = await csrf(request('/api/v1/auth/csrf'));
    expect(response.headers.get('Set-Cookie')).toContain('HttpOnly');
    const value = await response.json();
    const submitted = await login(
      request('/api/v1/auth/login', {
        method: 'POST',
        headers: {
          Origin: origin,
          Cookie: 'campus_csrf=' + value.data.csrfToken,
          'X-CSRF-Token': value.data.csrfToken,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email: 'student@example.com', password: 'password123456' }),
      }),
    );
    expect(submitted.status).toBe(503);
    expect((await submitted.json()).data).toBeUndefined();
  });
  it('does not authenticate a demo account', async () => {
    expect((await me(request('/api/v1/me'))).status).toBe(503);
  });
});
describe('worker HMAC', () => {
  it('rejects body tampering, expired timestamps and altered method', () => {
    vi.stubEnv('WORKER_HMAC_KEY', 'test-worker-key-at-least-32-characters');
    vi.stubEnv('WORKER_HMAC_KEY_ID', 'test');
    const timestamp = String(Math.floor(Date.now() / 1000)),
      nonce = 'nonce_1234567890123',
      raw = '{"jobs":[]}';
    const headers = {
      'X-Worker-Key-Id': 'test',
      'X-Worker-Timestamp': timestamp,
      'X-Worker-Nonce': nonce,
      'X-Worker-Signature': workerSignature(
        'test-worker-key-at-least-32-characters',
        timestamp,
        nonce,
        'POST',
        '/api/internal/v1/crawl/batches',
        raw,
      ),
    };
    const req = request('/api/internal/v1/crawl/batches', { method: 'POST', headers });
    expect(verifyWorkerSignature(req, raw).nonce).toBe(nonce);
    expect(() => verifyWorkerSignature(req, raw + ' ')).toThrow();
    expect(() => verifyWorkerSignature(req, raw, Date.now() + 301000)).toThrow();
    expect(() =>
      verifyWorkerSignature(
        request('/api/internal/v1/crawl/batches', { method: 'PUT', headers }),
        raw,
      ),
    ).toThrow();
  });
  it('rejects worker writes when keys are absent', async () => {
    vi.stubEnv('WORKER_HMAC_KEY', '');
    expect(
      (await batch(request('/api/internal/v1/crawl/batches', { method: 'POST', body: '{}' })))
        .status,
    ).toBe(503);
  });
});
it('keeps client adapter modes explicit without fallback', async () => {
  const fetcher: typeof fetch = async () =>
    Response.json(
      { data: [], page: { nextCursor: null, hasMore: false }, meta: {} },
      { headers: { 'X-Campus-Data-Mode': 'mock' } },
    );
  expect(createAdapter('mock')).toBeInstanceOf(MockAdapter);
  expect(() => createAdapter('typo')).toThrow();
  await expect(new HttpAdapter({ fetcher }).jobs()).rejects.toMatchObject({
    code: 'DATA_MODE_MISMATCH',
  });
  await expect(new MockAdapter({ fetcher }).jobs()).resolves.toMatchObject({ data: [] });
});
