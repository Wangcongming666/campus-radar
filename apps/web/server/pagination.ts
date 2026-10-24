import { z } from 'zod';
import { ApiError, hash } from './http';
import type { ApiList } from '../lib/api/contracts';
const cursorSchema = z
  .object({
    v: z.literal(1),
    filter: z.string().length(64),
    id: z.string().max(200),
    sort: z.string().nullable(),
  })
  .strict();
export function listQuery(params: URLSearchParams) {
  const q = (params.get('q') ?? '').trim();
  const limit = Number(params.get('limit') ?? 20);
  if (q.length > 100 || !Number.isInteger(limit) || limit < 1 || limit > 100)
    throw new ApiError(422, 'VALIDATION_ERROR', '查询过长或分页大小无效。');
  const stable = new URLSearchParams(params);
  stable.delete('cursor');
  stable.delete('limit');
  stable.delete('includeTotal');
  stable.sort();
  return {
    q,
    limit,
    filter: hash(stable.toString()),
    cursor: params.get('cursor'),
    includeTotal: params.get('includeTotal') === 'true',
  };
}
export function decodeCursor(value: string | null, filter: string) {
  if (!value) return null;
  try {
    if (value.length > 2048) throw Error();
    const c = cursorSchema.parse(JSON.parse(Buffer.from(value, 'base64url').toString()));
    if (c.filter !== filter) throw Error();
    return c;
  } catch {
    throw new ApiError(422, 'INVALID_CURSOR', '分页位置无效，请重新加载。');
  }
}
export function paginate<T extends { id: string }>(
  items: T[],
  params: URLSearchParams,
  sortValue: (v: T) => string | null = () => null,
): ApiList<T> {
  const query = listQuery(params);
  const cursor = decodeCursor(query.cursor, query.filter);
  let start = 0;
  if (cursor) {
    const index = items.findIndex((v) => v.id === cursor.id && sortValue(v) === cursor.sort);
    if (index < 0) throw new ApiError(422, 'INVALID_CURSOR', '分页位置已失效。');
    start = index + 1;
  }
  const data = items.slice(start, start + query.limit);
  const hasMore = start + data.length < items.length;
  const last = data.at(-1);
  return {
    data,
    page: {
      hasMore,
      nextCursor:
        hasMore && last
          ? Buffer.from(
              JSON.stringify({ v: 1, filter: query.filter, id: last.id, sort: sortValue(last) }),
            ).toString('base64url')
          : null,
    },
    meta: { ...(query.includeTotal && !cursor ? { total: items.length } : {}) },
  };
}
export function values(params: URLSearchParams, key: string): string[] {
  return (params.get(key) ?? '')
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
}
export function match(params: URLSearchParams, key: string, value: string | string[]): boolean {
  const wanted = values(params, key);
  return !wanted.length || (Array.isArray(value) ? value : [value]).some((v) => wanted.includes(v));
}
