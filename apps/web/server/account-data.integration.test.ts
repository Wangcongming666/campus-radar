/** Opt in only on the disposable migrated database (0009 required).
 * API_INTEGRATION_DATABASE_URL=owner URL; DATABASE_URL=campus_web URL.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import postgres from 'postgres';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { seal, sessionCsrf } from './auth';
import { hash } from './http';
import { signCloudBackup, type CloudBackup } from './account-data';
import { GET as exportData } from '../app/api/v1/workspace/export/route';
import { POST as restoreData } from '../app/api/v1/workspace/import/route';
import { POST as resetData } from '../app/api/v1/workspace/reset/route';
import { PUT as putRecord, GET as getRecord } from '../app/api/v1/workspace/records/[key]/route';
import { PUT as putFile, GET as getFile } from '../app/api/v1/files/[id]/route';
import { GET as listFavorites } from '../app/api/v1/favorites/route';
import {
  PUT as favorite,
  DELETE as unfavorite,
} from '../app/api/v1/favorites/[type]/[targetId]/route';
const enabled = !!process.env.API_INTEGRATION_DATABASE_URL;
const origin = 'http://localhost:3000';
const ids = {
  owner: randomUUID(),
  other: randomUUID(),
  company: randomUUID(),
  source: randomUUID(),
  job: randomUUID(),
  app: randomUUID(),
  otherApp: randomUUID(),
  chapter: randomUUID(),
  question: randomUUID(),
  question2: randomUUID(),
  question3: randomUUID(),
  draftQuestion: randomUUID(),
};
const token = randomBytes(32).toString('base64url'),
  otherToken = randomBytes(32).toString('base64url');
let admin: ReturnType<typeof postgres>;
let filesRoot = '';
let original: CloudBackup;
const ctx = (key: string) => ({ params: Promise.resolve({ key, id: key }) });
function req(path: string, method = 'GET', value?: unknown, session = token) {
  return new Request(origin + '/api/v1/' + path, {
    method,
    headers: {
      Origin: origin,
      Cookie: 'campus_session=' + session,
      'X-CSRF-Token': sessionCsrf(hash(session)),
      ...(value instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
    },
    body:
      value === undefined ? undefined : value instanceof FormData ? value : JSON.stringify(value),
  });
}
async function save(key: string, value: unknown, version = 0, session = token) {
  const response = await putRecord(
    req('workspace/records/' + key, 'PUT', { value, expectedVersion: version }, session),
    ctx(key),
  );
  const result = await response.json();
  expect(response.status, JSON.stringify(result)).toBe(200);
  return result.data;
}
async function exported(session = token, includeFiles = false): Promise<CloudBackup> {
  const response = await exportData(
    req('workspace/export?includeFiles=' + includeFiles, 'GET', undefined, session),
  );
  const result = await response.json();
  expect(response.status, JSON.stringify(result)).toBe(200);
  return result.data;
}

describe.skipIf(!enabled)(
  'PostgreSQL native account backups, atomic restore and isolated reset',
  () => {
    beforeAll(async () => {
      vi.stubEnv('NODE_ENV', 'test');
      vi.stubEnv('AUTH_PROVIDER', 'local');
      vi.stubEnv('NEXT_PUBLIC_DATA_MODE', 'api');
      vi.stubEnv('APP_ORIGIN', origin);
      vi.stubEnv('SESSION_ENCRYPTION_KEY', Buffer.alloc(32, 51).toString('base64'));
      filesRoot = await mkdtemp(join(tmpdir(), 'campus-account-data-integration-'));
      vi.stubEnv('PRIVATE_FILE_ROOT', filesRoot);
      admin = postgres(process.env.API_INTEGRATION_DATABASE_URL!, { max: 1 });
      await admin`insert into companies(id,slug,name) values(${ids.company}::uuid,${'account-backup-' + ids.company},'Native backup fixture')`;
      await admin`insert into sources(id,name,base_url,allowed_hosts,company_id) values(${ids.source}::uuid,'Backup fixture','https://example.invalid',array['example.invalid'],${ids.company}::uuid)`;
      await admin`insert into jobs(id,company_id,source_id,canonical_url,title,role,recruitment_type,description_md,published_at,last_seen_at,verified_at,status,content_hash) values(${ids.job}::uuid,${ids.company}::uuid,${ids.source}::uuid,${'https://example.invalid/' + ids.job},'Native backup job','frontend','campus','Actual integration fixture',now(),now(),null,'open','test')`;
      await admin`insert into handbook_chapters(id,slug,title,direction,body_md,status) values(${ids.chapter}::uuid,${'backup-' + ids.chapter},'Backup chapter','frontend','Fixture chapter','published')`;
      for (const question of [ids.question, ids.question2, ids.question3])
        await admin`insert into questions(id,title,topic,difficulty,answer,status) values(${question}::uuid,'真实收藏题目','frontend','中等','实际参考答案','published')`;
      await admin`insert into questions(id,title,topic,difficulty,answer,status) values(${ids.draftQuestion}::uuid,'尚未发布的题目','frontend','中等','未发布答案','draft')`;
      for (const [owner, session] of [
        [ids.owner, token],
        [ids.other, otherToken],
      ])
        await admin`select app.create_auth_session(${owner}::uuid,'备份测试账号',${seal({ provider: 'local', email: 'backup@example.invalid', userId: owner })},${hash(session)},now()+interval '1 day')`;
      await admin`insert into applications(id,user_id,job_id,notes) values(${ids.app}::uuid,${ids.owner}::uuid,${ids.job}::uuid,'我的真实投递备注'),(${ids.otherApp}::uuid,${ids.other}::uuid,${ids.job}::uuid,'另一个账号的投递')`;
      await admin`insert into application_stage_events(application_id,to_stage,new_sort_key,actor_id,version) values(${ids.app}::uuid,'PENDING',1024,${ids.owner}::uuid,1)`;
      for (const owner of [ids.owner, ids.other])
        await admin`insert into favorites(user_id,target_type,job_id) values(${owner}::uuid,'job',${ids.job}::uuid)`;
      await admin`insert into chapter_progress(user_id,chapter_id,completed,note,chapter_version) values(${ids.owner}::uuid,${ids.chapter}::uuid,true,'我的知识笔记',1)`;
      expect(
        (
          await favorite(req('favorites/question/' + ids.question, 'PUT'), {
            params: Promise.resolve({ type: 'question', targetId: ids.question }),
          })
        ).status,
      ).toBe(200);
      const form = new FormData();
      form.append(
        'file',
        new Blob(['用户上传的实际简历文字'], { type: 'text/plain' }),
        'resume.txt',
      );
      expect(
        (await putFile(req('files/native-resume', 'PUT', form), ctx('native-resume'))).status,
      ).toBe(200);
      await save('resume-library-v2', [
        {
          id: 'native-resume',
          fileId: 'native-resume',
          name: '实际简历',
          fileName: 'resume.txt',
          mime: 'text/plain',
          size: Buffer.byteLength('用户上传的实际简历文字'),
          text: '用户上传的实际简历文字',
          role: '研发',
          createdAt: '2026-10-24T00:00:00Z',
          version: 1,
          default: true,
          applicationIds: [ids.app],
        },
      ]);
      await admin`update applications set resume_id=(select id from resumes where user_id=${ids.owner}::uuid and client_key='native-resume') where id=${ids.app}::uuid`;
      await save('planner-milestones-v2', [
        { id: 'native-milestone', title: '实际目标', date: '2026-11-01' },
      ]);
      await save('planner-tasks-v2', [
        {
          id: 'native-task',
          title: '实际任务',
          milestoneId: 'native-milestone',
          status: '进行中',
          date: '2026-10-30',
          remind: true,
        },
      ]);
      await save('referral-records-v2', [
        {
          id: 'native-referral',
          title: '实际联系岗位',
          companyId: '',
          company: '手填实际公司',
          code: 'CONTACT-CODE',
          role: '研发',
          contact: '我的联系人',
          stage: '已自行联系',
          date: '2026-10-24',
          note: '',
        },
      ]);
      await save(`interview-rounds-v2-${ids.app}`, [
        {
          id: 'native-round',
          title: '真实一面',
          date: '2026-10-25T10:00',
          status: '待进行',
          mode: '线上',
          questions: '项目',
          note: '真实安排',
        },
      ]);
      await save(`interview-review-v2-${ids.app}-native-round`, {
        transcript: '我的面试复盘',
        note: '下次改进',
        selfScore: 4,
      });
      await save('knowledge-experiences', [
        {
          id: 'local-exp-native-public',
          companyId: ids.company,
          title: '原始公开原创面经',
          role: '研发',
          round: '技术一面',
          author: '',
          avatar: '',
          date: '2026-10-24',
          readTime: '2分钟',
          tags: ['原创'],
          views: 0,
          likes: 0,
          excerpt: '用户原创面经内容',
          sections: [{ title: '面试经历', content: '实际面试的经验记录' }],
        },
      ]);
      await save('radar-core-notes', { 'notifications-read': '[]', 'my-note': '我的私有文字' });
      await save('diagnosis-text-v2', '其他账号的文本', 0, otherToken);
    });
    afterAll(async () => {
      if (admin) {
        for (const owner of [ids.owner, ids.other])
          await admin.begin(async (sql) => {
            await sql`select set_config('app.user_id',${owner},true)`;
            await sql`select app.reset_private_workspace()`;
          });
        await admin`delete from experiences where author_id in (${ids.owner}::uuid,${ids.other}::uuid)`;
        await admin`delete from auth_sessions where user_id in (${ids.owner}::uuid,${ids.other}::uuid)`;
        await admin`delete from users where id in (${ids.owner}::uuid,${ids.other}::uuid)`;
        await admin`delete from handbook_chapters where id=${ids.chapter}::uuid`;
        await admin`delete from questions where id in (${ids.question}::uuid,${ids.question2}::uuid,${ids.question3}::uuid,${ids.draftQuestion}::uuid)`;
        await admin`delete from jobs where id=${ids.job}::uuid`;
        await admin`delete from sources where id=${ids.source}::uuid`;
        await admin`delete from companies where id=${ids.company}::uuid`;
        await admin.end();
      }
      if (filesRoot) await rm(filesRoot, { recursive: true, force: true });
      vi.unstubAllEnvs();
    });
    it('exports actual owned core/workspace data and original file bytes, excluding credentials and other accounts', async () => {
      original = await exported(token, true);
      expect(original.ownerId).toBe(ids.owner);
      expect(original.core.applications).toHaveLength(1);
      expect(original.core.applications[0].notes).toBe('我的真实投递备注');
      expect(original.core.stageEvents).toHaveLength(1);
      expect(original.core.favorites).toHaveLength(2);
      expect(
        original.core.favorites.find((row) => row.target_type === 'question')?.question_id,
      ).toBe(ids.question);
      expect(original.core.chapterProgress[0].note).toBe('我的知识笔记');
      expect(Buffer.from(original.files[0].data!, 'base64').toString()).toBe(
        '用户上传的实际简历文字',
      );
      expect(JSON.stringify(original)).not.toMatch(
        /encrypted_provider_credentials|token_hash|其他账号的文本/,
      );
    });
    it('rejects cross-account and stale restores before changing current rows', async () => {
      const other = await exported(otherToken);
      expect(
        (
          await restoreData(
            req(
              'workspace/import',
              'POST',
              { backup: original, expectedVersion: other.stateVersion, confirm: 'RESTORE' },
              otherToken,
            ),
          )
        ).status,
      ).toBe(403);
      await save('diagnosis-text-v2', '备份之后的新文本');
      await save(
        'knowledge-experiences',
        (original.records['knowledge-experiences'].value as Record<string, unknown>[]).map(
          (value) => ({ ...value, title: '备份之后更新的公开原创' }),
        ),
        1,
      );
      expect(
        (
          await restoreData(
            req('workspace/import', 'POST', {
              backup: original,
              expectedVersion: original.stateVersion,
              confirm: 'RESTORE',
            }),
          )
        ).status,
      ).toBe(409);
      expect((await admin`select notes from applications where id=${ids.app}::uuid`)[0].notes).toBe(
        '我的真实投递备注',
      );
    });
    it('rolls back the entire database restore and removes staged files when a resource relationship fails', async () => {
      const current = await exported();
      const { signature: _signature, ...unsigned } = original;
      const invalid = signCloudBackup({
        ...unsigned,
        records: {
          ...original.records,
          'salary-samples-v2': {
            version: 1,
            value: [
              {
                id: 'bad-salary',
                companyId: 'missing-real-company',
                role: '研发',
                city: '杭州',
                base: 20,
                months: 12,
                bonus: 0,
                year: '2027',
                level: '本科',
                source: '用户自填',
                note: '',
              },
            ],
          },
        },
      });
      const before = await readdir(filesRoot);
      const response = await restoreData(
        req('workspace/import', 'POST', {
          backup: invalid,
          expectedVersion: current.stateVersion,
          confirm: 'RESTORE',
        }),
      );
      expect(response.status, JSON.stringify(await response.json())).toBe(422);
      expect((await exported()).stateVersion).toBe(current.stateVersion);
      expect(await readdir(filesRoot)).toEqual(before);
    });
    it('resets only this account, then restores the native backup with core references and file originals intact', async () => {
      const current = await exported();
      const reset = await resetData(
        req('workspace/reset', 'POST', { expectedVersion: current.stateVersion, confirm: 'RESET' }),
      );
      expect(reset.status, JSON.stringify(await reset.json())).toBe(200);
      expect(
        await admin`select id from applications where user_id=${ids.owner}::uuid`,
      ).toHaveLength(0);
      expect(await admin`select id from favorites where user_id=${ids.owner}::uuid`).toHaveLength(
        0,
      );
      expect(
        await admin`select key from workspace_revisions where user_id=${ids.owner}::uuid`,
      ).toHaveLength(0);
      expect(
        await admin`select id from applications where user_id=${ids.other}::uuid`,
      ).toHaveLength(1);
      expect(await admin`select id from favorites where user_id=${ids.other}::uuid`).toHaveLength(
        1,
      );
      expect((await getFile(req('files/native-resume'), ctx('native-resume'))).status).toBe(404);
      const empty = await exported();
      const restored = await restoreData(
        req('workspace/import', 'POST', {
          backup: original,
          expectedVersion: empty.stateVersion,
          confirm: 'RESTORE',
        }),
      );
      expect(restored.status, JSON.stringify(await restored.json())).toBe(200);
      const loaded = await exported(token, true);
      expect(loaded.core.applications[0].id).toBe(ids.app);
      expect(loaded.core.applications[0].resume_id).toBeTruthy();
      expect(loaded.core.applications[0].version).toBeGreaterThan(
        original.core.applications[0].version,
      );
      expect(loaded.core.stageEvents).toHaveLength(1);
      expect(loaded.core.favorites).toHaveLength(2);
      expect(loaded.core.favorites.find((row) => row.target_type === 'question')?.question_id).toBe(
        ids.question,
      );
      expect(loaded.records['planner-tasks-v2'].version).toBeGreaterThan(
        original.records['planner-tasks-v2'].version,
      );
      expect(loaded.records['planner-tasks-v2'].value).toEqual(
        original.records['planner-tasks-v2'].value,
      );
      expect(loaded.files[0].data).toBe(original.files[0].data);
      expect(
        (await admin`select title,status from experiences where author_id=${ids.owner}::uuid`)[0],
      ).toMatchObject({ title: '备份之后更新的公开原创', status: 'published' });
      const other = await getRecord(
        req('workspace/records/diagnosis-text-v2', 'GET', undefined, otherToken),
        ctx('diagnosis-text-v2'),
      );
      expect((await other.json()).data.value).toBe('其他账号的文本');
      expect(await admin`select id from jobs where source_id=${ids.source}::uuid`).toHaveLength(1);
    });
    it('persists published question favorites across API reloads, isolates owners and cancels only the current owner', async () => {
      const context = (id: string) => ({
        params: Promise.resolve({ type: 'question', targetId: id }),
      });
      const again = await favorite(
        req('favorites/question/' + ids.question, 'PUT'),
        context(ids.question),
      );
      expect(again.status).toBe(200);
      const result = await again.json();
      expect(result.data).toMatchObject({
        targetType: 'question',
        targetId: ids.question,
        unavailable: false,
        target: {
          type: 'question',
          title: '真实收藏题目',
          href: '/questions?preview=question:' + ids.question,
        },
      });
      const loaded = await listFavorites(req('favorites?type=question'));
      expect((await loaded.json()).data.map((row: { targetId: string }) => row.targetId)).toEqual([
        ids.question,
      ]);
      expect(
        (
          await favorite(
            req('favorites/question/' + ids.draftQuestion, 'PUT'),
            context(ids.draftQuestion),
          )
        ).status,
      ).toBe(404);
      expect(
        (await favorite(req('favorites/question/' + randomUUID(), 'PUT'), context(randomUUID())))
          .status,
      ).toBe(404);
      const otherEmpty = await listFavorites(
        req('favorites?type=question', 'GET', undefined, otherToken),
      );
      expect((await otherEmpty.json()).data).toEqual([]);
      expect(
        (
          await favorite(
            req('favorites/question/' + ids.question, 'PUT', undefined, otherToken),
            context(ids.question),
          )
        ).status,
      ).toBe(200);
      expect(
        (
          await unfavorite(
            req('favorites/question/' + ids.question, 'DELETE'),
            context(ids.question),
          )
        ).status,
      ).toBe(204);
      expect((await (await listFavorites(req('favorites?type=question'))).json()).data).toEqual([]);
      expect(
        (
          await (
            await listFavorites(req('favorites?type=question', 'GET', undefined, otherToken))
          ).json()
        ).data,
      ).toHaveLength(1);
    });
    it('pages every question favorite exactly once at PostgreSQL microsecond precision', async () => {
      for (const [index, question] of [ids.question, ids.question2, ids.question3].entries()) {
        await favorite(req('favorites/question/' + question, 'PUT'), {
          params: Promise.resolve({ type: 'question', targetId: question }),
        });
        const at = `2030-01-01T00:00:00.00000${index + 1}Z`;
        await admin`update favorites set created_at=${at}::text::timestamptz where user_id=${ids.owner}::uuid and question_id=${question}::uuid`;
      }
      const seen: string[] = [];
      let cursor: string | null = null;
      for (let page = 0; page < 5; page++) {
        const response = await listFavorites(
          req(
            'favorites?type=question&limit=1' +
              (cursor ? '&cursor=' + encodeURIComponent(cursor) : '&includeTotal=true'),
          ),
        );
        const payload = await response.json();
        expect(response.status, JSON.stringify(payload)).toBe(200);
        seen.push(...payload.data.map((row: { targetId: string }) => row.targetId));
        cursor = payload.page.nextCursor;
        if (page === 0) {
          expect(payload.meta.total).toBe(3);
          expect(JSON.parse(Buffer.from(cursor!, 'base64url').toString()).sort).toBe(
            '2030-01-01T00:00:00.000003Z',
          );
        }
        if (!cursor) break;
      }
      expect(seen).toEqual([ids.question3, ids.question2, ids.question]);
      expect(new Set(seen).size).toBe(3);
    });
  },
);
