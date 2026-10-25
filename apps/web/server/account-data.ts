import { createHash, createHmac, randomBytes } from 'node:crypto';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { z } from 'zod';
import { authenticate, rateLimit } from './auth';
import { transaction, type Db } from './db';
import { ApiError, body, conflict, hash, json, readBody, safeEqual, unavailable } from './http';
import { inspectPrivateFile } from './files';
import { authorizeSpec, readResource, saveResources } from './workspace';
import { validateWorkspaceValue, workspaceSpec } from './workspace-schema';

const MAX_FILES = 50 * 1024 * 1024;
const MAX_BACKUP = 100 * 1024 * 1024;
const uuid = z.string().uuid();
const time = z.string().datetime({ offset: true });
const nullableTime = time.nullable();
const numeric = z.union([z.number().finite(), z.string().regex(/^-?\d+(?:\.\d+)?$/)]);
const stage = z.enum([
  'PENDING',
  'APPLIED',
  'ASSESSMENT',
  'INTERVIEW_1',
  'INTERVIEW_2',
  'HR',
  'OFFER',
  'CLOSED',
]);
const reason = z.enum(['rejected', 'withdrawn', 'expired', 'accepted', 'other']);
const profileSchema = z
  .object({
    displayName: z.string().min(1).max(40),
    school: z.string().max(120).nullable(),
    graduationYear: z.number().int().min(2020).max(2100).nullable(),
    education: z.enum(['any', 'associate', 'bachelor', 'master', 'doctorate']).nullable(),
    preferences: z
      .object({
        schemaVersion: z.literal(1),
        roles: z.array(z.string().max(64)).max(30),
        cities: z.array(z.string().max(64)).max(30),
        industries: z.array(z.string().max(64)).max(30),
        recruitmentTypes: z.array(z.enum(['campus', 'internship'])).max(2),
        graduationYear: z.number().int().min(2020).max(2100).nullable(),
      })
      .strict(),
    theme: z.enum(['dark', 'light', 'system']),
    timezone: z
      .string()
      .max(64)
      .refine((value) => {
        try {
          new Intl.DateTimeFormat('en', { timeZone: value });
          return true;
        } catch {
          return false;
        }
      }),
    onboardingStep: z.number().int().min(0).max(4),
  })
  .strict();
const applicationSchema = z
  .object({
    id: uuid,
    user_id: uuid,
    job_id: uuid,
    stage,
    sort_key: numeric,
    version: z.number().int().positive(),
    notes: z.string().max(200_000),
    applied_at: nullableTime,
    closed_at: nullableTime,
    closed_reason: reason.nullable(),
    archived_at: nullableTime,
    created_at: time,
    updated_at: time,
    resume_id: uuid.nullable(),
    display_date: z.string().max(100),
    deleted_at: nullableTime,
    resume_client_key: z.string().max(160).nullable(),
  })
  .strict();
const eventSchema = z
  .object({
    id: uuid,
    application_id: uuid,
    from_stage: stage.nullable(),
    to_stage: stage,
    old_sort_key: numeric.nullable(),
    new_sort_key: numeric,
    actor_id: uuid,
    occurred_at: time,
    version: z.number().int().positive(),
    operation_id: uuid,
    old_closed_reason: reason.nullable(),
    old_closed_at: nullableTime,
    undo_of_operation_id: uuid.nullable(),
    old_neighbors: z
      .object({ beforeId: uuid.nullable(), afterId: uuid.nullable() })
      .strict()
      .nullable(),
  })
  .strict();
const favoriteSchema = z
  .object({
    id: uuid,
    user_id: uuid,
    target_type: z.enum(['job', 'experience', 'company', 'question']),
    job_id: uuid.nullable(),
    experience_id: uuid.nullable(),
    company_id: uuid.nullable(),
    question_id: uuid.nullable().optional(),
    created_at: time,
    updated_at: time,
  })
  .strict();
const progressSchema = z
  .object({
    id: uuid,
    user_id: uuid,
    chapter_id: uuid,
    completed: z.boolean(),
    note: z.string().max(200_000),
    chapter_version: z.number().int().positive(),
    version: z.number().int().positive(),
    created_at: time,
    updated_at: time,
  })
  .strict();
const fileSchema = z
  .object({
    id: z
      .string()
      .min(1)
      .max(160)
      .regex(/^[\p{L}\p{N}_.:@-]+$/u),
    name: z
      .string()
      .min(1)
      .max(300)
      .refine((name) => !/[\x00-\x1f\x7f/\\]/.test(name) && !['.', '..'].includes(name)),
    type: z.string().max(100),
    size: z
      .number()
      .int()
      .positive()
      .max(30 * 1024 * 1024),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
    updatedAt: time,
    data: z
      .string()
      .max(42 * 1024 * 1024)
      .regex(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/)
      .optional(),
  })
  .strict();
const recordSchema = z
  .object({ value: z.unknown(), version: z.number().int().positive().max(2147483646) })
  .strict();
export const cloudBackupSchema = z
  .object({
    format: z.literal('campus-radar-cloud'),
    schemaVersion: z.literal(1),
    ownerId: uuid,
    createdAt: time,
    stateVersion: z.string().regex(/^[a-f0-9]{64}$/),
    profile: profileSchema,
    core: z
      .object({
        applications: z.array(applicationSchema).max(10_000),
        stageEvents: z.array(eventSchema).max(100_000),
        favorites: z.array(favoriteSchema).max(10_000),
        chapterProgress: z.array(progressSchema).max(10_000),
        // Read-only receipts are exported, never replayed as background work.
        taskReceipts: z.array(z.record(z.string(), z.unknown())).max(10_000),
        authoredContent: z.array(z.record(z.string(), z.unknown())).max(10_000),
      })
      .strict(),
    records: z
      .record(z.string().max(240), recordSchema)
      .refine((rows) => Object.keys(rows).length <= 2000),
    files: z.array(fileSchema).max(1000),
    signature: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();
export type CloudBackup = z.infer<typeof cloudBackupSchema>;
type Snapshot = Omit<
  CloudBackup,
  'format' | 'schemaVersion' | 'ownerId' | 'createdAt' | 'stateVersion' | 'signature'
>;
function invalid(message: string): ApiError {
  return new ApiError(422, 'INVALID_BACKUP', message);
}
function canonical(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  return (
    '{' +
    Object.entries(value)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([key, item]) => JSON.stringify(key) + ':' + canonical(item))
      .join(',') +
    '}'
  );
}
function signature(value: unknown): string {
  const secret = Buffer.from(process.env.SESSION_ENCRYPTION_KEY ?? '', 'base64');
  if (secret.length !== 32) throw unavailable();
  return createHmac('sha256', secret)
    .update('campus-radar-cloud-backup-v1\0')
    .update(canonical(value))
    .digest('hex');
}
export function signCloudBackup(value: Omit<CloudBackup, 'signature'>): CloudBackup {
  return { ...value, signature: signature(value) };
}
export function validateCloudBackup(value: unknown, ownerId: string): CloudBackup {
  const checked = cloudBackupSchema.safeParse(value);
  if (!checked.success)
    throw invalid('只接受本服务导出的原生账号备份；本地演示备份不能导入真实账号。');
  const { signature: proof, ...unsigned } = checked.data;
  if (unsigned.ownerId !== ownerId)
    throw new ApiError(403, 'BACKUP_OWNER_MISMATCH', '这份备份属于另一个账号。');
  if (!safeEqual(proof, signature(unsigned)))
    throw invalid('备份签名无效或内容已被修改，请使用完整原始备份。');
  const applications = new Set(unsigned.core.applications.map((row) => row.id));
  for (const row of [
    ...unsigned.core.applications,
    ...unsigned.core.favorites,
    ...unsigned.core.chapterProgress,
  ])
    if (row.user_id !== ownerId) throw invalid('备份包含不属于当前账号的记录。');
  for (const event of unsigned.core.stageEvents)
    if (event.actor_id !== ownerId || !applications.has(event.application_id))
      throw invalid('备份中的投递历史关联无效。');
  for (const [key, record] of Object.entries(unsigned.records))
    validateWorkspaceValue(key, record.value);
  if (new Set(unsigned.files.map((file) => file.id)).size !== unsigned.files.length)
    throw invalid('备份附件标识重复。');
  let total = 0;
  for (const file of unsigned.files)
    if (file.data !== undefined) {
      const bytes = Buffer.from(file.data, 'base64');
      total += bytes.length;
      if (
        bytes.length !== file.size ||
        createHash('sha256').update(bytes).digest('hex') !== file.sha256
      )
        throw invalid('备份附件校验失败。');
      if (inspectPrivateFile(bytes, file.type, file.name) !== file.type)
        throw invalid('备份附件类型无效。');
    }
  if (total > MAX_FILES)
    throw new ApiError(413, 'PAYLOAD_TOO_LARGE', '备份附件合计不能超过 50 MB。');
  return checked.data;
}
const normalize = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
function fileRoot() {
  // Runtime private storage must not be traced or bundled into a deployment.
  return resolve(
    /* turbopackIgnore: true */ process.env.PRIVATE_FILE_ROOT ||
      join(process.cwd(), '.data', 'private-files'),
  );
}
function filePath(key: string) {
  if (!/^[a-f0-9]{64}$/.test(key)) throw invalid('附件存储标识无效。');
  return join(/* turbopackIgnore: true */ fileRoot(), key);
}
async function cleanup(keys: string[]): Promise<number> {
  let failures = 0;
  for (const key of keys)
    try {
      await unlink(filePath(key));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') failures++;
    }
  return failures;
}
async function locks(sql: Db, ownerId: string) {
  await sql`select pg_advisory_xact_lock(hashtextextended(${ownerId},0))`;
  await sql`select pg_advisory_xact_lock(hashtextextended(${'workspace:' + ownerId},0))`;
  await sql`select pg_advisory_xact_lock(hashtextextended(${'files:' + ownerId},0))`;
}
async function snapshot(sql: Db, ownerId: string): Promise<Snapshot> {
  const rows =
    await sql`select display_name,school,graduation_year,education,preferences,theme,timezone,onboarding_step from users where id=${ownerId}::uuid`;
  if (!rows[0]) throw invalid('当前账号不可用。');
  const user = rows[0];
  const revisions =
    await sql`select key,version from workspace_revisions where user_id=${ownerId}::uuid order by key`;
  if (revisions.length > 2000) throw invalid('工作区数量超过备份上限。');
  const records: Snapshot['records'] = {};
  for (const row of revisions) {
    const spec = workspaceSpec(row.key);
    await authorizeSpec(sql, ownerId, spec);
    records[row.key] = {
      value: await readResource(sql, ownerId, row.key, spec),
      version: row.version,
    };
  }
  const applications =
    await sql`select a.*,(select client_key from resumes r where r.id=a.resume_id and r.user_id=a.user_id) resume_client_key from applications a where a.user_id=${ownerId}::uuid order by a.id`;
  const stageEvents =
    await sql`select e.* from application_stage_events e join applications a on a.id=e.application_id where a.user_id=${ownerId}::uuid order by e.id`;
  const favorites = await sql`select * from favorites where user_id=${ownerId}::uuid order by id`;
  const chapterProgress =
    await sql`select * from chapter_progress where user_id=${ownerId}::uuid order by id`;
  const taskReceipts =
    await sql`select id,type,state,payload,result_ref,dedup_key,attempt,max_attempts,available_at,progress,error_code,expires_at,created_at,updated_at from tasks where user_id=${ownerId}::uuid order by id`;
  const authoredContent =
    await sql`select id,company_id,source_url,title,summary,body_md,role,round_type,occurred_at,tags,status,content_mode,license_note,published_at,created_at,updated_at from experiences where author_id=${ownerId}::uuid and source_id is null order by id`;
  const files =
    await sql`select client_key id,name,mime_type type,size_bytes size,file_hash sha256,updated_at from private_files where user_id=${ownerId}::uuid order by client_key`;
  return normalize({
    profile: {
      displayName: user.display_name,
      school: user.school,
      graduationYear: user.graduation_year,
      education: user.education,
      preferences: user.preferences,
      theme: user.theme,
      timezone: user.timezone,
      onboardingStep: user.onboarding_step,
    },
    records,
    core: { applications, stageEvents, favorites, chapterProgress, taskReceipts, authoredContent },
    files: files.map((file) => ({
      id: file.id,
      name: file.name,
      type: file.type,
      size: Number(file.size),
      sha256: file.sha256,
      updatedAt: new Date(file.updated_at).toISOString(),
    })),
  }) as unknown as Snapshot;
}
function fingerprint(value: Snapshot) {
  return hash(canonical(value));
}
export async function exportAccountData(request: Request): Promise<Response> {
  const session = await authenticate(request);
  const includeFiles = new URL(request.url).searchParams.get('includeFiles') === 'true';
  const backup = await transaction(session.userId, async (sql) => {
    await locks(sql, session.userId);
    await rateLimit(sql, 'account-export:' + session.userId, 10, 60);
    const current = await snapshot(sql, session.userId);
    const stateVersion = fingerprint(current);
    if (includeFiles) {
      if (current.files.reduce((sum, file) => sum + file.size, 0) > MAX_FILES)
        throw new ApiError(
          413,
          'PAYLOAD_TOO_LARGE',
          '附件合计超过 50 MB，请取消包含附件，分开下载原件。',
        );
      for (const file of current.files) {
        const rows =
          await sql`select storage_key from private_files where user_id=${session.userId}::uuid and client_key=${file.id}`;
        let bytes: Buffer;
        try {
          bytes = await readFile(/* turbopackIgnore: true */ filePath(rows[0].storage_key));
        } catch {
          throw invalid(`附件「${file.name}」原件不可读，未生成不完整备份。`);
        }
        if (
          bytes.length !== file.size ||
          createHash('sha256').update(bytes).digest('hex') !== file.sha256
        )
          throw invalid('附件与数据库校验信息不一致。');
        file.data = bytes.toString('base64');
      }
    }
    return signCloudBackup({
      format: 'campus-radar-cloud',
      schemaVersion: 1,
      ownerId: session.userId,
      createdAt: new Date().toISOString(),
      stateVersion,
      ...current,
    });
  });
  // Validate our own export too: an old/out-of-contract record must not produce
  // a backup which the restore route would later be unable to read.
  validateCloudBackup(backup, session.userId);
  const response = json({ data: backup });
  response.headers.set('X-CSRF-Token', session.csrf);
  return response;
}
function resourceOrder(key: string) {
  if (key === 'planner-milestones-v2') return 0;
  if (key === 'knowledge-experiences' || key === 'posts') return 1;
  if (key === 'resume-library-v2') return 2;
  if (key.startsWith('interview-rounds-v2-')) return 3;
  if (key.startsWith('interview-review-v2-')) return 5;
  return 4;
}
export async function importAccountData(request: Request): Promise<Response> {
  const session = await authenticate(request, true);
  const raw = await readBody(request, MAX_BACKUP);
  let input: unknown;
  try {
    input = JSON.parse(raw);
  } catch {
    throw invalid('请选择有效的原生云端 JSON 备份。');
  }
  const parsed = z
    .object({
      backup: z.unknown(),
      expectedVersion: z.string().regex(/^[a-f0-9]{64}$/),
      confirm: z.literal('RESTORE'),
    })
    .strict()
    .safeParse(input);
  if (!parsed.success) throw invalid('恢复需要确认，并携带当前账号数据版本。');
  const backup = validateCloudBackup(parsed.data.backup, session.userId);
  const staged = new Map<string, string>();
  let obsolete: string[] = [];
  let committed = false;
  try {
    await mkdir(fileRoot(), { recursive: true, mode: 0o700 });
    for (const file of backup.files)
      if (file.data !== undefined) {
        const key = randomBytes(32).toString('hex');
        staged.set(file.id, key);
        await writeFile(filePath(key), Buffer.from(file.data, 'base64'), {
          flag: 'wx',
          mode: 0o600,
        });
      }
    const result = await transaction(session.userId, async (sql) => {
      await locks(sql, session.userId);
      await rateLimit(sql, 'account-import:' + session.userId, 5, 300);
      const current = await snapshot(sql, session.userId);
      if (fingerprint(current) !== parsed.data.expectedVersion) throw conflict();
      const oldFiles =
        await sql`select client_key,storage_key,file_hash,size_bytes from private_files where user_id=${session.userId}::uuid`;
      const existing = new Map(oldFiles.map((file) => [file.client_key, file]));
      const retained = new Map<string, string>();
      for (const file of backup.files) {
        const old = existing.get(file.id);
        if (!staged.has(file.id)) {
          if (!old || old.file_hash !== file.sha256 || Number(old.size_bytes) !== file.size)
            throw invalid(
              `备份未包含附件「${file.name}」的原件，当前账号也没有相同文件；请使用包含附件的备份。`,
            );
          let bytes: Buffer;
          try {
            bytes = await readFile(/* turbopackIgnore: true */ filePath(old.storage_key));
          } catch {
            throw invalid(`附件「${file.name}」的现有原件不可读，请使用包含附件的备份。`);
          }
          if (
            bytes.length !== file.size ||
            createHash('sha256').update(bytes).digest('hex') !== file.sha256
          )
            throw invalid('现有附件原件校验失败，请使用包含附件的备份。');
          retained.set(file.id, old.storage_key);
        }
      }
      await sql`select app.reset_private_workspace()`;
      for (const file of backup.files)
        await sql`insert into private_files(user_id,client_key,storage_key,name,mime_type,size_bytes,file_hash) values(${session.userId}::uuid,${file.id},${staged.get(file.id) ?? retained.get(file.id)!},${file.name},${file.type},${file.size},${file.sha256})`;
      // Core rows only refer to existing real catalog resources; no catalog write
      // is performed. IDs are never upserted over another account's rows.
      for (const row of backup.core.applications) {
        const { resume_client_key: _client, ...record } = row;
        const previous = current.core.applications.find((item) => item.id === row.id);
        await sql`insert into applications ${sql({ ...record, user_id: session.userId, resume_id: null, version: Math.max(row.version, previous?.version ?? 0) + 1 })}`;
      }
      if (backup.core.stageEvents.length)
        await sql`insert into application_stage_events ${sql(backup.core.stageEvents.map((event) => ({ ...event, old_neighbors: event.old_neighbors ? sql.json(event.old_neighbors) : null })))}`;
      for (const row of backup.core.chapterProgress)
        await sql`insert into chapter_progress ${sql({ ...row, user_id: session.userId, version: Math.max(row.version, current.core.chapterProgress.find((item) => item.id === row.id)?.version ?? 0) + 1 })}`;
      const ordered = Object.entries(backup.records).sort(
        ([a], [b]) => resourceOrder(a) - resourceOrder(b) || a.localeCompare(b),
      );
      for (const [key, record] of ordered) {
        const spec = workspaceSpec(key);
        await authorizeSpec(sql, session.userId, spec);
        // Published originals are exported for reference, never republished,
        // edited or withdrawn as a side effect of a private-data restore.
        if (spec.table !== 'experiences')
          await saveResources(
            sql,
            session.userId,
            key,
            spec,
            validateWorkspaceValue(key, record.value),
          );
        const version = Math.max(record.version, current.records[key]?.version ?? 0) + 1;
        await sql`insert into workspace_revisions(user_id,key,version) values(${session.userId}::uuid,${key},${version})`;
      }
      for (const row of backup.core.applications)
        if (row.resume_client_key)
          await sql`update applications set resume_id=(select id from resumes where user_id=${session.userId}::uuid and client_key=${row.resume_client_key} limit 1) where user_id=${session.userId}::uuid and id=${row.id}::uuid`;
      for (const row of backup.core.favorites)
        await sql`insert into favorites ${sql({ ...row, user_id: session.userId })}`;
      const profile = backup.profile;
      await sql`update users set display_name=${profile.displayName},school=${profile.school},graduation_year=${profile.graduationYear},education=${profile.education},preferences=${sql.json(profile.preferences)},theme=${profile.theme},timezone=${profile.timezone},onboarding_step=${profile.onboardingStep},updated_at=now() where id=${session.userId}::uuid`;
      obsolete = oldFiles
        .filter((file) => ![...retained.values()].includes(file.storage_key))
        .map((file) => file.storage_key);
      return {
        records: ordered.length,
        applications: backup.core.applications.length,
        favorites: backup.core.favorites.length,
        files: backup.files.length,
      };
    });
    committed = true;
    const cleanupFailures = await cleanup(obsolete);
    const response = json({ data: { ...result, cleanupFailures, publicContentRetained: true } });
    response.headers.set('X-CSRF-Token', session.csrf);
    return response;
  } finally {
    if (!committed) await cleanup([...staged.values()]);
  }
}
export async function resetAccountData(request: Request): Promise<Response> {
  const session = await authenticate(request, true);
  const input = await body(
    request,
    z
      .object({ confirm: z.literal('RESET'), expectedVersion: z.string().regex(/^[a-f0-9]{64}$/) })
      .strict(),
  );
  const keys = await transaction(session.userId, async (sql) => {
    await locks(sql, session.userId);
    await rateLimit(sql, 'account-reset:' + session.userId, 3, 300);
    if (fingerprint(await snapshot(sql, session.userId)) !== input.expectedVersion)
      throw conflict();
    const files =
      await sql`select storage_key from private_files where user_id=${session.userId}::uuid`;
    await sql`select app.reset_private_workspace()`;
    return files.map((file) => file.storage_key as string);
  });
  const cleanupFailures = await cleanup(keys);
  const response = json({ data: { reset: true, cleanupFailures, publicContentRetained: true } });
  response.headers.set('X-CSRF-Token', session.csrf);
  return response;
}
