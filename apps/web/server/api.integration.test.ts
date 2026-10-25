/** Run only against the disposable, migrated local database. No provider calls. */
import { beforeAll, afterAll, describe, it, expect, vi } from 'vitest';
import postgres from 'postgres';
import { randomBytes, randomUUID } from 'node:crypto';
import { seal, sessionCsrf } from './auth';
import { hash } from './http';
import { workerSignature } from './worker';
import { GET as catalog } from '../app/api/v1/catalog/route';
import { POST as importJobs } from '../app/api/v1/jobs/import/route';
import { DELETE as deleteApplication } from '../app/api/v1/applications/[id]/route';
import { GET as jobs } from '../app/api/v1/jobs/route';
import { POST as createApplication } from '../app/api/v1/applications/route';
import {
  GET as getApplication,
  PATCH as patchApplication,
} from '../app/api/v1/applications/[id]/route';
import { POST as moveApplication } from '../app/api/v1/applications/[id]/move/route';
import { POST as undoApplication } from '../app/api/v1/applications/[id]/undo/route';
import {
  GET as getProgress,
  PUT as putProgress,
} from '../app/api/v1/handbook/progress/[chapterId]/route';
import {
  PUT as favorite,
  DELETE as unfavorite,
} from '../app/api/v1/favorites/[type]/[targetId]/route';
import { POST as ingest } from '../app/api/internal/v1/crawl/batches/route';
import { POST as logout } from '../app/api/v1/auth/logout/route';
const enabled = !!process.env.API_INTEGRATION_DATABASE_URL;
const origin = 'http://localhost:3000',
  ids = {
    company: randomUUID(),
    source: randomUUID(),
    job: randomUUID(),
    otherJob: randomUUID(),
    chapter: randomUUID(),
    user: randomUUID(),
    otherUser: randomUUID(),
    task: randomUUID(),
    run: randomUUID(),
    lease: randomUUID(),
  };
const token = randomBytes(32).toString('base64url'),
  otherToken = randomBytes(32).toString('base64url');
let admin: ReturnType<typeof postgres>;
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const req = (path: string, method = 'GET', value?: unknown, key?: string, sessionToken = token) =>
  new Request(origin + path, {
    method,
    headers: {
      Origin: origin,
      Cookie: 'campus_session=' + sessionToken,
      'X-CSRF-Token': sessionCsrf(hash(sessionToken)),
      'Content-Type': 'application/json',
      ...(key ? { 'Idempotency-Key': key } : {}),
    },
    body: value === undefined ? undefined : JSON.stringify(value),
  });
describe.skipIf(!enabled)('PostgreSQL API ownership, mutations and signed ingestion', () => {
  beforeAll(async () => {
    vi.stubEnv('NEXT_PUBLIC_DATA_MODE', 'api');
    vi.stubEnv('SESSION_ENCRYPTION_KEY', Buffer.alloc(32, 7).toString('base64'));
    vi.stubEnv('SUPABASE_URL', 'https://unused-provider.invalid');
    vi.stubEnv('SUPABASE_ANON_KEY', 'unused');
    vi.stubEnv('APP_ORIGIN', origin);
    vi.stubEnv('WORKER_HMAC_KEY', 'integration-worker-secret-at-least-32-bytes');
    vi.stubEnv('WORKER_HMAC_KEY_ID', 'integration');
    admin = postgres(process.env.API_INTEGRATION_DATABASE_URL!, { max: 1 });
    await admin`insert into companies(id,slug,name) values(${ids.company}::uuid,${'api-test-' + ids.company},'API integration fixture')`;
    await admin`insert into sources(id,name,base_url,allowed_hosts,company_id,robots_checked_at,permission_status,terms_note,enabled) values(${ids.source}::uuid,'API fixture source','https://example.invalid',array['example.invalid'],${ids.company}::uuid,now(),'approved','Local synthetic fixture, no network use',true)`;
    for (const jobId of [ids.job, ids.otherJob])
      await admin`insert into jobs(id,company_id,source_id,canonical_url,title,role,recruitment_type,description_md,published_at,last_seen_at,verified_at,status,content_hash) values(${jobId}::uuid,${ids.company}::uuid,${ids.source}::uuid,${'https://example.invalid/' + jobId},'API integration frontend','frontend','campus','Synthetic test fixture',now(),now(),now(),'open',${'0'.repeat(64)})`;
    await admin`insert into handbook_chapters(id,slug,title,direction,body_md,status) values(${ids.chapter}::uuid,${'api-test-' + ids.chapter},'API test chapter','frontend','Synthetic content','published')`;
    for (const [userId, sessionToken] of [
      [ids.user, token],
      [ids.otherUser, otherToken],
    ])
      await admin`select app.create_auth_session(${userId}::uuid,'API fixture',${seal({ access_token: 'never-sent-to-browser', refresh_token: 'never-sent-to-browser', expires_at: Date.now() + 3600000, email: 'student@example.invalid', userId })},${hash(sessionToken)},now()+interval '1 day')`;
  });
  afterAll(async () => {
    if (admin) {
      await admin`delete from application_stage_events where actor_id in (${ids.user}::uuid,${ids.otherUser}::uuid)`;
      await admin`delete from applications where user_id in (${ids.user}::uuid,${ids.otherUser}::uuid)`;
      await admin`delete from favorites where user_id in (${ids.user}::uuid,${ids.otherUser}::uuid)`;
      await admin`delete from chapter_progress where user_id in (${ids.user}::uuid,${ids.otherUser}::uuid)`;
      await admin`delete from auth_sessions where user_id in (${ids.user}::uuid,${ids.otherUser}::uuid)`;
      await admin`delete from idempotency_records where actor_id in (${ids.user}::uuid,${ids.otherUser}::uuid)`;
      await admin`delete from users where id in (${ids.user}::uuid,${ids.otherUser}::uuid)`;
      await admin`delete from handbook_chapters where id=${ids.chapter}::uuid`;
      await admin`delete from crawl_batches where run_id=${ids.run}::uuid`;
      await admin`delete from crawl_runs where id=${ids.run}::uuid`;
      await admin`delete from tasks where id=${ids.task}::uuid`;
      await admin`delete from jobs where source_id=${ids.source}::uuid`;
      await admin`delete from sources where id=${ids.source}::uuid`;
      await admin`delete from companies where id=${ids.company}::uuid`;
      await admin.end();
    }
    vi.unstubAllEnvs();
  });
  it('filters and keyset-paginates real PostgreSQL DTOs', async () => {
    const first = await jobs(
      req('/api/v1/jobs?companyId=' + ids.company + '&limit=1&includeTotal=true'),
    );
    expect(first.status).toBe(200);
    const value = await first.json();
    expect(value.meta.total).toBe(2);
    expect(first.headers.get('X-Campus-Data-Mode')).toBe('api');
    const second = await jobs(
      req('/api/v1/jobs?companyId=' + ids.company + '&limit=1&cursor=' + value.page.nextCursor),
    );
    const next = await second.json();
    expect(next.data).toHaveLength(1);
    expect(next.data[0].id).not.toBe(value.data[0].id);
  });
  it('checks ownership, versions, idempotency, move and undo in transactions', async () => {
    const created = await createApplication(
      req('/api/v1/applications', 'POST', { jobId: ids.job }, 'create-1'),
    );
    expect(created.status).toBe(201);
    const value = (await created.json()).data;
    const replay = await createApplication(
      req('/api/v1/applications', 'POST', { jobId: ids.job }, 'create-1'),
    );
    expect((await replay.json()).data.id).toBe(value.id);
    expect(
      (
        await createApplication(
          req('/api/v1/applications', 'POST', { jobId: ids.otherJob }, 'create-1'),
        )
      ).status,
    ).toBe(409);
    const patched = await patchApplication(
      req('/api/v1/applications/' + value.id, 'PATCH', { notes: 'Private note', version: 1 }),
      ctx(value.id),
    );
    expect(patched.status).toBe(200);
    expect((await patched.json()).data.version).toBe(2);
    expect(
      (
        await patchApplication(
          req('/api/v1/applications/' + value.id, 'PATCH', { notes: 'stale', version: 1 }),
          ctx(value.id),
        )
      ).status,
    ).toBe(409);
    expect(
      (
        await getApplication(
          req('/api/v1/applications/' + value.id, 'GET', undefined, undefined, otherToken),
          ctx(value.id),
        )
      ).status,
    ).toBe(404);
    const moved = await moveApplication(
      req(
        '/api/v1/applications/' + value.id + '/move',
        'POST',
        { stage: 'APPLIED', version: 2 },
        'move-1',
      ),
      ctx(value.id),
    );
    expect(moved.status).toBe(200);
    const move = (await moved.json()).data;
    expect(move.application.stage).toBe('APPLIED');
    const undone = await undoApplication(
      req(
        '/api/v1/applications/' + value.id + '/undo',
        'POST',
        { operationId: move.event.operationId, version: 3 },
        'undo-1',
      ),
      ctx(value.id),
    );
    expect(undone.status).toBe(200);
    expect((await undone.json()).data.application.stage).toBe('PENDING');
  });
  it('isolates progress and makes favorites naturally idempotent', async () => {
    const progressCtx = { params: Promise.resolve({ chapterId: ids.chapter }) };
    expect(
      (
        await (
          await getProgress(req('/api/v1/handbook/progress/' + ids.chapter), progressCtx)
        ).json()
      ).data.version,
    ).toBe(0);
    const put = await putProgress(
      req('/api/v1/handbook/progress/' + ids.chapter, 'PUT', {
        completed: true,
        note: 'Only mine',
        version: 0,
      }),
      progressCtx,
    );
    expect(put.status).toBe(200);
    expect(
      (
        await putProgress(
          req('/api/v1/handbook/progress/' + ids.chapter, 'PUT', {
            completed: false,
            note: 'stale',
            version: 0,
          }),
          progressCtx,
        )
      ).status,
    ).toBe(409);
    expect(
      (
        await (
          await getProgress(
            req(
              '/api/v1/handbook/progress/' + ids.chapter,
              'GET',
              undefined,
              undefined,
              otherToken,
            ),
            progressCtx,
          )
        ).json()
      ).data.note,
    ).toBe('');
    const favoriteCtx = { params: Promise.resolve({ type: 'job', targetId: ids.job }) };
    const first = await favorite(req('/api/v1/favorites/job/' + ids.job, 'PUT'), favoriteCtx);
    const firstDto = (await first.json()).data;
    expect(first.status).toBe(200);
    expect(
      (await (await favorite(req('/api/v1/favorites/job/' + ids.job, 'PUT'), favoriteCtx)).json())
        .data.id,
    ).toBe(firstDto.id);
    expect(
      (await unfavorite(req('/api/v1/favorites/job/' + ids.job, 'DELETE'), favoriteCtx)).status,
    ).toBe(204);
  });
  it('requires lease, source permission, durable nonce and batch idempotency', async () => {
    await admin`insert into tasks(id,type,state,payload,dedup_key,lease_owner,lease_until,lease_token,expires_at) values(${ids.task}::uuid,'CRAWL_JOBS','running',${admin.json({ schemaVersion: 1, sourceId: ids.source })},${'api-test-' + ids.task},'test-worker',now()+interval '1 hour',${ids.lease}::uuid,now()+interval '2 hours')`;
    await admin`insert into crawl_runs(id,source_id,task_id) values(${ids.run}::uuid,${ids.source}::uuid,${ids.task}::uuid)`;
    const raw = JSON.stringify({
      sourceId: ids.source,
      runId: ids.run,
      taskId: ids.task,
      leaseToken: ids.lease,
      batchId: randomUUID(),
      jobs: [],
      final: true,
    });
    const signed = (rawBody: string, nonce: string) => {
      const timestamp = String(Math.floor(Date.now() / 1000));
      return new Request(origin + '/api/internal/v1/crawl/batches', {
        method: 'POST',
        headers: {
          'X-Worker-Key-Id': 'integration',
          'X-Worker-Timestamp': timestamp,
          'X-Worker-Nonce': nonce,
          'X-Worker-Signature': workerSignature(
            process.env.WORKER_HMAC_KEY!,
            timestamp,
            nonce,
            'POST',
            '/api/internal/v1/crawl/batches',
            rawBody,
          ),
        },
        body: rawBody,
      });
    };
    const nonce = randomBytes(24).toString('base64url');
    expect((await ingest(signed(raw, nonce))).status).toBe(200);
    expect((await ingest(signed(raw, nonce))).status).toBe(403);
    expect((await ingest(signed(raw, randomBytes(24).toString('base64url')))).status).toBe(200);
    const modified = JSON.stringify({ ...JSON.parse(raw), final: false });
    expect((await ingest(signed(modified, randomBytes(24).toString('base64url')))).status).toBe(
      409,
    );
  });
  it('restores the original same-column order after rebalance and undo', async () => {
    const cards = [
      '11111111-1111-4111-8111-111111111111',
      'ffffffff-ffff-4fff-8fff-ffffffffffff',
      '22222222-2222-4222-8222-222222222222',
    ];
    for (let i = 0; i < cards.length; i++) {
      const jobId = randomUUID();
      await admin`insert into jobs(id,company_id,source_id,canonical_url,title,role,recruitment_type,description_md,published_at,last_seen_at,verified_at,status,content_hash) values(${jobId}::uuid,${ids.company}::uuid,${ids.source}::uuid,${'https://example.invalid/' + jobId},'Ordering fixture','frontend','campus','Synthetic test',now(),now(),now(),'open',${'0'.repeat(64)})`;
      await admin`insert into applications(id,user_id,job_id,stage,sort_key) values(${cards[i]}::uuid,${ids.user}::uuid,${jobId}::uuid,'ASSESSMENT',${(i + 1) * 1024})`;
    }
    const moved = await moveApplication(
      req(
        '/api/v1/applications/' + cards[1] + '/move',
        'POST',
        { stage: 'ASSESSMENT', version: 1, beforeId: cards[0] },
        'same-column-move',
      ),
      ctx(cards[1]),
    );
    expect(moved.status).toBe(200);
    const operation = (await moved.json()).data.event.operationId;
    const undone = await undoApplication(
      req(
        '/api/v1/applications/' + cards[1] + '/undo',
        'POST',
        { operationId: operation, version: 2 },
        'same-column-undo',
      ),
      ctx(cards[1]),
    );
    expect(undone.status).toBe(200);
    const order =
      await admin`select id from applications where user_id=${ids.user}::uuid and stage='ASSESSMENT' order by sort_key,id`;
    expect(order.map((row) => row.id)).toEqual(cards);
  });
  it('imports explicitly supplied jobs without granting crawler permission and exposes UUIDs in the catalog', async () => {
    const canonicalUrl = 'https://example.invalid/manual-integration/' + randomUUID();
    let sourceId: string | undefined;
    try {
      const imported = await importJobs(
        req('/api/v1/jobs/import', 'POST', {
          jobs: [
            {
              company: { id: ids.company, name: 'API integration fixture' },
              title: 'Explicit manual integration record',
              role: 'frontend',
              cities: ['北京'],
              recruitmentType: 'campus',
              graduationYears: [2027],
              descriptionMd: 'Disposable local integration record, never production content.',
              canonicalUrl,
            },
          ],
        }),
      );
      expect(imported.status).toBe(201);
      const records =
        await admin`select j.id,j.source_id,j.verified_at,s.enabled,s.permission_status,s.entry_mode from jobs j join sources s on s.id=j.source_id where j.canonical_url=${canonicalUrl}`;
      expect(records).toHaveLength(1);
      sourceId = records[0].source_id;
      expect(records[0]).toMatchObject({
        verified_at: null,
        enabled: false,
        permission_status: 'pending',
        entry_mode: 'manual',
      });
      const snapshot = await catalog(req('/api/v1/catalog'));
      expect(snapshot.status).toBe(200);
      const value = await snapshot.json();
      expect(value.data.jobs.find((j: { id: string }) => j.id === records[0].id)).toMatchObject({
        companyId: ids.company,
        canonicalUrl,
      });
      expect(value.data.jobs.some((j: { id: string }) => j.id === 'job-1')).toBe(false);
      const created = await createApplication(
        req('/api/v1/applications', 'POST', { jobId: records[0].id }, randomUUID()),
      );
      const application = (await created.json()).data;
      const patched = await patchApplication(
        req('/api/v1/applications/' + application.id, 'PATCH', {
          date: '2026-10-24',
          notes: 'Durable note',
          version: 1,
        }),
        ctx(application.id),
      );
      expect((await patched.json()).data).toMatchObject({
        date: '2026-10-24',
        notes: 'Durable note',
        version: 2,
      });
      expect(
        (
          await deleteApplication(
            req('/api/v1/applications/' + application.id, 'DELETE', { version: 1 }),
            ctx(application.id),
          )
        ).status,
      ).toBe(409);
      expect(
        (
          await deleteApplication(
            req('/api/v1/applications/' + application.id, 'DELETE', { version: 2 }),
            ctx(application.id),
          )
        ).status,
      ).toBe(204);
      expect(
        (await getApplication(req('/api/v1/applications/' + application.id), ctx(application.id)))
          .status,
      ).toBe(404);
    } finally {
      if (sourceId) {
        await admin`delete from application_stage_events where application_id in (select a.id from applications a join jobs j on j.id=a.job_id where j.source_id=${sourceId}::uuid)`;
        await admin`delete from applications where job_id in (select id from jobs where source_id=${sourceId}::uuid)`;
        await admin`delete from jobs where source_id=${sourceId}::uuid`;
        await admin`delete from sources where id=${sourceId}::uuid`;
      }
    }
  });
  it('revokes the opaque session on logout', async () => {
    expect((await logout(req('/api/v1/auth/logout', 'POST'))).status).toBe(204);
    const response = await getProgress(req('/api/v1/handbook/progress/' + ids.chapter), {
      params: Promise.resolve({ chapterId: ids.chapter }),
    });
    expect(response.status).toBe(401);
  });
});
