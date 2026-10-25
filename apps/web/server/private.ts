import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { authenticate, rateLimit, userDto, type Session } from './auth';
import { transaction, camel, type Db } from './db';
import { ApiError, body, conflict, hash, json, notFound, parseId, unavailable } from './http';
import { jobsByIds, jobCard, mapCompany } from './public';
import { values, listQuery, decodeCursor } from './pagination';
import type {
  Application,
  ApplicationCard,
  StageEvent,
  ChapterProgress,
  Favorite,
  Task,
  SearchHit,
} from '../lib/api/contracts';
const stages = [
  'PENDING',
  'APPLIED',
  'ASSESSMENT',
  'INTERVIEW_1',
  'INTERVIEW_2',
  'HR',
  'OFFER',
  'CLOSED',
] as const;
const stage = z.enum(stages),
  reason = z.enum(['rejected', 'withdrawn', 'expired', 'accepted', 'other']);
const id = z.string().uuid();
const preferences = z
  .object({
    schemaVersion: z.literal(1),
    roles: z.array(z.string().max(64)).max(30),
    cities: z.array(z.string().max(64)).max(30),
    industries: z.array(z.string().max(64)).max(30),
    recruitmentTypes: z.array(z.enum(['campus', 'internship'])).max(2),
    graduationYear: z.number().int().min(2020).max(2100).nullable(),
  })
  .strict();
const userPatch = z
  .object({
    displayName: z.string().min(1).max(40).optional(),
    graduationYear: z.number().int().min(2020).max(2100).nullable().optional(),
    school: z.string().max(120).nullable().optional(),
    education: z
      .enum(['any', 'associate', 'bachelor', 'master', 'doctorate'])
      .nullable()
      .optional(),
    preferences: preferences.optional(),
    theme: z.enum(['dark', 'light', 'system']).optional(),
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
      })
      .optional(),
    onboardingStep: z.number().int().min(0).max(4).optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0);
export async function withUser(
  request: Request,
  write: boolean,
  run: (sql: Db, session: Session) => Promise<Response>,
): Promise<Response> {
  const session = await authenticate(request, write);
  return transaction(session.userId, async (sql) => {
    if (write) {
      await sql`select pg_advisory_xact_lock(hashtextextended(${session.userId},0))`;
      await rateLimit(sql, 'write:' + session.userId, 30, 60);
    }
    const response = await run(sql, session);
    response.headers.set('X-CSRF-Token', session.csrf);
    return response;
  });
}
type Outcome = { status: number; body: unknown };
async function idempotent(
  sql: Db,
  session: Session,
  request: Request,
  input: unknown,
  run: () => Promise<Outcome>,
): Promise<Response> {
  const key = request.headers.get('Idempotency-Key');
  if (!key || key.length > 200 || !/^[\x21-\x7e]+$/.test(key))
    throw new ApiError(422, 'VALIDATION_ERROR', '请提供有效的幂等键。');
  const route = request.method + ' ' + new URL(request.url).pathname;
  const requestHash = hash(JSON.stringify(input));
  await sql`delete from idempotency_records where actor_id=${session.userId}::uuid and route=${route} and key=${key} and expires_at<=now()`;
  const old =
    await sql`select * from idempotency_records where actor_id=${session.userId}::uuid and route=${route} and key=${key}`;
  if (old[0]) {
    if (old[0].request_hash !== requestHash)
      throw new ApiError(409, 'IDEMPOTENCY_CONFLICT', '该幂等键已用于不同请求。');
    return json(old[0].response, old[0].status);
  }
  const result = await run();
  await sql`insert into idempotency_records(actor_id,route,key,request_hash,status,response,expires_at) values(${session.userId}::uuid,${route},${key},${requestHash},${result.status},${sql.json(result.body as never)},now()+interval '24 hours')`;
  return json(result.body, result.status);
}
async function application(
  sql: Db,
  userId: string,
  applicationId: string,
  history = true,
): Promise<Application> {
  const rows =
    await sql`select a.*,(select client_key from resumes r where r.id=a.resume_id and r.user_id=a.user_id) resume_client_key from applications a where a.id=${applicationId}::uuid and a.user_id=${userId}::uuid and a.deleted_at is null`;
  const row = rows[0];
  if (!row) throw notFound();
  const app = camel<Application>(row);
  const [job] = await jobsByIds(sql, [row.job_id]);
  if (!job) throw notFound();
  const events = history
    ? await sql`select id,from_stage,to_stage,occurred_at,operation_id,version from application_stage_events where application_id=${applicationId}::uuid order by occurred_at,id`
    : [];
  return {
    id: app.id,
    job: jobCard(job),
    stage: app.stage,
    sortKey: String(row.sort_key),
    version: app.version,
    notes: app.notes,
    date: row.display_date || app.appliedAt?.slice(0, 10) || app.createdAt.slice(0, 10),
    resumeId: row.resume_client_key ?? row.resume_id ?? null,
    appliedAt: app.appliedAt,
    closedAt: app.closedAt,
    closedReason: app.closedReason,
    archivedAt: app.archivedAt,
    createdAt: app.createdAt,
    updatedAt: app.updatedAt,
    stageHistory: events.map((e) => camel<StageEvent>(e)),
  };
}
async function locked(sql: Db, userId: string, applicationId: string, version: number) {
  const rows =
    await sql`select a.*,j.company_id from applications a join jobs j on j.id=a.job_id where a.id=${applicationId}::uuid and a.user_id=${userId}::uuid and a.deleted_at is null for update of a`;
  if (!rows[0]) throw notFound();
  if (rows[0].version !== version) throw conflict();
  return rows[0];
}
export function me(request: Request) {
  return withUser(request, request.method !== 'GET', async (sql, session) => {
    if (request.method === 'PATCH') {
      const input = await body(request, userPatch);
      const fields = Object.fromEntries(
        Object.entries(input).map(([k, v]) => [
          k.replace(/[A-Z]/g, (c) => '_' + c.toLowerCase()),
          k === 'preferences' ? sql.json(v as never) : v,
        ]),
      );
      await sql`update users set ${sql(fields)},updated_at=now() where id=${session.userId}::uuid and status='active'`;
    }
    if (request.method === 'DELETE') {
      if (process.env.TASK_PROCESSING_ENABLED !== 'true') throw unavailable();
      const input = await body(request, z.object({ confirm: z.literal('DELETE') }).strict());
      if (Date.now() - new Date(session.createdAt).getTime() > 600000)
        throw new ApiError(401, 'REAUTH_REQUIRED', '请重新登录后再删除账户。');
      return idempotent(sql, session, request, input, async () => {
        const taskId = randomUUID();
        await sql`insert into tasks(id,user_id,type,payload,dedup_key) values(${taskId}::uuid,${session.userId}::uuid,'USER_ERASURE',${sql.json({ schemaVersion: 1, userId: session.userId })},${'erase:' + session.userId})`;
        await sql`select app.freeze_user(${session.userId}::uuid)`;
        return {
          status: 202,
          body: {
            data: { receiptId: taskId, acceptedAt: new Date().toISOString(), state: 'queued' },
          },
        };
      });
    }
    return json({ data: await userDto(sql, session.userId, session.credentials.email) });
  });
}
export function exportMe(request: Request) {
  return withUser(request, true, async (sql, session) => {
    if (process.env.TASK_PROCESSING_ENABLED !== 'true') throw unavailable();
    return idempotent(sql, session, request, {}, async () => {
      await rateLimit(sql, 'export:' + session.userId, 3, 86400);
      const taskId = randomUUID();
      await sql`insert into tasks(id,user_id,type,payload,dedup_key) values(${taskId}::uuid,${session.userId}::uuid,'DATA_EXPORT',${sql.json({ schemaVersion: 1, userId: session.userId })},${'export:' + taskId})`;
      return { status: 202, body: { data: await taskDto(sql, session.userId, taskId) } };
    });
  });
}
export function applications(request: Request) {
  return withUser(request, request.method === 'POST', async (sql, session) => {
    if (request.method === 'POST') {
      const input = await body(request, z.object({ jobId: id }).strict());
      return idempotent(sql, session, request, input, async () => {
        const jobs = await sql`select id from jobs where id=${input.jobId}::uuid`;
        if (!jobs[0]) throw notFound();
        const existing =
          await sql`select id,deleted_at from applications where user_id=${session.userId}::uuid and job_id=${input.jobId}::uuid`;
        if (existing[0]) {
          if (existing[0].deleted_at)
            await sql`update applications set deleted_at=null,archived_at=null,version=version+1,updated_at=now() where id=${existing[0].id}::uuid and user_id=${session.userId}::uuid`;
          return {
            status: 200,
            body: { data: await application(sql, session.userId, existing[0].id) },
          };
        }
        const created =
          await sql`insert into applications(user_id,job_id,sort_key) values(${session.userId}::uuid,${input.jobId}::uuid,(select coalesce(max(sort_key),0)+1024 from applications where user_id=${session.userId}::uuid and stage='PENDING' and archived_at is null)) returning id`;
        await sql`insert into application_stage_events(application_id,to_stage,new_sort_key,actor_id,version) select id,stage,sort_key,user_id,version from applications where id=${created[0].id}::uuid`;
        return {
          status: 201,
          body: { data: await application(sql, session.userId, created[0].id) },
        };
      });
    }
    const params = new URL(request.url).searchParams;
    const companyIds = values(params, 'companyId');
    companyIds.forEach(parseId);
    const wanted = values(params, 'stage');
    if (wanted.some((v) => !stages.includes(v as (typeof stages)[number])))
      throw new ApiError(422, 'VALIDATION_ERROR', '投递阶段无效。');
    if (params.has('view') && !['board', 'list'].includes(params.get('view')!))
      throw new ApiError(422, 'VALIDATION_ERROR', '视图无效。');
    const rows =
      await sql`select a.*,(select client_key from resumes r where r.id=a.resume_id and r.user_id=a.user_id) resume_client_key from applications a join jobs j on j.id=a.job_id where a.user_id=${session.userId}::uuid and a.deleted_at is null ${params.get('includeArchived') === 'true' ? sql`` : sql`and a.archived_at is null`} ${companyIds.length ? sql`and j.company_id in ${sql(companyIds)}` : sql``} ${wanted.length ? sql`and a.stage::text in ${sql(wanted)}` : sql``} order by a.stage,a.sort_key,a.id limit 501`;
    const jobMap = new Map(
      (
        await jobsByIds(
          sql,
          rows.slice(0, 500).map((r) => r.job_id),
        )
      ).map((j) => [j.id, j]),
    );
    const historyRows = rows.length
      ? await sql`select e.* from application_stage_events e join applications a on a.id=e.application_id where a.user_id=${session.userId}::uuid and a.id in ${sql(rows.slice(0, 500).map((r) => r.id))} order by e.version`
      : [];
    const items: ApplicationCard[] = rows.slice(0, 500).map((row) => {
      const app = camel<Application>(row);
      return {
        id: app.id,
        job: jobCard(jobMap.get(row.job_id)!),
        stage: app.stage,
        sortKey: String(row.sort_key),
        version: app.version,
        notes: app.notes,
        date: row.display_date || app.appliedAt?.slice(0, 10) || app.createdAt.slice(0, 10),
        resumeId: row.resume_client_key ?? row.resume_id ?? null,
        stageHistory: historyRows
          .filter((e) => e.application_id === row.id)
          .map((e) => camel<StageEvent>(e)),
        appliedAt: app.appliedAt,
        closedAt: app.closedAt,
        closedReason: app.closedReason,
        archivedAt: app.archivedAt,
        createdAt: app.createdAt,
        updatedAt: app.updatedAt,
      };
    });
    const totals =
      await sql`select a.stage,count(*)::int count from applications a join jobs j on j.id=a.job_id where a.user_id=${session.userId}::uuid and a.deleted_at is null ${params.get('includeArchived') === 'true' ? sql`` : sql`and a.archived_at is null`} ${companyIds.length ? sql`and j.company_id in ${sql(companyIds)}` : sql``} ${wanted.length ? sql`and a.stage::text in ${sql(wanted)}` : sql``} group by a.stage`;
    const count = (states: readonly string[]) =>
      totals.filter((r) => states.includes(r.stage)).reduce((sum, r) => sum + r.count, 0);
    return json({
      data: {
        items,
        stats: {
          total: count(stages),
          applied: count(stages.filter((s) => s !== 'PENDING')),
          interviewing: count(['INTERVIEW_1', 'INTERVIEW_2', 'HR']),
          offers: count(['OFFER']),
        },
        columns: stages.map((s) => ({ stage: s, count: count([s]) })),
        truncated: rows.length > 500,
      },
    });
  });
}
export function applicationDetail(request: Request, applicationId: string) {
  return withUser(request, request.method !== 'GET', async (sql, session) => {
    parseId(applicationId);
    if (request.method === 'DELETE') {
      const input = await body(
        request,
        z.object({ version: z.number().int().positive() }).strict(),
      );
      await locked(sql, session.userId, applicationId, input.version);
      await sql`update applications set deleted_at=now(),version=version+1,updated_at=now() where id=${applicationId}::uuid and user_id=${session.userId}::uuid`;
      return new Response(null, { status: 204 });
    }
    if (request.method === 'PATCH') {
      const input = await body(
        request,
        z
          .object({
            notes: z.string().max(10000).optional(),
            date: z.iso.date().optional(),
            resumeId: z.string().min(1).max(120).nullable().optional(),
            appliedAt: z.iso.datetime({ offset: true }).nullable().optional(),
            archived: z.boolean().optional(),
            version: z.number().int().min(1),
          })
          .strict()
          .refine((v) => Object.keys(v).length > 1),
      );
      await locked(sql, session.userId, applicationId, input.version);
      let resumeId = input.resumeId;
      if (input.resumeId) {
        const resumes =
          await sql`select id from resumes where (id::text=${input.resumeId} or client_key=${input.resumeId}) and user_id=${session.userId}::uuid`;
        if (!resumes[0]) throw new ApiError(422, 'VALIDATION_ERROR', '请选择当前账号的简历。');
        resumeId = resumes[0].id;
      }
      await sql`update applications set display_date=${input.date === undefined ? sql`display_date` : input.date},resume_id=${resumeId === undefined ? sql`resume_id` : resumeId}::uuid,notes=${input.notes === undefined ? sql`notes` : input.notes},applied_at=${input.appliedAt === undefined ? sql`applied_at` : input.appliedAt},archived_at=${input.archived === undefined ? sql`archived_at` : input.archived ? sql`now()` : null},version=version+1,updated_at=now() where id=${applicationId}::uuid and user_id=${session.userId}::uuid`;
    }
    return json({ data: await application(sql, session.userId, applicationId) });
  });
}
const moveSchema = z
  .object({
    stage,
    version: z.number().int().min(1),
    beforeId: id.nullable().optional(),
    afterId: id.nullable().optional(),
    orderingScope: z.enum(['stage', 'company']).default('stage'),
    closedReason: reason.nullable().optional(),
  })
  .strict()
  .refine((v) => (v.stage === 'CLOSED' ? !!v.closedReason : !v.closedReason), {
    message: '结束阶段必须选择原因，其他阶段不能选择原因。',
  });
export function moveApplication(request: Request, applicationId: string) {
  return withUser(request, true, async (sql, session) => {
    parseId(applicationId);
    const input = await body(request, moveSchema);
    return idempotent(sql, session, request, input, async () => {
      const current = await locked(sql, session.userId, applicationId, input.version);
      if (current.archived_at) throw new ApiError(409, 'VERSION_CONFLICT', '请先恢复归档投递。');
      const column =
        await sql`select a.id,a.sort_key,j.company_id from applications a join jobs j on j.id=a.job_id where a.user_id=${session.userId}::uuid and a.stage=${input.stage}::application_stage and a.archived_at is null and a.deleted_at is null and a.id<>${applicationId}::uuid order by a.sort_key,a.id for update of a`;
      const scope =
        input.orderingScope === 'company'
          ? column.filter((r) => r.company_id === current.company_id)
          : column;
      const before = input.beforeId ? scope.findIndex((r) => r.id === input.beforeId) : -1;
      const after = input.afterId ? scope.findIndex((r) => r.id === input.afterId) : -1;
      if (
        (input.beforeId && before < 0) ||
        (input.afterId && after < 0) ||
        (input.beforeId && input.afterId && before !== after + 1)
      )
        throw new ApiError(422, 'VALIDATION_ERROR', '排序邻居无效，请刷新后重试。');
      // Capture the original order by identity; numeric keys become stale after rebalance.
      const oldColumn =
        await sql`select id from applications where user_id=${session.userId}::uuid and stage=${current.stage}::application_stage and archived_at is null and deleted_at is null order by sort_key,id`;
      const oldIndex = oldColumn.findIndex((row) => row.id === applicationId);
      const oldNeighbors = {
        beforeId: oldColumn[oldIndex + 1]?.id ?? null,
        afterId: oldColumn[oldIndex - 1]?.id ?? null,
      };
      // Rebalance the complete column while holding the per-user transaction lock.
      for (let i = 0; i < column.length; i++)
        await sql`update applications set sort_key=${(i + 1) * 1024} where id=${column[i].id}::uuid and user_id=${session.userId}::uuid`;
      let position = column.length;
      if (input.beforeId) position = column.findIndex((r) => r.id === input.beforeId);
      else if (input.afterId) position = column.findIndex((r) => r.id === input.afterId) + 1;
      else if (input.orderingScope === 'company' && scope.length)
        position = column.findIndex((r) => r.id === scope.at(-1)!.id) + 1;
      const newKey = position * 1024 + 512;
      const operationId = randomUUID();
      const events =
        await sql`insert into application_stage_events(application_id,from_stage,to_stage,old_sort_key,new_sort_key,actor_id,version,operation_id,old_closed_at,old_closed_reason,old_neighbors) values(${applicationId}::uuid,${current.stage}::application_stage,${input.stage}::application_stage,${current.sort_key},${newKey},${session.userId}::uuid,${current.version + 1},${operationId}::uuid,${current.closed_at},${current.closed_reason}::closed_reason,${sql.json(oldNeighbors)}) returning id,from_stage,to_stage,occurred_at,operation_id,version`;
      await sql`update applications set stage=${input.stage}::application_stage,sort_key=${newKey},version=version+1,closed_at=${input.stage === 'CLOSED' ? sql`now()` : null},closed_reason=${input.stage === 'CLOSED' ? input.closedReason! : null}::closed_reason,updated_at=now() where id=${applicationId}::uuid and user_id=${session.userId}::uuid`;
      return {
        status: 200,
        body: {
          data: {
            application: await application(sql, session.userId, applicationId),
            event: camel<StageEvent>(events[0]),
          },
        },
      };
    });
  });
}
export function undoApplication(request: Request, applicationId: string) {
  return withUser(request, true, async (sql, session) => {
    parseId(applicationId);
    const input = await body(
      request,
      z.object({ operationId: id, version: z.number().int().min(1) }).strict(),
    );
    return idempotent(sql, session, request, input, async () => {
      const current = await locked(sql, session.userId, applicationId, input.version);
      const events =
        await sql`select * from application_stage_events where application_id=${applicationId}::uuid order by version desc limit 1`;
      const last = events[0];
      if (
        !last ||
        last.operation_id !== input.operationId ||
        last.actor_id !== session.userId ||
        last.version !== current.version ||
        last.undo_of_operation_id ||
        !last.from_stage ||
        Date.now() - new Date(last.occurred_at).getTime() > 600000
      )
        throw new ApiError(409, 'UNDO_CONFLICT', '只能撤销十分钟内最近一次操作。');
      const neighbors = last.old_neighbors as {
        beforeId: string | null;
        afterId: string | null;
      } | null;
      if (!neighbors)
        throw new ApiError(409, 'UNDO_CONFLICT', '旧操作没有完整排序快照，请刷新后重新调整。');
      const restoreColumn =
        await sql`select id from applications where user_id=${session.userId}::uuid and stage=${last.from_stage}::application_stage and archived_at is null and deleted_at is null and id<>${applicationId}::uuid order by sort_key,id for update`;
      const beforeIndex = neighbors.beforeId
        ? restoreColumn.findIndex((row) => row.id === neighbors.beforeId)
        : -1;
      const afterIndex = neighbors.afterId
        ? restoreColumn.findIndex((row) => row.id === neighbors.afterId)
        : -1;
      if (
        (neighbors.beforeId && beforeIndex < 0) ||
        (neighbors.afterId && afterIndex < 0) ||
        (neighbors.beforeId && neighbors.afterId && beforeIndex !== afterIndex + 1)
      )
        throw new ApiError(409, 'UNDO_CONFLICT', '原来的相邻卡片已改变，请刷新后重新调整。');
      for (let i = 0; i < restoreColumn.length; i++)
        await sql`update applications set sort_key=${(i + 1) * 1024} where id=${restoreColumn[i].id}::uuid and user_id=${session.userId}::uuid`;
      const restorePosition = neighbors.beforeId
        ? beforeIndex
        : neighbors.afterId
          ? afterIndex + 1
          : restoreColumn.length;
      const restoredKey = restorePosition * 1024 + 512;
      const operationId = randomUUID();
      const reverse =
        await sql`insert into application_stage_events(application_id,from_stage,to_stage,old_sort_key,new_sort_key,actor_id,version,operation_id,old_closed_at,old_closed_reason,undo_of_operation_id) values(${applicationId}::uuid,${current.stage}::application_stage,${last.from_stage}::application_stage,${current.sort_key},${restoredKey},${session.userId}::uuid,${current.version + 1},${operationId}::uuid,${current.closed_at},${current.closed_reason}::closed_reason,${last.operation_id}::uuid) returning id,from_stage,to_stage,occurred_at,operation_id,version`;
      await sql`update applications set stage=${last.from_stage}::application_stage,sort_key=${restoredKey},closed_at=${last.old_closed_at},closed_reason=${last.old_closed_reason}::closed_reason,version=version+1,updated_at=now() where id=${applicationId}::uuid and user_id=${session.userId}::uuid`;
      return {
        status: 200,
        body: {
          data: {
            application: await application(sql, session.userId, applicationId),
            event: camel<StageEvent>(reverse[0]),
          },
        },
      };
    });
  });
}
export function progress(request: Request, chapterId: string) {
  return withUser(request, request.method === 'PUT', async (sql, session) => {
    parseId(chapterId);
    const chapters =
      await sql`select content_version from handbook_chapters where id=${chapterId}::uuid and status='published'`;
    if (!chapters[0]) throw notFound();
    const records =
      await sql`select * from chapter_progress where user_id=${session.userId}::uuid and chapter_id=${chapterId}::uuid for update`;
    let record = records[0];
    if (request.method === 'PUT') {
      const input = await body(
        request,
        z
          .object({
            completed: z.boolean(),
            note: z.string().max(20000),
            version: z.number().int().min(0),
          })
          .strict(),
      );
      if ((record?.version ?? 0) !== input.version) throw conflict();
      const result = record
        ? await sql`update chapter_progress set completed=${input.completed},note=${input.note},chapter_version=${chapters[0].content_version},version=version+1,updated_at=now() where user_id=${session.userId}::uuid and chapter_id=${chapterId}::uuid returning *`
        : await sql`insert into chapter_progress(user_id,chapter_id,completed,note,chapter_version) values(${session.userId}::uuid,${chapterId}::uuid,${input.completed},${input.note},${chapters[0].content_version}) returning *`;
      record = result[0];
    }
    const value: ChapterProgress = record
      ? {
          chapterId,
          completed: record.completed,
          note: record.note,
          chapterVersion: record.chapter_version,
          version: record.version,
          updatedAt: new Date(record.updated_at).toISOString(),
        }
      : {
          chapterId,
          completed: false,
          note: '',
          chapterVersion: chapters[0].content_version,
          version: 0,
          updatedAt: null,
        };
    return json({ data: value });
  });
}
async function favoriteDto(sql: Db, row: Record<string, unknown>): Promise<Favorite> {
  const targetType = row.target_type as Favorite['targetType'];
  const targetId = String(row[targetType + '_id']);
  let target: SearchHit | null = null;
  if (targetType === 'job') {
    const [job] = await jobsByIds(sql, [targetId]);
    if (job)
      target = {
        id: job.id,
        type: 'job',
        title: job.title,
        subtitle: job.company.name,
        href: '/jobs/' + job.id,
        previewable: true,
      };
  } else if (targetType === 'company') {
    const records = await sql`select * from companies where id=${targetId}::uuid`;
    if (records[0]) {
      const company = mapCompany(records[0]);
      target = {
        id: company.id,
        type: 'company',
        title: company.name,
        subtitle: company.industry ?? '',
        href: '/company/' + company.id,
        previewable: false,
      };
    }
  } else if (targetType === 'question') {
    const records =
      await sql`select id,title,topic from questions where id=${targetId}::uuid and status='published'`;
    if (records[0])
      target = {
        id: records[0].id,
        type: 'question',
        title: records[0].title,
        subtitle: records[0].topic,
        href: '/questions?preview=question:' + records[0].id,
        previewable: true,
      };
  } else {
    const records =
      await sql`select id,title,summary from experiences where id=${targetId}::uuid and status='published'`;
    if (records[0])
      target = {
        id: records[0].id,
        type: 'experience',
        title: records[0].title,
        subtitle: records[0].summary,
        href: '/experiences/' + records[0].id,
        previewable: true,
      };
  }
  return {
    id: String(row.id),
    targetType,
    targetId,
    createdAt: new Date(String(row.created_at)).toISOString(),
    target,
    unavailable: target === null,
  };
}
export function favorites(request: Request) {
  return withUser(request, false, async (sql, session) => {
    const params = new URL(request.url).searchParams;
    const wanted = values(params, 'type');
    if (wanted.some((v) => !['job', 'experience', 'company', 'question'].includes(v)))
      throw new ApiError(422, 'VALIDATION_ERROR', '收藏类型无效。');
    const query = listQuery(params),
      cursor = decodeCursor(query.cursor, query.filter);
    if (
      cursor &&
      (!id.safeParse(cursor.id).success ||
        !z.iso.datetime({ offset: true }).safeParse(cursor.sort).success)
    )
      throw new ApiError(422, 'INVALID_CURSOR', '分页位置无效。');
    const rows =
      await sql`select *,to_char(created_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') created_sort_key from favorites where user_id=${session.userId}::uuid ${wanted.length ? sql`and target_type in ${sql(wanted)}` : sql``} ${cursor ? sql`and (created_at,id)<(${cursor.sort}::text::timestamptz,${cursor.id}::uuid)` : sql``} order by created_at desc,id desc limit ${query.limit + 1}`;
    const hasMore = rows.length > query.limit;
    const records = rows.slice(0, query.limit),
      last = records.at(-1);
    const total =
      query.includeTotal && !cursor
        ? (
            await sql`select count(*)::int total from favorites where user_id=${session.userId}::uuid ${wanted.length ? sql`and target_type in ${sql(wanted)}` : sql``}`
          )[0].total
        : undefined;
    return json({
      data: await Promise.all(records.map((row) => favoriteDto(sql, row))),
      page: {
        hasMore,
        nextCursor:
          hasMore && last
            ? Buffer.from(
                JSON.stringify({
                  v: 1,
                  filter: query.filter,
                  id: last.id,
                  sort: last.created_sort_key,
                }),
              ).toString('base64url')
            : null,
      },
      meta: total === undefined ? {} : { total },
    });
  });
}
export function favoriteMutation(request: Request, type: string, targetId: string) {
  return withUser(request, true, async (sql, session) => {
    parseId(targetId);
    if (!['job', 'experience', 'company', 'question'].includes(type))
      throw new ApiError(422, 'VALIDATION_ERROR', '收藏类型无效。');
    const column = type + '_id';
    if (request.method === 'DELETE') {
      await sql`delete from favorites where user_id=${session.userId}::uuid and target_type=${type} and ${sql(column)}=${targetId}::uuid`;
      return new Response(null, { status: 204 });
    }
    const table =
      type === 'job'
        ? 'jobs'
        : type === 'company'
          ? 'companies'
          : type === 'question'
            ? 'questions'
            : 'experiences';
    const exists =
      await sql`select id from ${sql(table)} where id=${targetId}::uuid ${type === 'experience' || type === 'question' ? sql`and status='published'` : sql``}`;
    if (!exists[0]) throw notFound();
    const rows =
      await sql`insert into favorites(user_id,target_type,${sql(column)}) values(${session.userId}::uuid,${type},${targetId}::uuid) on conflict do nothing returning *`;
    const record =
      rows[0] ??
      (
        await sql`select * from favorites where user_id=${session.userId}::uuid and ${sql(column)}=${targetId}::uuid`
      )[0];
    return json({ data: await favoriteDto(sql, record) });
  });
}
async function taskDto(sql: Db, userId: string, taskId: string): Promise<Task> {
  const rows =
    await sql`select id,type,state,progress,attempt,created_at,updated_at,result_ref,error_code from tasks where id=${taskId}::uuid and user_id=${userId}::uuid`;
  const row = rows[0];
  if (!row) throw notFound();
  const mapped = camel<Task>(row);
  const result = row.result_ref as { downloadUrl?: string; expiresAt?: string } | null;
  return {
    id: mapped.id,
    type: mapped.type,
    state: mapped.state,
    progress: mapped.progress,
    attempt: mapped.attempt,
    createdAt: mapped.createdAt,
    updatedAt: mapped.updatedAt,
    errorCode: mapped.errorCode,
    result:
      result?.downloadUrl && result.expiresAt && new Date(result.expiresAt).getTime() > Date.now()
        ? { downloadUrl: result.downloadUrl, expiresAt: result.expiresAt }
        : null,
  };
}
export function task(request: Request, taskId: string) {
  return withUser(request, false, async (sql, session) => {
    parseId(taskId);
    return json({ data: await taskDto(sql, session.userId, taskId) });
  });
}
