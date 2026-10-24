import { questions } from './data';

export type PracticeConfig = {
  role: string;
  company: string;
  round: string;
  level: string;
  minutes: number;
};
export type PracticeQuestion = { id: string; title: string; reference: string; keywords: string[] };
export type AnswerAnalysis = {
  score: number;
  matched: string[];
  suggestions: string[];
  excerpt: string;
  coverage: number;
  structure: number;
  evidence: number;
  completeness: number;
};
export type PracticeDraft = {
  id: string;
  config: PracticeConfig;
  questions: PracticeQuestion[];
  answers: string[];
  index: number;
  elapsed: number;
  startedAt: number | null;
  createdAt: string;
};
export type PracticeReport = PracticeDraft & {
  completedAt: string;
  analyses: AnswerAnalysis[];
  score: number;
};
export type InterviewRound = {
  id: string;
  title: string;
  date: string;
  status: string;
  mode: string;
  questions: string;
  note: string;
};
export type InterviewReview = {
  transcript: string;
  note: string;
  selfScore: number;
  audioId?: string;
  audioName?: string;
  analysis?: AnswerAnalysis;
  analyzedText?: string;
  savedAt?: string;
};

const keywords = [
  ['调用栈', '微任务', '渲染'],
  ['Fiber', '调度', 'commit'],
  ['缓存', 'ETag', '304'],
  ['计时器', '取消', '参数'],
  ['测量', '虚拟', '分页'],
  ['索引', 'B+', '执行计划'],
  ['背景', '任务', '行动', '结果'],
  ['unknown', 'any', '收窄'],
];
const bank = questions.map((q, i) => ({
  id: q.id,
  title: q.title,
  reference: q.answer,
  keywords: keywords[i],
}));
const extra = (
  id: string,
  title: string,
  reference: string,
  terms: string[],
): PracticeQuestion => ({ id, title, reference, keywords: terms });
const backend = [
  bank[5],
  bank[2],
  extra(
    'backend-idempotency',
    '如何避免重复请求造成重复扣款？',
    '区分传输重试和业务重复，用业务幂等键、唯一约束和事务维护结果，再讨论失败重试与监控。',
    ['幂等', '事务', '唯一'],
  ),
  extra(
    'backend-cache',
    '缓存与数据库如何保持一致？',
    '明确一致性要求和失败窗口，分析先更新数据库再删除缓存、重试、过期策略及并发边界。',
    ['缓存', '一致性', '重试'],
  ),
  extra(
    'backend-load',
    '如何定位接口响应变慢？',
    '先采样日志与链路耗时，区分数据库、网络和CPU瓶颈，再用压测与指标验证修复。',
    ['日志', '数据库', '验证'],
  ),
  bank[6],
  bank[3],
];
const product = [
  extra(
    'product-discovery',
    '如何从用户问题定义一项产品需求？',
    '明确用户、场景和问题证据，通过访谈与行为数据验证需求，再定义目标与可观测指标。',
    ['用户', '场景', '指标'],
  ),
  extra(
    'product-priority',
    '需求多而开发资源有限，如何确定优先级？',
    '结合用户价值、业务目标、风险和成本，说明优先级假设、决策过程及验证方式。',
    ['价值', '成本', '验证'],
  ),
  extra(
    'product-metric',
    '一个功能上线后使用率很低，你会怎么做？',
    '先校验埋点与样本，再分解漏斗、访谈用户，找出认知、触达和使用障碍，通过实验验证。',
    ['漏斗', '用户', '实验'],
  ),
  extra(
    'product-test',
    '如何设计一个可靠的 A/B 实验？',
    '定义假设、主指标、护栏指标、随机分流与样本量，明确实验周期和停止规则。',
    ['指标', '样本', '随机'],
  ),
  bank[6],
  bank[2],
  extra(
    'product-team',
    '如何与研发处理产品方案分歧？',
    '把分歧还原为目标和约束，对比方案、成本和证据，明确决策人并记录下一步。',
    ['目标', '约束', '证据'],
  ),
];
const hr = [
  bank[6],
  extra(
    'hr-motivation',
    '为什么选择这个岗位？你希望获得怎样的成长？',
    '结合岗位工作内容、自己的经历和具体成长计划，解释匹配点，不编造企业内部信息。',
    ['岗位', '经历', '成长'],
  ),
  extra(
    'hr-conflict',
    '描述一次团队意见不同的经历，你做了什么？',
    '按背景、任务、行动和结果展开，区分个人贡献与团队成果，并说明反思。',
    ['背景', '行动', '结果'],
  ),
  extra(
    'hr-failure',
    '讲一次没有达到预期的经历。',
    '说明预期、实际结果、原因和改进，给出个人承担的行动与后续验证。',
    ['预期', '原因', '改进'],
  ),
  extra(
    'hr-priority',
    '多个任务同时临近截止，你如何安排？',
    '说明目标与优先级，沟通约束、拆分任务、跟踪风险并及时同步。',
    ['优先级', '沟通', '风险'],
  ),
  bank[6],
  bank[7],
];
const contexts: Record<string, string> = {
  腾讯: '假设你在协作内容产品团队',
  字节跳动: '假设你在短视频内容团队',
  阿里巴巴: '假设你在电商交易团队',
  美团: '假设你在本地生活履约团队',
  通用风格: '结合你熟悉的项目',
};

export function buildPracticeQuestions(config: PracticeConfig): PracticeQuestion[] {
  const pool =
    config.round === 'HR 面试'
      ? hr
      : config.role === '后端开发'
        ? backend
        : config.role === '产品经理'
          ? product
          : [bank[0], bank[1], bank[4], bank[2], bank[3], bank[7], bank[6]];
  const ordered = config.round === '技术二面' ? [...pool.slice(2), ...pool.slice(0, 2)] : pool;
  const challenge =
    config.level === '深度挑战'
      ? '请比较替代方案，说明失败边界和验证方法。'
      : config.level === '基础热身'
        ? '先解释概念，再举一个简单例子。'
        : '请给出原理、应用场景与具体例子。';
  const count = config.minutes >= 45 ? 7 : config.minutes >= 30 ? 5 : 3;
  return ordered.slice(0, count).map((q) => ({
    ...q,
    title: `${q.title}\n${contexts[config.company] ?? contexts['通用风格']}，${challenge}`,
  }));
}

export function analyzeAnswer(answer: string, question: PracticeQuestion): AnswerAnalysis {
  const text = answer.trim();
  const matched = question.keywords.filter((word) =>
    text.toLocaleLowerCase().includes(word.toLocaleLowerCase()),
  );
  if (!text)
    return {
      score: 0,
      matched,
      suggestions: ['本题未作答；先用自己的话解释问题，再给出一个例子。'],
      excerpt: '',
      coverage: 0,
      structure: 0,
      evidence: 0,
      completeness: 0,
    };
  const coverage = Math.round((matched.length / Math.max(1, question.keywords.length)) * 100);
  const structure = Math.min(
    100,
    (text.match(/首先|其次|最后|因为|因此|例如|结论|背景|任务|行动|结果|第一|第二|\n/g)?.length ??
      0) * 25,
  );
  const evidence = Math.min(
    100,
    (text.match(/项目|验证|测量|日志|对比|比较|数据|反馈|实验|\d+[%％毫秒秒个次]/g)?.length ?? 0) *
      25,
  );
  const completeness = Math.min(100, Math.round(text.length / 1.2));
  const missing = question.keywords.filter((word) => !matched.includes(word));
  const suggestions = [
    ...(missing.length
      ? [`可补充并解释：${missing.join('、')}（只检测字面关键词，未判断正确性）。`]
      : ['已覆盖参考关键词，请自行核对解释是否准确。']),
    ...(structure < 50 ? ['增加清晰的因果或分步表达，例如「首先 → 因为 → 结果」。'] : []),
    ...(evidence < 50 ? ['补充一个真实场景、验证方法和可核实的结果，避免虚构数字。'] : []),
    ...(text.length < 40 ? ['当前回答较短，可展开原理和适用边界。'] : []),
  ];
  return {
    score: Math.round(coverage * 0.5 + structure * 0.2 + evidence * 0.2 + completeness * 0.1),
    matched,
    suggestions,
    excerpt: text.slice(0, 160),
    coverage,
    structure,
    evidence,
    completeness,
  };
}

export function elapsedPracticeSeconds(elapsed: number, startedAt: number | null, now: number) {
  return (
    Math.max(0, elapsed) +
    (startedAt === null ? 0 : Math.max(0, Math.floor((now - startedAt) / 1000)))
  );
}

export function completePractice(draft: PracticeDraft, now: number): PracticeReport {
  const analyses = draft.questions.map((question, index) =>
    analyzeAnswer(draft.answers[index] ?? '', question),
  );
  return {
    ...draft,
    elapsed: elapsedPracticeSeconds(draft.elapsed, draft.startedAt, now),
    startedAt: null,
    completedAt: new Date(now).toISOString(),
    analyses,
    score: Math.round(analyses.reduce((sum, x) => sum + x.score, 0) / Math.max(1, analyses.length)),
  };
}

const record = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);
export function isPracticeConfig(value: unknown): value is PracticeConfig {
  return (
    record(value) &&
    ['前端开发', '后端开发', '产品经理'].includes(String(value.role)) &&
    ['腾讯', '字节跳动', '阿里巴巴', '美团', '通用风格'].includes(String(value.company)) &&
    ['技术一面', '技术二面', 'HR 面试'].includes(String(value.round)) &&
    ['基础热身', '标准难度', '深度挑战'].includes(String(value.level)) &&
    typeof value.minutes === 'number' &&
    [15, 30, 45].includes(value.minutes)
  );
}
export function isPracticeDraft(value: unknown): value is PracticeDraft {
  return (
    record(value) &&
    typeof value.id === 'string' &&
    typeof value.createdAt === 'string' &&
    isPracticeConfig(value.config) &&
    Array.isArray(value.answers) &&
    value.answers.every((x) => typeof x === 'string') &&
    Array.isArray(value.questions) &&
    value.questions.length > 0 &&
    value.questions.every(
      (q) =>
        record(q) &&
        typeof q.id === 'string' &&
        typeof q.title === 'string' &&
        typeof q.reference === 'string' &&
        Array.isArray(q.keywords) &&
        q.keywords.every((k) => typeof k === 'string'),
    ) &&
    value.answers.length === value.questions.length &&
    typeof value.index === 'number' &&
    Number.isInteger(value.index) &&
    value.index >= 0 &&
    value.index < value.questions.length &&
    typeof value.elapsed === 'number' &&
    Number.isFinite(value.elapsed) &&
    value.elapsed >= 0 &&
    (value.startedAt === null ||
      (typeof value.startedAt === 'number' && Number.isFinite(value.startedAt)))
  );
}
export function isDraftOrNull(value: unknown): value is PracticeDraft | null {
  return value === null || isPracticeDraft(value);
}
export function isAnswerAnalysis(value: unknown): value is AnswerAnalysis {
  return (
    record(value) &&
    ['score', 'coverage', 'structure', 'evidence', 'completeness'].every(
      (key) => typeof value[key] === 'number' && Number.isFinite(value[key]),
    ) &&
    typeof value.excerpt === 'string' &&
    Array.isArray(value.matched) &&
    value.matched.every((x) => typeof x === 'string') &&
    Array.isArray(value.suggestions) &&
    value.suggestions.every((x) => typeof x === 'string')
  );
}
export function isPracticeReports(value: unknown): value is PracticeReport[] {
  return (
    Array.isArray(value) &&
    value.every((item) => {
      if (
        !record(item) ||
        typeof item.completedAt !== 'string' ||
        typeof item.score !== 'number' ||
        !Array.isArray(item.analyses) ||
        !item.analyses.every(isAnswerAnalysis)
      )
        return false;
      const count = item.analyses.length;
      return isPracticeDraft(item) && count === item.questions.length;
    })
  );
}
export function isInterviewRounds(value: unknown): value is InterviewRound[] {
  return (
    Array.isArray(value) &&
    value.every(
      (item) =>
        record(item) &&
        ['id', 'title', 'date', 'status', 'mode', 'questions', 'note'].every(
          (key) => typeof item[key] === 'string',
        ),
    )
  );
}
export function isInterviewReview(value: unknown): value is InterviewReview {
  return (
    record(value) &&
    typeof value.transcript === 'string' &&
    typeof value.note === 'string' &&
    typeof value.selfScore === 'number' &&
    Number.isInteger(value.selfScore) &&
    value.selfScore >= 1 &&
    value.selfScore <= 5 &&
    (value.analysis === undefined || isAnswerAnalysis(value.analysis)) &&
    (value.audioId === undefined || typeof value.audioId === 'string') &&
    (value.audioName === undefined || typeof value.audioName === 'string')
  );
}
