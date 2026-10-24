import { randomUUID, createHash, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public fieldErrors?: Record<string, string[]>,
  ) {
    super(message);
  }
}
export const unavailable = () =>
  new ApiError(503, 'SERVICE_UNAVAILABLE', '服务尚未配置，请联系管理员。');
export const notFound = () => new ApiError(404, 'NOT_FOUND', '未找到该资源。');
export const conflict = () =>
  new ApiError(409, 'VERSION_CONFLICT', '这条记录已更新，请刷新后重试。');
export function dataMode(): 'mock' | 'api' {
  const mode = process.env.NEXT_PUBLIC_DATA_MODE ?? 'mock';
  if (mode !== 'mock' && mode !== 'api') throw unavailable();
  return mode;
}
export function hash(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
export function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a),
    y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
export function cookie(request: Request, name: string): string | undefined {
  const value = request.headers
    .get('cookie')
    ?.split(';')
    .map((v) => v.trim())
    .find((v) => v.startsWith(name + '='))
    ?.slice(name.length + 1);
  try {
    return value === undefined ? undefined : decodeURIComponent(value);
  } catch {
    return undefined;
  }
}
export function cookieName(kind: 'session' | 'csrf' | 'pkce'): string {
  return `${process.env.NODE_ENV === 'production' ? '__Host-' : ''}campus_${kind}`;
}
export function setCookie(
  response: Response,
  kind: 'session' | 'csrf' | 'pkce',
  value: string,
  maxAge: number,
): void {
  response.headers.append(
    'Set-Cookie',
    `${cookieName(kind)}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`,
  );
}
export function assertOrigin(request: Request): void {
  const expected = process.env.APP_ORIGIN ?? new URL(request.url).origin;
  if (
    request.headers.get('origin') !== expected ||
    request.headers.get('sec-fetch-site') === 'cross-site'
  )
    throw new ApiError(403, 'CSRF_REJECTED', '请求来源验证失败。');
}
export function assertCsrf(request: Request, expected?: string): void {
  assertOrigin(request);
  const provided = request.headers.get('X-CSRF-Token');
  const token = expected ?? cookie(request, cookieName('csrf'));
  if (!provided || !token || !safeEqual(provided, token))
    throw new ApiError(403, 'CSRF_REJECTED', '安全令牌无效，请刷新后重试。');
}
export async function body<T>(request: Request, schema: z.ZodType<T>): Promise<T> {
  const raw = await readBody(request, 1024 * 1024);
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new ApiError(400, 'INVALID_JSON', '请求必须为有效 JSON。');
  }
  const result = schema.safeParse(parsed);
  if (!result.success)
    throw new ApiError(
      422,
      'VALIDATION_ERROR',
      '请检查输入内容。',
      z.flattenError(result.error).fieldErrors as Record<string, string[]>,
    );
  return result.data;
}
export async function readBody(request: Request, max: number): Promise<string> {
  if (Number(request.headers.get('content-length')) > max)
    throw new ApiError(413, 'BAD_REQUEST', '请求内容过大。');
  const reader = request.body?.getReader();
  if (!reader) return '';
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      await reader.cancel();
      throw new ApiError(413, 'BAD_REQUEST', '请求内容过大。');
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString('utf8');
}
export const uuid = z.string().uuid();
export function parseId(value: string): string {
  if (!uuid.safeParse(value).success) throw new ApiError(422, 'VALIDATION_ERROR', '资源 ID 无效。');
  return value;
}
export function json(value: unknown, status = 200): Response {
  return Response.json(value, { status });
}
export function route(
  handler: (
    request: Request,
    context: { params: Promise<Record<string, string>> },
  ) => Promise<Response>,
) {
  return async (
    request: Request,
    context: { params: Promise<Record<string, string>> } = { params: Promise.resolve({}) },
  ): Promise<Response> => {
    const requestId = randomUUID();
    try {
      const response = await handler(request, context);
      response.headers.set('X-Request-Id', requestId);
      response.headers.set('Cache-Control', 'no-store');
      response.headers.set('X-Campus-Data-Mode', dataMode());
      return response;
    } catch (error) {
      const e =
        error instanceof ApiError
          ? error
          : new ApiError(500, 'INTERNAL_ERROR', '服务出现错误，请稍后重试。');
      const response = json(
        {
          error: {
            code: e.code,
            message: e.message,
            requestId,
            ...(e.fieldErrors ? { fieldErrors: e.fieldErrors } : {}),
          },
        },
        e.status,
      );
      response.headers.set('X-Request-Id', requestId);
      response.headers.set('Cache-Control', 'no-store');
      return response;
    }
  };
}
