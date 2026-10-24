import { createHmac } from 'node:crypto';
import { z } from 'zod';
import { database } from './db';
import { ApiError, hash, json, readBody, safeEqual, unavailable } from './http';
import type { CrawlBatchResult } from '../lib/api/contracts';
export function workerSignature(
  secret: string,
  timestamp: string,
  nonce: string,
  method: string,
  pathname: string,
  rawBody: string,
): string {
  return createHmac('sha256', secret)
    .update([timestamp, nonce, method, pathname, hash(rawBody)].join('\n'))
    .digest('hex');
}
export function verifyWorkerSignature(
  request: Request,
  raw: string,
  now = Date.now(),
): { keyId: string; nonce: string } {
  const secret = process.env.WORKER_HMAC_KEY,
    keyId = process.env.WORKER_HMAC_KEY_ID;
  if (!secret || Buffer.byteLength(secret) < 32 || !keyId) throw unavailable();
  const timestamp = request.headers.get('X-Worker-Timestamp') ?? '',
    nonce = request.headers.get('X-Worker-Nonce') ?? '',
    signature = request.headers.get('X-Worker-Signature') ?? '';
  const fail = () => new ApiError(403, 'INVALID_WORKER_SIGNATURE', 'Worker 签名无效。');
  if (
    request.headers.get('X-Worker-Key-Id') !== keyId ||
    !/^\d{10}$/.test(timestamp) ||
    Math.abs(now / 1000 - Number(timestamp)) > 300 ||
    !/^[a-zA-Z0-9_-]{16,128}$/.test(nonce) ||
    !/^[a-f0-9]{64}$/.test(signature)
  )
    throw fail();
  if (
    !safeEqual(
      signature,
      workerSignature(secret, timestamp, nonce, request.method, new URL(request.url).pathname, raw),
    )
  )
    throw fail();
  return { keyId, nonce };
}
const uuid = z.string().uuid();
const datetime = z.iso.datetime({ offset: true });
const batchSchema = z
  .object({
    sourceId: uuid,
    runId: uuid,
    taskId: uuid,
    leaseToken: uuid,
    batchId: uuid,
    jobs: z.array(z.unknown()).max(100),
    final: z.boolean(),
  })
  .strict();
const salary = z
  .object({
    schemaVersion: z.literal(1),
    currency: z.string().regex(/^[A-Z]{3}$/),
    period: z.enum(['month', 'year', 'day']),
    minMinor: z.number().int().nonnegative().nullable(),
    maxMinor: z.number().int().nonnegative().nullable(),
    months: z.number().positive().nullable(),
    negotiable: z.boolean(),
  })
  .strict()
  .refine((s) => s.minMinor === null || s.maxMinor === null || s.minMinor <= s.maxMinor);
const jobSchema = z
  .object({
    externalId: z.string().max(200).nullable(),
    companyId: uuid,
    canonicalUrl: z.url(),
    title: z.string().trim().min(1).max(300),
    role: z.string().trim().min(1).max(64),
    cities: z.array(z.string().max(100)).max(100),
    education: z.enum(['any', 'associate', 'bachelor', 'master', 'doctorate']),
    recruitmentType: z.enum(['campus', 'internship']),
    graduationYears: z.array(z.number().int().min(2000).max(2100)).max(100),
    skills: z.array(z.string().max(100)).max(100),
    descriptionMd: z.string().max(50000),
    salary: salary.nullable(),
    deadlineAt: datetime.nullable(),
    deadlinePrecision: z.enum(['exact', 'date', 'unknown']),
    sourceTimezone: z.string().max(64),
    publishedAt: datetime,
    observedAt: datetime,
    status: z.enum(['open', 'closed', 'unknown']),
    contentHash: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict()
  .refine((j) => (j.deadlinePrecision === 'unknown') === (j.deadlineAt === null));
export async function ingestBatch(request: Request): Promise<Response> {
  const raw = await readBody(request, 1024 * 1024);
  const signature = verifyWorkerSignature(request, raw);
  const db = database('worker');
  await db`delete from worker_nonces where expires_at<now()`;
  const nonce =
    await db`insert into worker_nonces(key_id,nonce,expires_at) values(${signature.keyId},${signature.nonce},now()+interval '10 minutes') on conflict do nothing returning nonce`;
  if (!nonce.length) throw new ApiError(403, 'INVALID_WORKER_SIGNATURE', 'Worker 请求已重放。');
  let decoded: unknown;
  try {
    decoded = JSON.parse(raw);
  } catch {
    throw new ApiError(400, 'INVALID_JSON', '请求必须为有效 JSON。');
  }
  const parsed = batchSchema.safeParse(decoded);
  if (!parsed.success) throw new ApiError(422, 'VALIDATION_ERROR', '采集批次格式无效。');
  const batch = parsed.data;
  const bodyHash = hash(raw);
  return (await db.begin(async (sql) => {
    await sql`select pg_advisory_xact_lock(hashtextextended(${batch.runId},0))`;
    const sources = await sql`select * from sources where id=${batch.sourceId}::uuid`;
    const source = sources[0];
    if (
      !source ||
      !source.enabled ||
      source.permission_status !== 'approved' ||
      !source.robots_checked_at ||
      !source.terms_note.trim()
    )
      throw new ApiError(403, 'SOURCE_NOT_APPROVED', '采集来源未获准。');
    await sql`select id from tasks where id=${batch.taskId}::uuid and type='CRAWL_JOBS' for update`;
    const runs =
      await sql`select r.*,t.state task_state,t.lease_token,t.lease_until,t.expires_at,t.payload from crawl_runs r join tasks t on t.id=r.task_id where r.id=${batch.runId}::uuid and r.task_id=${batch.taskId}::uuid and r.source_id=${batch.sourceId}::uuid and t.type='CRAWL_JOBS' for update of r`;
    const run = runs[0];
    if (!run || run.payload.sourceId !== batch.sourceId)
      throw new ApiError(409, 'LEASE_EXPIRED', '任务租约无效。');
    const previous =
      await sql`select * from crawl_batches where run_id=${batch.runId}::uuid and batch_id=${batch.batchId}::uuid`;
    if (previous[0]) {
      if (previous[0].body_hash !== bodyHash)
        throw new ApiError(409, 'IDEMPOTENCY_CONFLICT', '采集批次标识已用于不同内容。');
      return json({ data: previous[0].result });
    }
    if (
      run.task_state !== 'running' ||
      run.status !== 'running' ||
      run.lease_token !== batch.leaseToken ||
      new Date(run.lease_until).getTime() <= Date.now() ||
      (run.expires_at && new Date(run.expires_at).getTime() <= Date.now())
    )
      throw new ApiError(409, 'LEASE_EXPIRED', '任务租约已过期。');
    const result: CrawlBatchResult = {
      batchId: batch.batchId,
      inserted: 0,
      updated: 0,
      unchanged: 0,
      rejected: [],
      finalized: batch.final,
    };
    for (let index = 0; index < batch.jobs.length; index++) {
      const candidate = jobSchema.safeParse(batch.jobs[index]);
      if (!candidate.success) {
        result.rejected.push({ index, code: 'VALIDATION_ERROR', message: '岗位数据格式无效。' });
        continue;
      }
      const job = candidate.data;
      const url = new URL(job.canonicalUrl);
      if (
        job.companyId !== source.company_id ||
        url.protocol !== 'https:' ||
        !(source.allowed_hosts as string[]).includes(url.hostname) ||
        url.username ||
        url.password
      ) {
        result.rejected.push({
          index,
          code: 'SOURCE_NOT_APPROVED',
          message: '岗位公司或来源地址不符合准入配置。',
        });
        continue;
      }
      // Savepoints isolate item constraints without discarding other valid rows.
      try {
        await sql.savepoint(async (item) => {
          const records =
            await item`select id,content_hash,canonical_url,source_external_id from jobs where source_id=${batch.sourceId}::uuid and (canonical_url=${job.canonicalUrl} or (${job.externalId}::text is not null and source_external_id=${job.externalId})) for update`;
          if (records.length > 1) {
            result.rejected.push({
              index,
              code: 'IDENTITY_CONFLICT',
              message: '岗位规范地址与外部标识冲突。',
            });
            return;
          }
          const existing = records[0];
          if (existing?.content_hash === job.contentHash) {
            await item`update jobs set last_seen_at=greatest(last_seen_at,${job.observedAt}::timestamptz),verified_at=now(),updated_at=now() where id=${existing.id}::uuid`;
            result.unchanged++;
            return;
          }
          const fields = {
            company_id: job.companyId,
            source_id: batch.sourceId,
            source_external_id: job.externalId,
            canonical_url: job.canonicalUrl,
            title: job.title,
            role: job.role,
            cities: job.cities,
            education: job.education,
            recruitment_type: job.recruitmentType,
            graduation_years: job.graduationYears,
            skills: job.skills,
            description_md: job.descriptionMd,
            salary: job.salary ? item.json(job.salary) : null,
            deadline_at: job.deadlineAt,
            deadline_precision: job.deadlinePrecision,
            source_timezone: job.sourceTimezone,
            published_at: job.publishedAt,
            last_seen_at: job.observedAt,
            verified_at: new Date(),
            status: job.status,
            content_hash: job.contentHash,
            updated_at: new Date(),
          };
          if (existing) {
            await item`update jobs set ${item(fields)} where id=${existing.id}::uuid`;
            result.updated++;
          } else {
            await item`insert into jobs ${item(fields)}`;
            result.inserted++;
          }
        });
      } catch {
        result.rejected.push({
          index,
          code: 'VALIDATION_ERROR',
          message: '岗位数据未满足入库约束。',
        });
      }
    }
    await sql`insert into crawl_batches(run_id,batch_id,body_hash,result,final) values(${batch.runId}::uuid,${batch.batchId}::uuid,${bodyHash},${sql.json(result)},${batch.final})`;
    const old = run.counts as { changed?: number; skipped?: number; failed?: number };
    const counts = {
      schemaVersion: 1,
      changed: (old.changed ?? 0) + result.inserted + result.updated,
      skipped: (old.skipped ?? 0) + result.unchanged,
      failed: (old.failed ?? 0) + result.rejected.length,
    };
    await sql`update crawl_runs set counts=${sql.json(counts)},updated_at=now() where id=${batch.runId}::uuid`;
    if (batch.final) {
      await sql`update crawl_runs set status='succeeded',finished_at=now(),updated_at=now() where id=${batch.runId}::uuid`;
      await sql`update tasks set state='succeeded',progress=100,result_ref=${sql.json({ schemaVersion: 1, runId: batch.runId, counts })},lease_owner=null,lease_until=null,lease_token=null,updated_at=now() where id=${batch.taskId}::uuid`;
    }
    return json({ data: result });
  })) as Response;
}
