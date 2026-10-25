import type { Job } from './data';
import { safeReturnTo } from './api/auth-policy';
export type LocalJobProfile = {
  name?: string;
  school?: string;
  degree?: string;
  year?: string;
  roles?: string[];
  cities?: string[];
  resumeText?: string;
};
export type MatchResult = {
  score: number | null;
  matched: string[];
  missing: string[];
  dimensions: { id: string; label: string; value: number | null; reason: string; weight: number }[];
};
export type PreparationTask = {
  id: string;
  title: string;
  milestoneId: string;
  status: '待开始' | '进行中' | '已完成';
  date: string;
  remind: boolean;
};
export const PROFILE_ROLES = [
  '前端开发',
  '后端开发',
  '算法工程师',
  '产品经理',
  '设计师',
  '数据分析',
];
export const PROFILE_CITIES = [
  '北京',
  '上海',
  '深圳',
  '杭州',
  '广州',
  '成都',
  '武汉',
  '南京',
  '西安',
  '苏州',
];
export const PROFILE_DEGREES = ['专科', '本科', '硕士', '博士'];
export const PROFILE_YEARS = ['2026', '2027', '2028', '2029', '2030'];
export const SAMPLE_RESUME_TEXT =
  '林同学 · 2027届 本科\n教育：示例大学 计算机科学\n技能：JavaScript、TypeScript、React、Node.js\n项目：校园活动平台，独立实现 React 页面和报名流程，优化加载速度。\n项目：组件库，负责 TypeScript 类型与工程化、单元测试。\n实习：示例科技前端团队，参与性能测量与代码评审。';
const skills = [
  'React',
  'Vue',
  'TypeScript',
  'JavaScript',
  'Node.js',
  'Java',
  'Python',
  'SQL',
  'MySQL',
  'Redis',
  'Linux',
  'HTTP',
  'Git',
  'C++',
  'Go',
  'Figma',
  '机器学习',
  '数据分析',
  '工程化',
  '性能优化',
  '用户研究',
  '产品设计',
];
export function includesKeyword(text: string, term: string) {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return /[a-z]/i.test(term)
    ? new RegExp(`(^|[^a-z0-9])${escaped}(?=$|[^a-z0-9])`, 'i').test(text)
    : text.includes(term);
}
export function parseProfileText(text: string) {
  return {
    year: text.match(/(20\d{2})\s*届/)?.[1] ?? text.match(/(20\d{2})\s*年?\s*毕业/)?.[1] ?? '',
    degree: [...PROFILE_DEGREES].reverse().find((d) => text.includes(d)) ?? '',
    skills: skills.filter((term) => includesKeyword(text, term)),
    projects: text.match(/(?:^|\n)[^\n]*项目[：:]/g)?.length ?? 0,
    internships: text.match(/(?:^|\n)[^\n]*实习[：:]/g)?.length ?? 0,
  };
}
export function parseSavedProfile(raw?: string): LocalJobProfile {
  try {
    const value: unknown = raw ? JSON.parse(raw) : {};
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    const v = value as Record<string, unknown>;
    return {
      name: typeof v.name === 'string' ? v.name : undefined,
      school: typeof v.school === 'string' ? v.school : undefined,
      degree:
        typeof v.degree === 'string' && PROFILE_DEGREES.includes(v.degree) ? v.degree : undefined,
      year: typeof v.year === 'string' && PROFILE_YEARS.includes(v.year) ? v.year : undefined,
      roles: Array.isArray(v.roles)
        ? v.roles.filter((r): r is string => typeof r === 'string' && PROFILE_ROLES.includes(r))
        : [],
      cities: Array.isArray(v.cities)
        ? v.cities.filter((c): c is string => typeof c === 'string' && PROFILE_CITIES.includes(c))
        : [],
      resumeText: typeof v.resumeText === 'string' ? v.resumeText : '',
    };
  } catch {
    return {};
  }
}
export function matchJob(job: Job, profile: LocalJobProfile): MatchResult {
  const jd = job.requirements.join(' ');
  const keywords = [
    ...new Set([...job.tags, ...skills.filter((term) => includesKeyword(jd, term))]),
  ];
  const resume = profile.resumeText?.trim() ?? '';
  const matched = resume ? keywords.filter((term) => includesKeyword(resume, term)) : [];
  const missing = resume ? keywords.filter((term) => !matched.includes(term)) : keywords;
  const years =
    job.graduationYears !== undefined
      ? job.graduationYears.map(String)
      : [...jd.matchAll(/(20\d{2})\s*届/g)].map((m) => m[1]);
  const degreeKnown =
    profile.degree &&
    PROFILE_DEGREES.includes(profile.degree) &&
    PROFILE_DEGREES.includes(job.education);
  const roleKnown = !['', 'other', '其他', '方向未分类'].includes(job.role);
  const dimensions: MatchResult['dimensions'] = [
    {
      id: 'skills',
      label: '岗位关键词',
      weight: 40,
      value:
        resume && keywords.length ? Math.round((matched.length / keywords.length) * 100) : null,
      reason: resume
        ? `已覆盖 ${matched.length}/${keywords.length} 个岗位关键词`
        : '未导入简历文字，暂不计分',
    },
    {
      id: 'role',
      label: '岗位方向',
      weight: 20,
      value: roleKnown && profile.roles?.length ? (profile.roles.includes(job.role) ? 100 : 0) : null,
      reason: !roleKnown ? '来源未明确岗位分类，暂不计分' : profile.roles?.length
        ? `你的方向：${profile.roles.join('、')}；岗位：${job.role}`
        : '未设置意向方向',
    },
    {
      id: 'city',
      label: '工作城市',
      weight: 15,
      value: profile.cities?.length
        ? profile.cities.some((city) => job.city.split(/\s*[/、,，]\s*/).includes(city))
          ? 100
          : 0
        : null,
      reason: profile.cities?.length
        ? `你的城市：${profile.cities.join('、')}；岗位：${job.city}`
        : '未设置意向城市',
    },
    {
      id: 'education',
      label: '学历要求',
      weight: 15,
      value: degreeKnown
        ? PROFILE_DEGREES.indexOf(profile.degree!) >= PROFILE_DEGREES.indexOf(job.education)
          ? 100
          : 0
        : null,
      reason: degreeKnown
        ? `${profile.degree} / 岗位要求 ${job.education}及以上`
        : '学历信息尚不完整',
    },
    {
      id: 'year',
      label: '招聘届别',
      weight: 10,
      value: profile.year && years.length ? (years.includes(profile.year) ? 100 : 0) : null,
      reason:
        profile.year && years.length
          ? `${profile.year}届 / 岗位要求 ${years.join('、')}届`
          : '届别未设置或岗位未明确',
    },
  ];
  const known = dimensions.filter((d) => d.value !== null);
  const weight = known.reduce((n, d) => n + d.weight, 0);
  return {
    score: weight ? Math.round(known.reduce((n, d) => n + d.value! * d.weight, 0) / weight) : null,
    matched,
    missing,
    dimensions,
  };
}
export function validateOnboarding<T extends LocalJobProfile>(value: T): T {
  const name = value.name?.trim() ?? '';
  if (name.length < 2 || name.length > 20) throw new Error('昵称需要 2 至 20 个字');
  if ((value.school?.trim().length ?? 0) > 40) throw new Error('学校名称不能超过 40 字');
  if (!value.degree || !PROFILE_DEGREES.includes(value.degree)) throw new Error('请选择有效学历');
  if (!value.year || !PROFILE_YEARS.includes(value.year)) throw new Error('请选择有效毕业年份');
  if (!value.roles?.length || value.roles.some((r) => !PROFILE_ROLES.includes(r)))
    throw new Error('请至少选择一个有效意向方向');
  if (!value.cities?.length || value.cities.some((c) => !PROFILE_CITIES.includes(c)))
    throw new Error('请至少选择一座有效意向城市');
  if ((value.resumeText?.length ?? 0) > 500_000) throw new Error('简历文字过长');
  return {
    ...value,
    name,
    school: value.school?.trim() ?? '',
    roles: [...new Set(value.roles)],
    cities: [...new Set(value.cities)],
  };
}
export function buildPreparationTasks(
  profile: LocalJobProfile,
  existing: PreparationTask[],
  date: string,
): PreparationTask[] {
  const p = validateOnboarding(profile);
  const titles = [
    `筛选 ${p.cities!.join('、')} 的 ${p.year} 届校招机会`,
    ...p.roles!.map((r) => `完成 ${r} 方向的一轮基础题练习`),
    p.resumeText?.trim() ? '按目标岗位核对简历关键词与项目证据' : '整理并导入第一份求职简历',
    ...p.roles!.map((r) => `整理 ${r} 项目介绍与 STAR 复盘`),
    '检查本周投递记录并安排下一次准备',
  ];
  return [
    ...existing,
    ...titles
      .filter((t) => !existing.some((e) => e.title === t))
      .map((title, i) => {
        const due = new Date(`${date}T12:00:00+08:00`);
        due.setUTCDate(due.getUTCDate() + i);
        return {
          id: `onboarding-${encodeURIComponent(title)}`,
          title,
          milestoneId: '',
          status: '待开始' as const,
          date: due.toISOString().slice(0, 10),
          remind: true,
        };
      }),
  ];
}
export function onboardingReturnTo(value: string | null) {
  const safe = safeReturnTo(value, '/pipeline');
  return /^\/onboarding(?:\/|\?|#|$)/.test(safe) ? '/pipeline' : safe;
}
export function preserveReturnTo(path: string, returnTo: string | null) {
  return `${path}?returnTo=${encodeURIComponent(onboardingReturnTo(returnTo))}`;
}
export function filterJobYear(job: Job, year: string) {
  return (
    !year ||
    year === '不限' ||
    (job.graduationYears !== undefined
      ? job.graduationYears.includes(Number(year))
      : new RegExp(`${year}\\s*届`).test(job.requirements.join(' ')))
  );
}
export function postedOrder(value: string) {
  if (/^\d{4}-\d{2}-\d{2}T/.test(value)) {
    const timestamp = Date.parse(value);
    return Number.isFinite(timestamp)
      ? (Date.now() - timestamp) / 3600000
      : Number.MAX_SAFE_INTEGER;
  }
  if (value === '今天') return 0;
  if (value === '昨天') return 24;
  const n = Number(value.match(/\d+/)?.[0]);
  return /分钟/.test(value)
    ? n / 60
    : /小时/.test(value)
      ? n
      : /天/.test(value)
        ? n * 24
        : Number.MAX_SAFE_INTEGER;
}
