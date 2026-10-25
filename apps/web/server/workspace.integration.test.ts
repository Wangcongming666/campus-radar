/** Explicit opt-in: API_INTEGRATION_DATABASE_URL=owner URL, DATABASE_URL=campus_web URL.
 * Both URLs must target the same disposable database migrated through 0007. No external services.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import postgres from 'postgres';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { seal, sessionCsrf } from './auth';
import { hash } from './http';
import { GET as getWorkspace } from '../app/api/v1/workspace/route';
import { GET as exportAccount } from '../app/api/v1/workspace/export/route';
import { POST as restoreAccount } from '../app/api/v1/workspace/import/route';
import { POST as resetAccount } from '../app/api/v1/workspace/reset/route';
import { GET as getRecord, PUT as putRecord } from '../app/api/v1/workspace/records/[key]/route';
import { GET as getFiles } from '../app/api/v1/files/route';
import {
  GET as getFile,
  PUT as putFile,
  DELETE as deleteFile,
} from '../app/api/v1/files/[id]/route';
const enabled = !!process.env.API_INTEGRATION_DATABASE_URL;
const origin = 'http://localhost:3000';
const fixture = {
  user: randomUUID(),
  otherUser: randomUUID(),
  company: randomUUID(),
  source: randomUUID(),
  job: randomUUID(),
  application: randomUUID(),
  otherApplication: randomUUID(),
  question: randomUUID(),
};
const token = randomBytes(32).toString('base64url'),
  otherToken = randomBytes(32).toString('base64url');
let admin: ReturnType<typeof postgres>;
let fileRoot = '';
const context = (key: string) => ({ params: Promise.resolve({ key, id: key }) });
function req(path: string, method = 'GET', value?: unknown, sessionToken = token): Request {
  return new Request(origin + path, {
    method,
    headers: {
      Origin: origin,
      Cookie: 'campus_session=' + sessionToken,
      'X-CSRF-Token': sessionCsrf(hash(sessionToken)),
      ...(value instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
    },
    body:
      value === undefined ? undefined : value instanceof FormData ? value : JSON.stringify(value),
  });
}
async function put(key: string, value: unknown, expectedVersion = 0, sessionToken = token) {
  return putRecord(
    req(
      '/api/v1/workspace/records/' + encodeURIComponent(key),
      'PUT',
      { value, expectedVersion },
      sessionToken,
    ),
    context(key),
  );
}
const practiceConfig = {
  role: '前端开发',
  company: '通用风格',
  round: '技术一面',
  level: '标准难度',
  minutes: 15,
};
const practice = {
  id: 'practice-1',
  config: practiceConfig,
  questions: [{ id: fixture.question, title: '测试题', reference: '参考答案', keywords: ['概念'] }],
  answers: ['测试回答'],
  index: 0,
  elapsed: 30,
  startedAt: null,
  createdAt: '2026-10-24T01:00:00Z',
};
const analysis = {
  score: 50,
  matched: ['概念'],
  suggestions: ['增加例子'],
  excerpt: '测试回答',
  coverage: 50,
  structure: 50,
  evidence: 50,
  completeness: 50,
};
function values(): Record<string, unknown> {
  return {
    'resume-library-v2': [
      {
        id: 'resume-text-1',
        name: '真实文本简历',
        fileName: 'resume.txt',
        mime: 'text/plain',
        size: 0,
        text: '用户输入的简历内容',
        role: '前端',
        createdAt: '2026-10-24T01:00:00Z',
        version: 1,
        default: true,
        applicationIds: [fixture.application],
      },
    ],
    'subscriptions-v2': [
      {
        id: 'sub-1',
        name: '我的订阅',
        role: '前端',
        city: '上海',
        company: fixture.company,
        type: '校招',
        education: '本科',
        keyword: 'React',
        frequency: '每日汇总',
        enabled: true,
        channels: ['站内'],
        hits: [{ jobId: fixture.job, date: '2026-10-24', read: false }],
      },
    ],
    'referral-records-v2': [
      {
        id: 'ref-1',
        title: '内推申请',
        companyId: fixture.company,
        contact: '本人邮箱',
        stage: '已申请',
        date: '2026-10-24',
        note: '记录',
      },
    ],
    events: [
      {
        id: 1,
        date: '2026-10-24',
        time: '10:00',
        title: '真实面试',
        companyId: fixture.company,
        type: '面试',
        duration: '60',
        applicationId: fixture.application,
        completed: false,
      },
    ],
    'planner-milestones-v2': [{ id: 'milestone-1', title: '完成准备', date: '2026-10-30' }],
    'planner-tasks-v2': [
      {
        id: 'task-1',
        title: '复习',
        milestoneId: 'milestone-1',
        status: '待开始',
        date: '2026-10-25',
        remind: true,
      },
    ],
    'planner-reminded-v2': { 'task-1': '2026-10-25' },
    'offers-v2': [
      {
        id: 'offer-1',
        company: '真实公司',
        title: '前端工程师',
        city: '上海',
        base: 20,
        months: 12,
        bonus: 0,
        deadline: '2026-11-01',
        note: '我的offer',
        scores: { growth: 80 },
      },
    ],
    'offer-dimensions-v2': [{ id: 'growth', name: '成长', weight: 100 }],
    'salary-samples-v2': [
      {
        id: 'salary-1',
        companyId: fixture.company,
        role: '前端',
        city: '上海',
        base: 20,
        months: 12,
        bonus: 0,
        year: '2026',
        level: '本科',
        source: '本人经历',
        note: '用户自报',
      },
    ],
    [`interview-rounds-v2-${fixture.application}`]: [
      {
        id: 'round-1',
        title: '技术一面',
        date: '2026-10-24T10:00',
        status: '已完成',
        mode: '线上视频',
        questions: '测试问题',
        note: '面试记录',
      },
    ],
    [`interview-review-v2-${fixture.application}-round-1`]: {
      transcript: '我与面试官的对话',
      note: '我的复盘',
      selfScore: 3,
      analysis,
    },
    'mock-config-v2': practiceConfig,
    'mock-draft-v2': practice,
    'mock-reports-v2': [
      { ...practice, completedAt: '2026-10-24T01:01:00Z', analyses: [analysis], score: 50 },
    ],
    'knowledge-experiences': [
      {
        id: 'local-exp-integration',
        companyId: fixture.company,
        title: '我的面试经历',
        role: '前端',
        round: '一面',
        author: '伪造作者会被纠正',
        avatar: '伪',
        date: '2026-10-24',
        readTime: '1分钟',
        tags: ['React'],
        views: 0,
        likes: 0,
        excerpt: '我的经历',
        sections: [{ title: '面试', content: '这是本人撰写的完整经历' }],
      },
    ],
    'knowledge-draft-new': {
      title: '草稿',
      content: '未发布的个人内容',
      companyId: fixture.company,
      role: '前端',
      round: '一面',
      tags: 'React',
    },
    'discussion-local-exp-integration': [{ id: 'comment-1', name: '本人', content: '我的评论' }],
    'knowledge-learning': {
      mastery: { [fixture.question]: '学习中' },
      wrong: [fixture.question],
      attempts: { [fixture.question]: 1 },
    },
    'knowledge-collections': [
      {
        id: 'collection-1',
        title: '我的题单',
        questionIds: [fixture.question],
        source: '手动选择',
      },
    ],
    'knowledge-answers': { [fixture.question]: '我的答案' },
    'experience-summaries': { 'local-exp-integration': '我的摘要' },
    'experience-likes': ['local-exp-integration'],
    'handbook-notes': { 'chapter-1': '我的笔记' },
    'handbook-templates': { 'template-1': '我的模板' },
    posts: [
      {
        id: 1,
        name: '本人',
        avatar: '本',
        time: '刚刚',
        body: '我的动态',
        tag: '校招',
        likes: 0,
        liked: false,
        mine: true,
      },
    ],
    'community-draft': { body: '尚未发表的动态', tag: '校招' },
    'community-reports': { 'post-1': { reason: '举报原因', date: '2026-10-24' } },
    'buddy-requests': [1],
    'signals-saved': [1],
    'community-rooms': [
      {
        id: 'room-1',
        title: '准备小组',
        role: '前端',
        schedule: '周六',
        capacity: 4,
        members: 1,
        joined: true,
        mine: true,
        questionIds: [fixture.question],
        notes: [{ id: 'note-1', content: '准备记录' }],
      },
    ],
    [`company-notes-v2-${fixture.company}`]: [
      {
        id: 'note-1',
        category: '业务',
        title: '个人公司笔记',
        team: '团队',
        role: '前端',
        date: '2026-10-24',
        rating: 4,
        body: '本人笔记',
        tags: 'React',
        hidden: false,
      },
    ],
    [`company-results-v2-${fixture.company}`]: [
      {
        id: 'result-1',
        date: '2026-10-24',
        title: '一面',
        role: '前端',
        result: '通过',
        note: '等待下一轮',
      },
    ],
    [`company-checklist-v2-${fixture.company}`]: ['了解业务'],
    'diagnosis-text-v2': '我输入的简历',
    'diagnosis-target-v2': fixture.job,
    'radar-core-notes': { 'chapter-1': '私有笔记' },
    'radar-core-completed': ['chapter-1'],
    'radar-core-notifications': [
      {
        id: 'notification-1',
        title: '面试提醒',
        content: '10点面试',
        category: '面试提醒',
        href: '/calendar',
        action: '查看',
        date: '刚刚',
      },
    ],
    'onboarding-draft-v2': null,
  };
}

describe.skipIf(!enabled)('PostgreSQL workspace resources and private disk files', () => {
  beforeAll(async () => {
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('AUTH_PROVIDER', 'local');
    vi.stubEnv('NEXT_PUBLIC_DATA_MODE', 'api');
    vi.stubEnv('APP_ORIGIN', origin);
    vi.stubEnv('SESSION_ENCRYPTION_KEY', Buffer.alloc(32, 23).toString('base64'));
    fileRoot = await mkdtemp(join(tmpdir(), 'campus-workspace-test-'));
    vi.stubEnv('PRIVATE_FILE_ROOT', fileRoot);
    admin = postgres(process.env.API_INTEGRATION_DATABASE_URL!, { max: 1 });
    await admin`insert into companies(id,slug,name) values(${fixture.company}::uuid,${'workspace-' + fixture.company},'Workspace integration fixture')`;
    await admin`insert into sources(id,name,base_url,allowed_hosts,company_id) values(${fixture.source}::uuid,'Workspace fixture','https://example.invalid',array['example.invalid'],${fixture.company}::uuid)`;
    await admin`insert into jobs(id,company_id,source_id,canonical_url,title,role,recruitment_type,description_md,published_at,last_seen_at,verified_at,status,content_hash) values(${fixture.job}::uuid,${fixture.company}::uuid,${fixture.source}::uuid,'https://example.invalid/workspace','Workspace job','frontend','campus','Local fixture',now(),now(),null,'open','test')`;
    for (const [userId, sessionToken] of [
      [fixture.user, token],
      [fixture.otherUser, otherToken],
    ])
      await admin`select app.create_auth_session(${userId}::uuid,'真实测试账号',${seal({ provider: 'local', email: 'fixture@example.invalid', userId })},${hash(sessionToken)},now()+interval '1 day')`;
    await admin`insert into applications(id,user_id,job_id) values(${fixture.application}::uuid,${fixture.user}::uuid,${fixture.job}::uuid),(${fixture.otherApplication}::uuid,${fixture.otherUser}::uuid,${fixture.job}::uuid)`;
  });
  afterAll(async () => {
    if (admin) {
      const tables = [
        'resume_applications',
        'subscription_hits',
        'mock_answers',
        'collection_questions',
        'room_questions',
        'room_notes',
        'team_members',
        'interview_reviews',
        'interview_rounds',
        'plan_tasks',
        'plan_milestones',
        'resumes',
        'subscriptions',
        'referral_requests',
        'calendar_events',
        'plan_reminders',
        'offers',
        'offer_comparisons',
        'salary_reports',
        'mock_sessions',
        'experience_drafts',
        'question_progress',
        'practice_collections',
        'question_answers',
        'experience_comments',
        'experience_summaries',
        'experience_reactions',
        'handbook_notes',
        'handbook_templates',
        'post_comments',
        'posts',
        'content_reports',
        'buddy_requests',
        'radar_signal_saves',
        'team_rooms',
        'notifications',
        'company_notes',
        'company_results',
        'company_checklists',
        'workspace_settings',
        'workspace_revisions',
        'private_files',
      ];
      for (const table of tables)
        await admin`delete from ${admin(table)} where user_id in (${fixture.user}::uuid,${fixture.otherUser}::uuid)`;
      await admin`delete from experiences where author_id in (${fixture.user}::uuid,${fixture.otherUser}::uuid)`;
      await admin`delete from applications where user_id in (${fixture.user}::uuid,${fixture.otherUser}::uuid)`;
      await admin`delete from auth_sessions where user_id in (${fixture.user}::uuid,${fixture.otherUser}::uuid)`;
      await admin`delete from users where id in (${fixture.user}::uuid,${fixture.otherUser}::uuid)`;
      await admin`delete from jobs where id=${fixture.job}::uuid`;
      await admin`delete from sources where id=${fixture.source}::uuid`;
      await admin`delete from companies where id=${fixture.company}::uuid`;
      await admin.end();
    }
    if (fileRoot) await rm(fileRoot, { recursive: true, force: true });
    vi.unstubAllEnvs();
  });
  it('round-trips each collection as independent owned PostgreSQL resource rows', async () => {
    for (const [key, value] of Object.entries(values())) {
      const response = await put(key, value);
      const payload = await response.json();
      expect(response.status, `${key}: ${JSON.stringify(payload)}`).toBe(200);
      expect(payload.data.version).toBe(1);
      const loaded = await getRecord(
        req('/api/v1/workspace/records/' + encodeURIComponent(key)),
        context(key),
      );
      expect(await loaded.json()).toEqual(payload);
    }
    const result = await (await getWorkspace(req('/api/v1/workspace'))).json();
    expect(Object.keys(result.data.records)).toHaveLength(Object.keys(values()).length);
    const savedExperience = result.data.records['knowledge-experiences'].value[0];
    expect(savedExperience.id).toMatch(/^[a-f\d-]{36}$/);
    expect(savedExperience.author).toBe('真实测试账号');
    const secondSave = await put(
      'knowledge-experiences',
      [{ ...savedExperience, title: '更新原面经' }],
      1,
    );
    expect(secondSave.status).toBe(200);
    expect(
      await admin`select id from experiences where author_id=${fixture.user}::uuid`,
    ).toHaveLength(1);
    expect(
      (await admin`select base_monthly_minor from offers where user_id=${fixture.user}::uuid`)[0]
        .base_monthly_minor,
    ).toBe('2000000');
    expect(
      await admin`select * from mock_answers where user_id=${fixture.user}::uuid`,
    ).toHaveLength(2);
    expect(
      await admin`select * from collection_questions where user_id=${fixture.user}::uuid`,
    ).toHaveLength(1);
  });
  it('isolates reads, enforces foreign ownership, and rejects stale or concurrent writes', async () => {
    expect(
      await (await getWorkspace(req('/api/v1/workspace', 'GET', undefined, otherToken))).json(),
    ).toEqual({ data: { records: {} } });
    const missing = await getRecord(
      req('/api/v1/workspace/records/diagnosis-text-v2', 'GET', undefined, otherToken),
      context('diagnosis-text-v2'),
    );
    expect(await missing.json()).toEqual({ data: { value: null, version: 0 } });
    expect((await put(`interview-rounds-v2-${fixture.otherApplication}`, [])).status).toBe(404);
    expect(
      (
        await put(
          'events',
          [
            {
              id: 2,
              date: '2026-10-24',
              time: '10:00',
              title: '非法关联',
              companyId: fixture.company,
              type: '面试',
              duration: '60',
              applicationId: fixture.otherApplication,
            },
          ],
          1,
        )
      ).status,
    ).toBe(404);
    const competing = await Promise.all([
      put('diagnosis-text-v2', '第一请求', 1),
      put('diagnosis-text-v2', '第二请求', 1),
    ]);
    expect(competing.map((r) => r.status).sort()).toEqual([200, 409]);
    expect((await put('diagnosis-text-v2', '旧版本', 1)).status).toBe(409);
    const current = await (
      await getRecord(
        req('/api/v1/workspace/records/diagnosis-text-v2'),
        context('diagnosis-text-v2'),
      )
    ).json();
    expect(current.data.version).toBe(2);
    expect(current.data.value).not.toBe('旧版本');
    const noCsrf = new Request(origin + '/api/v1/workspace/records/diagnosis-text-v2', {
      method: 'PUT',
      headers: {
        Origin: origin,
        Cookie: 'campus_session=' + token,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ value: 'forged', expectedVersion: 2 }),
    });
    expect((await putRecord(noCsrf, context('diagnosis-text-v2'))).status).toBe(403);
  });
  it('uses a restricted campus_web role with forced RLS even for direct SQL', async () => {
    const web = postgres(process.env.DATABASE_URL!, { max: 1 });
    try {
      const [role] =
        await web`select pg_has_role(current_user,'campus_web','MEMBER') as web_member, rolsuper, rolbypassrls from pg_roles where rolname=current_user`;
      expect(role).toMatchObject({ web_member: true, rolsuper: false, rolbypassrls: false });
      await web.begin(async (sql) => {
        await sql`select set_config('app.user_id',${fixture.otherUser},true)`;
        expect(await sql`select * from resumes where user_id=${fixture.user}::uuid`).toHaveLength(
          0,
        );
        expect(
          await sql`select * from workspace_settings where user_id=${fixture.user}::uuid`,
        ).toHaveLength(0);
      });
    } finally {
      await web.end();
    }
  });
  it('persists actual experience/community UI discussions, refuses foreign posts and restores their typed relationships', async () => {
    const [original] =
      await admin`select id from experiences where author_id=${fixture.user}::uuid and client_key='local-exp-integration'`;
    const experienceKey = `discussion-experience-${original.id}`;
    const experienceComments = [
      { id: 'actual-exp-comment', name: '本人', content: '实际面经页面讨论' },
    ];
    const experienceResponse = await put(experienceKey, experienceComments);
    expect(experienceResponse.status, JSON.stringify(await experienceResponse.json())).toBe(200);
    expect(
      (
        await admin`select experience_id from experience_comments where workspace_key=${experienceKey}`
      )[0].experience_id,
    ).toBe(original.id);
    const legacy = await getRecord(
      req('/api/v1/workspace/records/discussion-local-exp-integration'),
      context('discussion-local-exp-integration'),
    );
    expect((await legacy.json()).data.value[0].content).toBe('我的评论');

    const communityKey = 'discussion-community-1';
    const communityComments = [
      { id: 'actual-post-comment', name: '本人', content: '实际社区页面讨论' },
    ];
    const communityResponse = await put(communityKey, communityComments);
    expect(communityResponse.status, JSON.stringify(await communityResponse.json())).toBe(200);
    const otherPost = { ...(values().posts as Record<string, unknown>[])[0], id: 2 };
    expect((await put('posts', [otherPost], 0, otherToken)).status).toBe(200);
    expect(
      (
        await put(
          'discussion-community-2',
          [{ id: 'other-comment', name: '他人', content: '其他账号的私有讨论' }],
          0,
          otherToken,
        )
      ).status,
    ).toBe(200);
    expect((await put('discussion-community-2', communityComments)).status).toBe(404);
    const otherRead = await getRecord(
      req('/api/v1/workspace/records/' + communityKey, 'GET', undefined, otherToken),
      context(communityKey),
    );
    expect(otherRead.status).toBe(404);
    const [foreignPost] =
      await admin`select id from posts where user_id=${fixture.otherUser}::uuid and client_key='2'`;
    const web = postgres(process.env.DATABASE_URL!, { max: 1 });
    try {
      await expect(
        web.begin(async (sql) => {
          await sql`select set_config('app.user_id',${fixture.user},true)`;
          expect(
            await sql`select id from post_comments where user_id=${fixture.otherUser}::uuid`,
          ).toHaveLength(0);
          await sql`insert into post_comments(user_id,workspace_key,client_key,ui_payload,post_id,body) values(${fixture.user}::uuid,'discussion-community-2','forged',${sql.json({})},${foreignPost.id}::uuid,'不能挂到别人的动态')`;
        }),
      ).rejects.toMatchObject({ code: '23503' });
    } finally {
      await web.end();
    }

    const backupResponse = await exportAccount(req('/api/v1/workspace/export'));
    const backupResult = await backupResponse.json();
    expect(backupResponse.status, JSON.stringify(backupResult)).toBe(200);
    const backup = backupResult.data;
    expect(JSON.stringify(backup)).not.toContain('其他账号的私有讨论');
    const reset = await resetAccount(
      req('/api/v1/workspace/reset', 'POST', {
        expectedVersion: backup.stateVersion,
        confirm: 'RESET',
      }),
    );
    expect(reset.status, JSON.stringify(await reset.json())).toBe(200);
    expect(
      await admin`select id from post_comments where user_id=${fixture.user}::uuid`,
    ).toHaveLength(0);
    expect(await admin`select id from posts where user_id=${fixture.otherUser}::uuid`).toHaveLength(
      1,
    );
    expect(
      await admin`select id from post_comments where user_id=${fixture.otherUser}::uuid`,
    ).toHaveLength(1);
    const emptyResponse = await exportAccount(req('/api/v1/workspace/export'));
    const empty = (await emptyResponse.json()).data;
    const restored = await restoreAccount(
      req('/api/v1/workspace/import', 'POST', {
        backup,
        expectedVersion: empty.stateVersion,
        confirm: 'RESTORE',
      }),
    );
    expect(restored.status, JSON.stringify(await restored.json())).toBe(200);
    for (const [key, expected] of [
      [experienceKey, experienceComments],
      [communityKey, communityComments],
    ] as const) {
      const loaded = await getRecord(req('/api/v1/workspace/records/' + key), context(key));
      expect((await loaded.json()).data.value).toEqual(expected);
    }
    const linked =
      await admin`select c.body,p.client_key from post_comments c join posts p on p.id=c.post_id and p.user_id=c.user_id where c.user_id=${fixture.user}::uuid`;
    expect(linked).toMatchObject([{ body: '实际社区页面讨论', client_key: '1' }]);
    const restoredPosts = await getRecord(req('/api/v1/workspace/records/posts'), context('posts'));
    expect((await put('posts', [], (await restoredPosts.json()).data.version)).status).toBe(200);
    expect(
      await admin`select id from post_comments where user_id=${fixture.user}::uuid`,
    ).toHaveLength(0);
    const afterDelete = await getWorkspace(req('/api/v1/workspace'));
    expect(afterDelete.status).toBe(200);
    expect((await afterDelete.json()).data.records).not.toHaveProperty(communityKey);
  });
  it('uploads real private bytes, hides files from other users, and rejects traversal and MIME spoofing', async () => {
    const form = new FormData();
    form.set('file', new File(['中文简历原件'], '简历.txt', { type: 'text/plain' }));
    form.set('name', '简历.txt');
    const upload = await putFile(
      req('/api/v1/files/resume-file', 'PUT', form),
      context('resume-file'),
    );
    expect(upload.status).toBe(200);
    const info = (await upload.json()).data;
    expect(info).toMatchObject({
      id: 'resume-file',
      name: '简历.txt',
      type: 'text/plain',
      size: Buffer.byteLength('中文简历原件'),
    });
    const download = await getFile(req('/api/v1/files/resume-file'), context('resume-file'));
    expect(await download.text()).toBe('中文简历原件');
    expect(download.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(download.headers.get('Content-Disposition')).toContain('attachment;');
    expect(download.headers.get('X-File-Name')).toBe(encodeURIComponent('简历.txt'));
    expect(
      (
        await getFile(
          req('/api/v1/files/resume-file', 'GET', undefined, otherToken),
          context('resume-file'),
        )
      ).status,
    ).toBe(404);
    expect((await getFiles(req('/api/v1/files', 'GET', undefined, otherToken))).status).toBe(200);
    expect(
      (await (await getFiles(req('/api/v1/files', 'GET', undefined, otherToken))).json()).data,
    ).toEqual([]);
    expect((await getFile(req('/api/v1/files/x'), context('../outside'))).status).toBe(404);
    const spoof = new FormData();
    spoof.set('file', new File(['not PDF'], 'resume.pdf', { type: 'application/pdf' }));
    expect((await putFile(req('/api/v1/files/spoof', 'PUT', spoof), context('spoof'))).status).toBe(
      422,
    );
    const large = new FormData();
    large.set(
      'file',
      new File([new Uint8Array(10 * 1024 * 1024 + 1)], 'large.txt', { type: 'text/plain' }),
    );
    expect((await putFile(req('/api/v1/files/large', 'PUT', large), context('large'))).status).toBe(
      413,
    );
    const paths = await readdir(fileRoot);
    expect(paths).toHaveLength(1);
    expect(paths[0]).toMatch(/^[a-f\d]{64}$/);
    expect(
      (
        await deleteFile(
          req('/api/v1/files/resume-file', 'DELETE', undefined, otherToken),
          context('resume-file'),
        )
      ).status,
    ).toBe(204);
    expect((await getFile(req('/api/v1/files/resume-file'), context('resume-file'))).status).toBe(
      200,
    );
    expect(
      (await deleteFile(req('/api/v1/files/resume-file', 'DELETE'), context('resume-file'))).status,
    ).toBe(204);
    expect((await getFile(req('/api/v1/files/resume-file'), context('resume-file'))).status).toBe(
      404,
    );
    expect(await readdir(fileRoot)).toEqual([]);
  });
});
