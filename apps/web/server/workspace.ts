import { z } from 'zod';
import { authenticate, rateLimit } from './auth';
import { transaction, type Db } from './db';
import { ApiError, body, conflict, json, notFound } from './http';
import { workspaceSpec, validateWorkspaceValue, type WorkspaceSpec } from './workspace-schema';

type Item = Record<string, any>;
const invalid = (message = '工作区关联资源无效。') =>
  new ApiError(422, 'VALIDATION_ERROR', message);
function dateOnly(value: unknown): string | null {
  if (!value) return null;
  const text = String(value);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(text) ||
    Number.isNaN(Date.parse(text)) ||
    new Date(text).toISOString().slice(0, 10) !== text
  )
    throw invalid('日期无效。');
  return text;
}
function timestamp(value: unknown): string | null {
  if (!value) return null;
  let text = String(value);
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(text)) text += '+08:00';
  if (Number.isNaN(Date.parse(text))) throw invalid('面试时间无效。');
  return new Date(text).toISOString();
}
async function company(sql: Db, value: unknown, required = false): Promise<string | null> {
  if (!value) {
    if (required) throw invalid('请选择公司。');
    return null;
  }
  const rows =
    await sql`select id from companies where id::text=${String(value)} or slug=${String(value)} limit 1`;
  if (!rows[0] && required) throw invalid('公司不存在。');
  return rows[0]?.id ?? null;
}
async function experience(sql: Db, value: string): Promise<string> {
  const rows =
    await sql`select id from experiences where (id::text=${value} or client_key=${value}) and (status='published' or author_id=app.current_user_id()) order by (author_id=app.current_user_id()) desc limit 2`;
  if (!rows[0]) throw invalid('面经不存在或不可访问。');
  if (rows.length > 1 && rows[0].id !== value) throw invalid('面经标识不唯一，请刷新。');
  return rows[0].id;
}
async function ownedPost(sql: Db, userId: string, clientKey: string): Promise<string> {
  const rows =
    await sql`select id from posts where user_id=${userId}::uuid and workspace_key='posts' and client_key=${clientKey} limit 1`;
  if (!rows[0]) throw notFound();
  return rows[0].id;
}
async function ownedApplication(sql: Db, userId: string, id: string): Promise<void> {
  if (!z.uuid().safeParse(id).success) throw invalid('投递记录 ID 无效。');
  if (!(await sql`select id from applications where id=${id}::uuid and user_id=${userId}::uuid`)[0])
    throw notFound();
}
export async function authorizeSpec(sql: Db, userId: string, spec: WorkspaceSpec): Promise<void> {
  if (spec.applicationId) await ownedApplication(sql, userId, spec.applicationId);
  if (spec.companyKey) await company(sql, spec.companyKey, true);
  if (spec.postKey) await ownedPost(sql, userId, spec.postKey);
}
function entries(spec: WorkspaceSpec, value: unknown): [string, unknown][] {
  if (spec.shape === 'scalar') return value === null ? [] : [['singleton', value]];
  if (spec.shape === 'dictionary') return Object.entries(value as Record<string, unknown>);
  if (spec.shape === 'learning') {
    const v = value as {
      mastery: Record<string, string>;
      wrong: string[];
      attempts: Record<string, number>;
    };
    return [...new Set([...Object.keys(v.mastery), ...v.wrong, ...Object.keys(v.attempts)])].map(
      (id) => [
        id,
        {
          mastery: v.mastery[id] ?? null,
          wrong: v.wrong.includes(id),
          attempts: v.attempts[id] ?? null,
        },
      ],
    );
  }
  return (value as unknown[]).map((item) => [
    item && typeof item === 'object' && 'id' in item ? String(item.id) : String(item),
    item,
  ]);
}
async function resourceFields(
  sql: Db,
  userId: string,
  key: string,
  spec: WorkspaceSpec,
  clientKey: string,
  value: unknown,
  position: number,
): Promise<Item> {
  const v = (value && typeof value === 'object' ? value : {}) as Item;
  const j = (x: unknown) => sql.json(x as never);
  switch (spec.table) {
    case 'resumes': {
      const files =
        await sql`select id,file_hash from private_files where user_id=${userId}::uuid and (client_key=${v.fileId ?? v.id} or id::text=${v.fileId ?? v.id})`;
      if (v.fileId && !files[0]) throw invalid('简历文件不存在。');
      return {
        name: v.name,
        version: v.version,
        mime_type: v.mime,
        size_bytes: v.size,
        parsed_text: v.text,
        role: v.role,
        is_default: v.default,
        file_id: files[0]?.id ?? null,
        file_hash: files[0]?.file_hash ?? null,
      };
    }
    case 'subscriptions':
      return {
        name: v.name,
        conditions: j({
          schemaVersion: 1,
          operator: 'and',
          rules: ['role', 'city', 'company', 'type', 'education', 'keyword']
            .filter((f) => v[f])
            .map((field) => ({ field, op: 'in', value: [v[field]] })),
        }),
        channels: j({
          schemaVersion: 1,
          inApp: v.channels.includes('站内通知') || v.channels.includes('站内'),
          selected: v.channels,
        }),
        frequency: v.frequency,
        enabled: v.enabled,
      };
    case 'referral_requests':
      return {
        company_id: await company(sql, v.companyId),
        title: v.title,
        contact: v.contact,
        code: v.code ?? null,
        requested_role: v.role ?? null,
        status: v.stage,
        requested_date: v.date,
        note: v.note,
      };
    case 'calendar_events':
      if (v.applicationId) await ownedApplication(sql, userId, v.applicationId);
      return {
        application_id: v.applicationId || null,
        company_id: await company(sql, v.companyId),
        title: v.title,
        scheduled_start: timestamp(`${v.date}T${v.time}`),
        duration_minutes: v.type === '截止' ? 0 : Number(v.duration),
        event_type: v.type,
        completed: v.completed ?? false,
      };
    case 'plan_milestones':
      return { title: v.title, due_date: dateOnly(v.date) };
    case 'plan_tasks': {
      const rows = v.milestoneId
        ? await sql`select id from plan_milestones where user_id=${userId}::uuid and client_key=${v.milestoneId}`
        : [];
      if (v.milestoneId && !rows[0]) throw invalid('里程碑不存在。');
      return {
        milestone_id: rows[0]?.id ?? null,
        title: v.title,
        status: v.status,
        due_date: dateOnly(v.date),
        remind: v.remind,
      };
    }
    case 'plan_reminders':
      return { task_client_key: clientKey, reminded_date: String(value) };
    case 'offers':
      return {
        title: v.title,
        company_name: v.company,
        city: v.city,
        currency: 'CNY',
        base_monthly_minor: Math.round(v.base * 100000),
        salary_months: v.months,
        bonus_minor: Math.round(v.bonus * 100000),
        deadline_at: dateOnly(v.deadline),
        dimensions: j({ schemaVersion: 1, scores: v.scores }),
        note: v.note,
      };
    case 'offer_comparisons':
      return { name: v.name, weight: v.weight };
    case 'salary_reports':
      return {
        company_id: await company(sql, v.companyId, true),
        role: v.role,
        city: v.city,
        year: Number(v.year),
        level: v.level,
        currency: 'CNY',
        base_monthly_minor: Math.round(v.base * 100000),
        salary_months: v.months,
        bonus_minor: Math.round(v.bonus * 100000),
        sample_note: v.note,
      };
    case 'interview_rounds':
      return {
        application_id: spec.applicationId,
        sequence: position + 1,
        round_type: /HR/i.test(v.title) ? 'hr' : /技术/.test(v.title) ? 'technical' : 'other',
        title: v.title,
        scheduled_start: timestamp(v.date),
        status: ['已完成', 'completed'].includes(v.status)
          ? 'completed'
          : ['已取消', 'cancelled'].includes(v.status)
            ? 'cancelled'
            : 'scheduled',
        mode: /线下/.test(v.mode) ? 'offline' : /电话/.test(v.mode) ? 'phone' : 'online',
        questions: v.questions,
        private_notes: v.note,
      };
    case 'interview_reviews': {
      const rows =
        await sql`select id from interview_rounds where application_id=${spec.applicationId!}::uuid and user_id=${userId}::uuid and client_key=${spec.roundKey!}`;
      if (!rows[0]) throw invalid('请先保存本人的面试轮次。');
      if (
        v.audioId &&
        !(
          await sql`select id from private_files where user_id=${userId}::uuid and client_key=${v.audioId} and mime_type like 'audio/%'`
        )[0]
      )
        throw invalid('录音文件不存在。');
      return {
        interview_round_id: rows[0].id,
        transcript: v.transcript,
        private_notes: v.note,
        self_score: v.selfScore,
        recording_client_key: v.audioId ?? null,
        manual_scores: j({ schemaVersion: 1, selfScore: v.selfScore }),
        analysis: v.analysis ? j(v.analysis) : null,
      };
    }
    case 'mock_sessions':
      return {
        state: key === 'mock-draft-v2' ? 'active' : 'completed',
        configuration: j({ schemaVersion: 1, ...v.config }),
        started_at: v.createdAt ? timestamp(v.createdAt) : null,
        finished_at: v.completedAt ? timestamp(v.completedAt) : null,
        report: v.analyses ? j({ schemaVersion: 1, analyses: v.analyses, score: v.score }) : null,
      };
    case 'experience_drafts':
      return {
        experience_client_key: spec.experienceKey,
        title: v.title,
        body_md: v.content,
        role: v.role,
        company_id: await company(sql, v.companyId),
      };
    case 'question_progress':
      return {
        question_key: clientKey,
        mastery: v.mastery,
        is_wrong: v.wrong,
        attempts: v.attempts,
      };
    case 'practice_collections':
      return { title: v.title, source: v.source };
    case 'question_answers':
      return { question_key: clientKey, answer_text: String(value) };
    case 'post_comments':
      return {
        post_id: await ownedPost(sql, userId, spec.postKey!),
        parent_client_key: v.parent ?? null,
        body: v.content,
      };
    case 'experience_comments':
      return {
        experience_id: await experience(sql, spec.experienceKey!),
        parent_client_key: v.parent ?? null,
        body: v.content,
      };
    case 'experience_summaries':
      return { experience_id: await experience(sql, clientKey), summary: String(value) };
    case 'experience_reactions':
      return { experience_id: await experience(sql, clientKey), reaction: 'like' };
    case 'handbook_notes':
      return { chapter_key: clientKey, body: String(value) };
    case 'handbook_templates':
      return { template_key: clientKey, body: String(value) };
    case 'posts':
      return { body_md: v.body, tags: [v.tag], visibility: 'public', status: 'published' };
    case 'content_reports':
      return { target_client_key: clientKey, reason: v.reason, reported_date: v.date };
    case 'buddy_requests':
      return { candidate_client_key: clientKey, status: 'requested' };
    case 'radar_signal_saves':
      return { signal_client_key: clientKey };
    case 'team_rooms':
      return {
        title: v.title,
        role: v.role,
        schedule: v.schedule,
        capacity: v.capacity,
        joined: v.joined,
        is_owner: v.mine,
      };
    case 'notifications':
      return {
        type:
          v.category === '岗位动态'
            ? 'job_hit'
            : v.category === '面试提醒'
              ? 'interview_reminder'
              : 'system',
        title: v.title,
        body: v.content,
        target_path: v.href,
        dedup_key: clientKey,
      };
    case 'company_notes':
      return {
        company_id: await company(sql, spec.companyKey, true),
        title: v.title,
        category: v.category,
        role: v.role,
        rating: v.rating,
        body: v.body,
        hidden: v.hidden,
      };
    case 'company_results':
      return {
        company_id: await company(sql, spec.companyKey, true),
        title: v.title,
        role: v.role,
        result: v.result,
        note: v.note,
      };
    case 'company_checklists':
      return { company_id: await company(sql, spec.companyKey, true), item_key: clientKey };
    case 'workspace_settings':
      return { value: j(value) };
    default:
      throw invalid();
  }
}
async function relationships(
  sql: Db,
  userId: string,
  spec: WorkspaceSpec,
  id: string,
  value: unknown,
): Promise<void> {
  const v = value as Item;
  if (spec.table === 'resumes') {
    await sql`delete from resume_applications where resume_id=${id}::uuid and user_id=${userId}::uuid`;
    for (const applicationId of new Set<string>(v.applicationIds)) {
      await ownedApplication(sql, userId, applicationId);
      await sql`insert into resume_applications(resume_id,user_id,application_id) values(${id}::uuid,${userId}::uuid,${applicationId}::uuid)`;
    }
  }
  if (spec.table === 'subscriptions') {
    await sql`delete from subscription_hits where subscription_id=${id}::uuid and user_id=${userId}::uuid`;
    for (const hit of v.hits as Item[]) {
      const jobs = await sql`select id from jobs where id::text=${hit.jobId}`;
      if (!jobs[0]) throw invalid('订阅命中岗位不存在。');
      await sql`insert into subscription_hits(subscription_id,user_id,job_id,hit_date,is_read) values(${id}::uuid,${userId}::uuid,${jobs[0].id}::uuid,${hit.date},${hit.read}) on conflict(subscription_id,job_id) do update set hit_date=excluded.hit_date,is_read=excluded.is_read`;
    }
  }
  if (spec.table === 'mock_sessions') {
    await sql`delete from mock_answers where mock_session_id=${id}::uuid and user_id=${userId}::uuid`;
    for (let i = 0; i < v.questions.length; i++)
      await sql`insert into mock_answers(mock_session_id,user_id,sequence,question_key,question_snapshot,answer_text,feedback) values(${id}::uuid,${userId}::uuid,${i + 1},${v.questions[i].id},${sql.json(v.questions[i])},${v.answers[i]},${v.analyses?.[i] ? sql.json(v.analyses[i]) : null})`;
  }
  if (spec.table === 'practice_collections' || spec.table === 'team_rooms') {
    const table = spec.table === 'team_rooms' ? 'room_questions' : 'collection_questions',
      parent = spec.table === 'team_rooms' ? 'room_id' : 'collection_id';
    await sql`delete from ${sql(table)} where ${sql(parent)}=${id}::uuid and user_id=${userId}::uuid`;
    for (const [i, questionKey] of [...new Set<string>(v.questionIds)].entries())
      await sql`insert into ${sql(table)} ${sql({ [parent]: id, user_id: userId, question_key: questionKey, position: i })}`;
    if (spec.table === 'team_rooms') {
      await sql`delete from room_notes where room_id=${id}::uuid and user_id=${userId}::uuid`;
      for (const [i, note] of (v.notes as Item[]).entries())
        await sql`insert into room_notes(room_id,user_id,client_key,body,position) values(${id}::uuid,${userId}::uuid,${note.id},${note.content},${i})`;
      await sql`delete from team_members where room_id=${id}::uuid and user_id=${userId}::uuid`;
      if (v.joined || v.mine)
        await sql`insert into team_members(room_id,user_id,role) values(${id}::uuid,${userId}::uuid,${v.mine ? 'owner' : 'member'})`;
    }
  }
}
export async function saveResources(
  sql: Db,
  userId: string,
  key: string,
  spec: WorkspaceSpec,
  value: unknown,
): Promise<void> {
  const items = entries(spec, value),
    keep = items.map(([key]) => key);
  if (new Set(keep).size !== keep.length) throw invalid('记录 ID 重复。');
  if (spec.table === 'experiences') {
    const owner = (await sql`select display_name from users where id=${userId}::uuid`)[0];
    keep.length = 0;
    for (const [position, [incomingKey, item]] of items.entries()) {
      const existing =
        await sql`select id,client_key from experiences where author_id=${userId}::uuid and source_id is null and (id::text=${incomingKey} or client_key=${incomingKey}) limit 1`;
      const clientKey = existing[0]?.client_key ?? incomingKey;
      keep.push(clientKey);
      const v: Item = {
        ...(item as Item),
        author: owner.display_name,
        avatar: owner.display_name.slice(0, 1),
      };
      const rows =
        await sql`insert into experiences(author_id,client_key,workspace_key,workspace_position,company_id,title,summary,body_md,role,round_type,tags,status,content_mode,license_note,published_at,ui_payload) values(${userId}::uuid,${clientKey},${key},${position},${await company(sql, v.companyId)},${v.title},${v.excerpt},${v.sections.map((s: Item) => `## ${s.title}\n\n${s.content}`).join('\n\n')},${v.role},${/hr/i.test(v.round) ? 'hr' : 'technical'},${v.tags},'published','user_original','用户原创',now(),${sql.json(v)}) on conflict(author_id,client_key) where client_key is not null do update set workspace_key=excluded.workspace_key,workspace_position=excluded.workspace_position,company_id=excluded.company_id,title=excluded.title,summary=excluded.summary,body_md=excluded.body_md,role=excluded.role,round_type=excluded.round_type,tags=excluded.tags,status='published',published_at=coalesce(experiences.published_at,now()),ui_payload=excluded.ui_payload,updated_at=now() returning id`;
      if (!rows[0]) throw invalid();
      await sql`update experiences set ui_payload=${sql.json({ ...v, id: rows[0].id })} where id=${rows[0].id}::uuid and author_id=${userId}::uuid`;
    }
    await sql`update experiences set status='draft',workspace_key=null,updated_at=now() where author_id=${userId}::uuid and workspace_key=${key} ${keep.length ? sql`and client_key not in ${sql(keep)}` : sql``}`;
    return;
  }
  if (spec.table === 'resumes') {
    const versions = items.map(([, v]) => (v as Item).version);
    if (
      new Set(versions).size !== versions.length ||
      items.filter(([, v]) => (v as Item).default).length > 1
    )
      throw invalid('简历版本重复或默认简历超过一份。');
    await sql`update resumes set is_default=false where user_id=${userId}::uuid and workspace_key=${key}`;
  }
  if (spec.table === 'interview_rounds')
    await sql`update interview_rounds set sequence=sequence+100000 where user_id=${userId}::uuid and application_id=${spec.applicationId!}::uuid`;
  for (const [position, [clientKey, item]] of items.entries()) {
    const fields = await resourceFields(sql, userId, key, spec, clientKey, item, position);
    const row = {
      user_id: userId,
      workspace_key: key,
      client_key: clientKey,
      position,
      ui_payload: sql.json(item as never),
      ...fields,
    };
    const update = {
      position,
      ui_payload: row.ui_payload,
      ...fields,
      updated_at: new Date().toISOString(),
    };
    const rows =
      await sql`insert into ${sql(spec.table)} ${sql(row)} on conflict(user_id,workspace_key,client_key) do update set ${sql(update)} returning id`;
    await relationships(sql, userId, spec, rows[0].id, item);
  }
  await sql`delete from ${sql(spec.table)} where user_id=${userId}::uuid and workspace_key=${key} ${keep.length ? sql`and client_key not in ${sql(keep)}` : sql``}`;
  if (spec.table === 'posts')
    await sql`delete from workspace_revisions r where r.user_id=${userId}::uuid and r.key like 'discussion-community-%' and not exists(select 1 from posts p where p.user_id=${userId}::uuid and p.workspace_key='posts' and p.client_key=substring(r.key from length('discussion-community-')+1))`;
}
export async function readResource(
  sql: Db,
  userId: string,
  key: string,
  spec: WorkspaceSpec,
): Promise<unknown> {
  const rows =
    spec.table === 'experiences'
      ? await sql`select id,client_key,ui_payload from experiences where author_id=${userId}::uuid and workspace_key=${key} order by workspace_position,id`
      : await sql`select client_key,ui_payload from ${sql(spec.table)} where user_id=${userId}::uuid and workspace_key=${key} order by position,id`;
  if (spec.shape === 'scalar') return rows[0]?.ui_payload ?? null;
  if (spec.shape === 'dictionary')
    return Object.fromEntries(rows.map((r) => [r.client_key, r.ui_payload]));
  if (spec.shape === 'learning')
    return {
      mastery: Object.fromEntries(
        rows
          .filter((r) => r.ui_payload.mastery !== null)
          .map((r) => [r.client_key, r.ui_payload.mastery]),
      ),
      wrong: rows.filter((r) => r.ui_payload.wrong).map((r) => r.client_key),
      attempts: Object.fromEntries(
        rows
          .filter((r) => r.ui_payload.attempts !== null)
          .map((r) => [r.client_key, r.ui_payload.attempts]),
      ),
    };
  return rows.map((r) =>
    spec.table === 'experiences' ? { ...r.ui_payload, id: r.id } : r.ui_payload,
  );
}
async function withWorkspace(
  request: Request,
  write: boolean,
  run: (sql: Db, userId: string) => Promise<Response>,
): Promise<Response> {
  const session = await authenticate(request, write);
  return transaction(session.userId, async (sql) => {
    if (write) {
      await sql`select pg_advisory_xact_lock(hashtextextended(${'workspace:' + session.userId},0))`;
      await rateLimit(sql, 'workspace:' + session.userId, 60, 60);
    }
    const response = await run(sql, session.userId);
    response.headers.set('X-CSRF-Token', session.csrf);
    return response;
  });
}
export async function workspace(request: Request): Promise<Response> {
  return withWorkspace(request, false, async (sql, userId) => {
    const revisions =
      await sql`select key,version from workspace_revisions where user_id=${userId}::uuid order by key limit 2001`;
    if (revisions.length > 2000) throw invalid('工作区记录数量超过限制。');
    const records: Record<string, { value: unknown; version: number }> = {};
    for (const row of revisions) {
      const spec = workspaceSpec(row.key);
      await authorizeSpec(sql, userId, spec);
      records[row.key] = {
        value: await readResource(sql, userId, row.key, spec),
        version: row.version,
      };
    }
    return json({ data: { records } });
  });
}
export async function workspaceRecord(request: Request, key: string): Promise<Response> {
  const spec = workspaceSpec(key);
  return withWorkspace(request, request.method === 'PUT', async (sql, userId) => {
    await authorizeSpec(sql, userId, spec);
    const revisions =
      await sql`select version from workspace_revisions where user_id=${userId}::uuid and key=${key} for update`;
    let version = revisions[0]?.version ?? 0;
    if (request.method === 'PUT') {
      const input = await body(
        request,
        z
          .object({ value: z.unknown(), expectedVersion: z.number().int().min(0).max(2147483646) })
          .strict(),
      );
      if (input.expectedVersion !== version) throw conflict();
      const value = validateWorkspaceValue(key, input.value);
      if (
        !version &&
        (
          await sql`select count(*)::int count from workspace_revisions where user_id=${userId}::uuid`
        )[0].count >= 2000
      )
        throw invalid('工作区记录数量超过限制。');
      await saveResources(sql, userId, key, spec, value);
      version++;
      await sql`insert into workspace_revisions(user_id,key,version) values(${userId}::uuid,${key},${version}) on conflict(user_id,key) do update set version=excluded.version,updated_at=now()`;
    }
    return json({
      data: { value: version ? await readResource(sql, userId, key, spec) : null, version },
    });
  });
}
