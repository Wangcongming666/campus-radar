import { z } from 'zod';
import { ApiError } from './http';

const text = z.string().max(10_000);
const short = z.string().max(300);
const key = z
  .string()
  .min(1)
  .max(160)
  .regex(/^[\p{L}\p{N}_.:@/-]+$/u);
const date = z.string().max(100);
const ids = z.array(key).max(3000);
const dictionary = z.record(key, text).refine((v) => Object.keys(v).length <= 3000);
const boundedArray = (schema: z.ZodType) =>
  z
    .array(schema)
    .max(1000)
    .superRefine((items, ctx) => {
      const seen = new Set<string>();
      items.forEach((item, index) => {
        if (item && typeof item === 'object' && 'id' in item) {
          const id = String(item.id);
          if (seen.has(id))
            ctx.addIssue({ code: 'custom', message: '记录 ID 重复', path: [index, 'id'] });
          seen.add(id);
        }
      });
    });
const scores = z
  .record(key, z.number().finite().min(0).max(100))
  .refine((v) => Object.keys(v).length <= 40);
const money = {
  base: z.number().positive().max(500),
  months: z.number().min(1).max(36),
  bonus: z.number().min(0).max(10000),
};
const analysis = z
  .object({
    score: z.number().min(0).max(100),
    matched: z.array(short).max(100),
    suggestions: z.array(text).max(100),
    excerpt: text,
    coverage: z.number().min(0).max(100),
    structure: z.number().min(0).max(100),
    evidence: z.number().min(0).max(100),
    completeness: z.number().min(0).max(100),
  })
  .strict();
const config = z
  .object({
    role: z.enum(['前端开发', '后端开发', '产品经理']),
    company: z.enum(['腾讯', '字节跳动', '阿里巴巴', '美团', '通用风格']),
    round: z.enum(['技术一面', '技术二面', 'HR 面试']),
    level: z.enum(['基础热身', '标准难度', '深度挑战']),
    minutes: z.union([z.literal(15), z.literal(30), z.literal(45)]),
  })
  .strict();
const practiceFields = {
  id: key,
  config,
  questions: z
    .array(
      z
        .object({ id: key, title: text, reference: text, keywords: z.array(short).max(100) })
        .strict(),
    )
    .min(1)
    .max(30),
  answers: z.array(z.string().max(50_000)).max(30),
  index: z.number().int().min(0).max(29),
  elapsed: z.number().finite().min(0).max(86400),
  startedAt: z.number().finite().min(0).nullable(),
  createdAt: date,
};
const draft = z
  .object(practiceFields)
  .strict()
  .refine((v) => v.questions.length === v.answers.length && v.index < v.questions.length);
const report = z
  .object({
    ...practiceFields,
    completedAt: date,
    analyses: z.array(analysis).max(30),
    score: z.number().min(0).max(100),
  })
  .strict()
  .refine(
    (v) =>
      v.questions.length === v.answers.length &&
      v.questions.length === v.analyses.length &&
      v.index < v.questions.length,
  );
const experienceDraft = z
  .object({
    title: short,
    content: z.string().max(100_000),
    companyId: short,
    role: short,
    round: short,
    tags: short,
  })
  .strict();
const notification = z
  .object({
    id: key,
    title: short,
    content: text,
    category: z.enum(['面试提醒', '岗位动态', '学习提醒', '系统通知']),
    href: z
      .string()
      .max(1000)
      .refine((v) => v.startsWith('/') && !v.startsWith('//') && !/[\\\r\n]/.test(v)),
    action: short,
    date,
  })
  .strict();
const event = z
  .object({
    id: z.number().int().nonnegative(),
    date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .refine((v) => !Number.isNaN(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v),
    time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    title: z.string().min(1).max(160),
    companyId: short,
    type: z.enum(['面试', '笔试', '截止', '其他', '学习']),
    duration: z.string().max(50),
    applicationId: short.optional(),
    location: text.optional(),
    meetingUrl: z
      .string()
      .max(2000)
      .refine((v) => !v || /^https?:\/\//i.test(v))
      .optional(),
    notes: z.string().max(50_000).optional(),
    completed: z.boolean().optional(),
  })
  .strict()
  .refine(
    (v) =>
      v.type === '截止' || (/^\d+$/.test(v.duration) && +v.duration >= 5 && +v.duration <= 480),
  );
export const recordSchemas = {
  resumes: z
    .object({
      id: key,
      name: short,
      fileName: short,
      mime: short,
      size: z
        .number()
        .int()
        .min(0)
        .max(10 * 1024 * 1024),
      text: z.string().max(200_000),
      role: short,
      createdAt: date,
      version: z.number().int().positive(),
      default: z.boolean(),
      applicationIds: ids,
      extractionNote: text.optional(),
      fileId: key.optional(),
    })
    .strict(),
  subscriptions: z
    .object({
      id: key,
      name: short,
      role: short,
      city: short,
      company: short,
      type: short,
      education: short,
      keyword: short,
      frequency: short,
      enabled: z.boolean(),
      channels: z.array(short).max(5),
      hits: z.array(z.object({ jobId: key, date, read: z.boolean() }).strict()).max(1000),
    })
    .strict(),
  referrals: z
    .object({
      id: key,
      title: short,
      companyId: z.string().max(160),
      company: short.optional(),
      contact: short,
      code: z.string().max(200).optional(),
      role: z.string().max(120).optional(),
      stage: short,
      date,
      note: text,
    })
    .strict(),
  milestones: z.object({ id: key, title: short, date }).strict(),
  tasks: z
    .object({
      id: key,
      title: short,
      milestoneId: z.string().max(160),
      status: z.enum(['待开始', '进行中', '已完成']),
      date,
      remind: z.boolean(),
    })
    .strict(),
  offers: z
    .object({
      id: key,
      company: short,
      title: short,
      city: short,
      ...money,
      deadline: date,
      note: text,
      scores,
    })
    .strict(),
  dimensions: z.object({ id: key, name: short, weight: z.number().min(0).max(100) }).strict(),
  salaries: z
    .object({
      id: key,
      companyId: key,
      role: short,
      city: short,
      ...money,
      year: z.string().regex(/^20\d{2}$/),
      level: short,
      source: short,
      note: text,
    })
    .strict(),
  rounds: z
    .object({
      id: key,
      title: short,
      date,
      status: z.enum([
        '未安排',
        '待进行',
        '已完成',
        '已取消',
        'scheduled',
        'completed',
        'cancelled',
      ]),
      mode: short,
      questions: z.string().max(50_000),
      note: z.string().max(50_000),
    })
    .strict(),
  review: z
    .object({
      transcript: z.string().max(200_000),
      note: z.string().max(50_000),
      selfScore: z.number().int().min(1).max(5),
      audioId: key.optional(),
      audioName: short.optional(),
      analysis: analysis.optional(),
      analyzedText: z.string().max(200_000).optional(),
      savedAt: date.optional(),
    })
    .strict(),
  experiences: z
    .object({
      id: key,
      companyId: short,
      title: short,
      role: short,
      round: short,
      author: short,
      avatar: short,
      date,
      readTime: short,
      tags: z.array(short).max(50),
      views: z.number().int().nonnegative(),
      likes: z.number().int().nonnegative(),
      excerpt: text,
      sections: z
        .array(z.object({ title: short, content: z.string().max(50_000) }).strict())
        .max(50),
    })
    .strict(),
  collections: z.object({ id: key, title: short, questionIds: ids, source: short }).strict(),
  comments: z.object({ id: key, parent: key.optional(), name: short, content: text }).strict(),
  posts: z
    .object({
      id: z.number().int().nonnegative(),
      name: short,
      avatar: short,
      time: date,
      body: text,
      tag: short,
      likes: z.number().int().nonnegative(),
      liked: z.boolean(),
      mine: z.boolean().optional(),
    })
    .strict(),
  rooms: z
    .object({
      id: key,
      title: short,
      role: short,
      schedule: short,
      capacity: z.number().int().min(2).max(10),
      members: z.number().int().nonnegative().max(10),
      joined: z.boolean(),
      mine: z.boolean(),
      questionIds: ids,
      notes: z.array(z.object({ id: key, content: text }).strict()).max(500),
    })
    .strict(),
  companyNotes: z
    .object({
      id: key,
      category: short,
      title: short,
      team: short,
      role: short,
      date,
      rating: z.number().min(1).max(5),
      body: text,
      tags: short,
      hidden: z.boolean(),
    })
    .strict(),
  companyResults: z
    .object({ id: key, date, title: short, role: short, result: short, note: text })
    .strict(),
};
export type WorkspaceSpec = {
  table: string;
  schema: z.ZodType;
  shape: 'array' | 'dictionary' | 'scalar' | 'learning';
  applicationId?: string;
  roundKey?: string;
  companyKey?: string;
  experienceKey?: string;
  postKey?: string;
};
const array = (table: string, schema: z.ZodType): WorkspaceSpec => ({
  table,
  schema: boundedArray(schema),
  shape: 'array',
});
const dict = (table: string): WorkspaceSpec => ({ table, schema: dictionary, shape: 'dictionary' });
const scalar = (schema: z.ZodType): WorkspaceSpec => ({
  table: 'workspace_settings',
  schema,
  shape: 'scalar',
});
const fixed: Record<string, WorkspaceSpec> = {
  'resume-library-v2': array('resumes', recordSchemas.resumes),
  'subscriptions-v2': array('subscriptions', recordSchemas.subscriptions),
  'referral-records-v2': array('referral_requests', recordSchemas.referrals),
  events: array('calendar_events', event),
  'planner-milestones-v2': array('plan_milestones', recordSchemas.milestones),
  'planner-tasks-v2': array('plan_tasks', recordSchemas.tasks),
  'planner-reminded-v2': dict('plan_reminders'),
  'offers-v2': array('offers', recordSchemas.offers),
  'offer-dimensions-v2': array('offer_comparisons', recordSchemas.dimensions),
  'salary-samples-v2': array('salary_reports', recordSchemas.salaries),
  'diagnosis-text-v2': scalar(z.string().max(200_000)),
  'diagnosis-target-v2': scalar(short),
  'mock-config-v2': scalar(config),
  'mock-draft-v2': { table: 'mock_sessions', schema: draft.nullable(), shape: 'scalar' },
  'mock-reports-v2': array('mock_sessions', report),
  'knowledge-experiences': array('experiences', recordSchemas.experiences),
  'knowledge-learning': {
    table: 'question_progress',
    schema: z
      .object({
        mastery: z
          .record(key, z.enum(['未学习', '学习中', '已掌握', 'unseen', 'learning', 'mastered']))
          .refine((v) => Object.keys(v).length <= 3000),
        wrong: ids,
        attempts: z
          .record(key, z.number().int().min(0).max(100000))
          .refine((v) => Object.keys(v).length <= 3000),
      })
      .strict(),
    shape: 'learning',
  },
  'knowledge-collections': array('practice_collections', recordSchemas.collections),
  'knowledge-answers': dict('question_answers'),
  'experience-summaries': dict('experience_summaries'),
  'experience-likes': { table: 'experience_reactions', schema: ids, shape: 'array' },
  'handbook-notes': dict('handbook_notes'),
  'handbook-templates': dict('handbook_templates'),
  posts: array('posts', recordSchemas.posts),
  'community-rooms': array('team_rooms', recordSchemas.rooms),
  'community-draft': scalar(z.object({ body: text, tag: short }).strict()),
  'community-reports': {
    table: 'content_reports',
    schema: z
      .record(key, z.object({ reason: short, date }).strict())
      .refine((v) => Object.keys(v).length <= 1000),
    shape: 'dictionary',
  },
  'buddy-requests': {
    table: 'buddy_requests',
    schema: z.array(z.number().int().nonnegative()).max(1000),
    shape: 'array',
  },
  'signals-saved': {
    table: 'radar_signal_saves',
    schema: z.array(z.number().int().nonnegative()).max(1000),
    shape: 'array',
  },
  'radar-core-notes': scalar(
    z.record(key, z.string().max(200_000)).refine((v) => Object.keys(v).length <= 3000),
  ),
  'radar-core-completed': scalar(ids),
  'radar-core-notifications': array('notifications', notification),
  'onboarding-draft-v2': scalar(
    z
      .object({
        step: z.number().int().min(0).max(4),
        name: short,
        school: short,
        degree: short,
        year: short,
        roles: z.array(short).max(30),
        cities: z.array(short).max(30),
        resumeText: z.string().max(200_000),
        resumeId: z.string().max(160),
        fileName: short,
        sampleResume: z.boolean(),
        finished: z.boolean(),
      })
      .strict()
      .nullable(),
  ),
};
export function workspaceSpec(value: string): WorkspaceSpec {
  if (value.length > 240 || value.includes('radar-extended-')) throw invalid();
  if (Object.hasOwn(fixed, value)) return fixed[value];
  let match = /^interview-rounds-v2-([0-9a-f-]{36})$/i.exec(value);
  if (match && z.uuid().safeParse(match[1]).success)
    return { ...array('interview_rounds', recordSchemas.rounds), applicationId: match[1] };
  match = /^interview-review-v2-([0-9a-f-]{36})-([\p{L}\p{N}_.:@/-]{1,160})$/iu.exec(value);
  if (match && z.uuid().safeParse(match[1]).success)
    return {
      table: 'interview_reviews',
      schema: recordSchemas.review.nullable(),
      shape: 'scalar',
      applicationId: match[1],
      roundKey: match[2],
    };
  match =
    /^(company-notes-v2|company-results-v2|company-checklist-v2)-([\p{L}\p{N}_-]{1,160})$/u.exec(
      value,
    );
  if (match)
    return {
      ...(match[1] === 'company-notes-v2'
        ? array('company_notes', recordSchemas.companyNotes)
        : match[1] === 'company-results-v2'
          ? array('company_results', recordSchemas.companyResults)
          : { table: 'company_checklists', schema: ids, shape: 'array' as const }),
      companyKey: match[2],
    };
  if (value.startsWith('discussion-community-')) {
    match = /^discussion-community-([0-9]{1,160})$/.exec(value);
    if (!match) throw invalid();
    return { ...array('post_comments', recordSchemas.comments), postKey: match[1] };
  }
  match = /^discussion-experience-([0-9a-f-]{36})$/i.exec(value);
  if (match && z.uuid().safeParse(match[1]).success)
    return { ...array('experience_comments', recordSchemas.comments), experienceKey: match[1] };
  match = /^(knowledge-draft|discussion)-([\p{L}\p{N}_.:@/-]{1,160})$/u.exec(value);
  if (match)
    return match[1] === 'knowledge-draft'
      ? {
          table: 'experience_drafts',
          schema: experienceDraft,
          shape: 'scalar',
          experienceKey: match[2],
        }
      : { ...array('experience_comments', recordSchemas.comments), experienceKey: match[2] };
  throw invalid();
}
export function validateWorkspaceValue(key: string, value: unknown): unknown {
  const parsed = workspaceSpec(key).schema.safeParse(value);
  if (!parsed.success) throw invalid();
  if (Buffer.byteLength(JSON.stringify(parsed.data), 'utf8') > 900_000)
    throw new ApiError(413, 'PAYLOAD_TOO_LARGE', '记录内容超过限制。');
  return parsed.data;
}
function invalid() {
  return new ApiError(422, 'VALIDATION_ERROR', '工作区记录类型或内容无效。');
}
