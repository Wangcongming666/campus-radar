import postgres, { type TransactionSql } from 'postgres';
import { dataMode, unavailable } from './http';
export type Db = TransactionSql;
const pools = new Map<string, ReturnType<typeof postgres>>();
export function database(kind: 'web' | 'worker' = 'web') {
  const url = kind === 'worker' ? process.env.DATABASE_WORKER_URL : process.env.DATABASE_URL;
  if (!url || dataMode() !== 'api') throw unavailable();
  let pool = pools.get(url);
  if (!pool) {
    pool = postgres(url, { max: 5, prepare: false, connect_timeout: 5, idle_timeout: 20 });
    pools.set(url, pool);
  }
  return pool;
}
export async function transaction<T>(
  userId: string | null,
  run: (sql: Db) => Promise<T>,
): Promise<T> {
  return (await database().begin(async (sql) => {
    await sql`select set_config('app.user_id', ${userId ?? ''}, true)`;
    return await run(sql);
  })) as T;
}
export function camel<T>(row: unknown): T {
  if (row instanceof Date) return row.toISOString() as T;
  if (Array.isArray(row)) return row.map((x) => camel(x)) as T;
  if (row && typeof row === 'object')
    return Object.fromEntries(
      Object.entries(row).map(([k, v]) => [
        k.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase()),
        camel(v),
      ]),
    ) as T;
  return row as T;
}
