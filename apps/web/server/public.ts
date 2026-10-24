import { createHash } from 'node:crypto';
import { companies, jobs, experiences, chapters, DEMO_NOW } from '../lib/data';
import type {
  Company,
  Job,
  JobCard,
  Experience,
  ExperienceCard,
  Chapter,
  ChapterSummary,
  SearchResults,
} from '../lib/api/contracts';
import { dataMode, ApiError, notFound, parseId } from './http';
import { transaction, camel, type Db } from './db';
import { databasePublicList, databasePublicDetail } from './public-repository';
import { paginate, listQuery, values, match } from './pagination';
export const mockId = (key: string) => {
  const s = createHash('sha256')
    .update('campus-mock:' + key)
    .digest('hex');
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-4${s.slice(13, 16)}-a${s.slice(17, 20)}-${s.slice(20, 32)}`;
};
const role = (value: string) =>
  ({
    前端开发: 'frontend',
    后端开发: 'backend',
    算法工程师: 'algorithm',
    产品经理: 'product',
    设计师: 'design',
    数据分析: 'data',
    客户端开发: 'client',
  })[value] ?? value;
const mockCompanies: Company[] = companies.map((c) => ({
  id: mockId(c.id),
  slug: c.slug,
  name: c.name,
  logoUrl: null,
  industry: c.industry,
  sizeBand: c.size,
  locations: [...new Set(jobs.filter((j) => j.companyId === c.id).map((j) => j.city))],
  tags: c.tags,
  description: c.description,
  verifiedAt: null,
}));
const companyFor = (id: string) => mockCompanies.find((c) => c.id === mockId(id))!;
const mockJobs: Job[] = jobs.map((j, index) => ({
  id: mockId(j.id),
  title: j.title,
  company: companyFor(j.companyId),
  role: role(j.role),
  cities: [j.city],
  education: j.education === '硕士' ? 'master' : 'bachelor',
  recruitmentType: j.type === '实习' ? 'internship' : 'campus',
  graduationYears: [2027],
  skills: j.tags,
  salary: null,
  deadlineAt: j.deadline ? `${j.deadline}T15:59:59.000Z` : null,
  deadlinePrecision: j.deadline ? 'date' : 'unknown',
  sourceTimezone: 'Asia/Shanghai',
  publishedAt: new Date(new Date(DEMO_NOW).getTime() - index * 3600000).toISOString(),
  verifiedAt: new Date(DEMO_NOW).toISOString(),
  status: 'open',
  source: {
    id: mockId('source-demo'),
    name: '产品演示数据（非实时招聘）',
    url: 'https://example.invalid/campus-demo',
    verifiedAt: new Date(DEMO_NOW).toISOString(),
  },
  canonicalUrl: 'https://example.invalid/campus-demo/' + j.id,
  descriptionMd: j.description.join('\n\n') + '\n\n## 任职要求\n\n' + j.requirements.join('\n\n'),
}));
const mockExperiences: Experience[] = experiences.map((e, index) => ({
  id: mockId(e.id),
  company: companyFor(e.companyId),
  title: e.title,
  summary: e.excerpt,
  role: role(e.role),
  roundType: e.round === 'HR面' ? 'hr' : 'technical',
  tags: e.tags,
  occurredAt: null,
  publishedAt: new Date(new Date(DEMO_NOW).getTime() - index * 86400000).toISOString(),
  contentMode: 'user_original',
  sourceUrl: null,
  licenseNote: '原创产品演示文本，不代表真实招聘经历。',
  bodyMd: e.sections.map((s) => '## ' + s.title + '\n\n' + s.content).join('\n\n'),
  toc: e.sections.map((s, i) => ({ id: 'section-' + i, title: s.title, level: 2 })),
}));
const mockChapters: Chapter[] = chapters.map((c, index) => ({
  id: mockId(c.id),
  parentId: null,
  slug: c.id,
  title: c.title,
  direction:
    c.category === '前端开发'
      ? 'frontend'
      : c.category === '计算机基础'
        ? 'fundamentals'
        : 'interview',
  sortOrder: index,
  contentVersion: 1,
  bodyMd: c.content,
}));
export function jobCard(job: Job): JobCard {
  const { descriptionMd, canonicalUrl, ...card } = job;
  void descriptionMd;
  void canonicalUrl;
  return card;
}
const experienceCard = (experience: Experience): ExperienceCard => {
  const { bodyMd, toc, ...card } = experience;
  void bodyMd;
  void toc;
  return card;
};
const chapterCard = (chapter: Chapter): ChapterSummary => {
  const { bodyMd, ...card } = chapter;
  void bodyMd;
  return card;
};
export type PublicKind = 'jobs' | 'companies' | 'experiences' | 'chapters';
export function mapJob(row: Record<string, unknown>): Job {
  const mapped = camel<Job & { sourceId: string; canonicalUrl: string }>(row);
  return {
    ...Object.fromEntries(
      Object.entries(mapped).filter(([k]) =>
        [
          'id',
          'title',
          'company',
          'role',
          'cities',
          'education',
          'recruitmentType',
          'graduationYears',
          'skills',
          'salary',
          'deadlineAt',
          'deadlinePrecision',
          'sourceTimezone',
          'publishedAt',
          'verifiedAt',
          'status',
          'descriptionMd',
          'canonicalUrl',
        ].includes(k),
      ),
    ),
    company: mapCompany(row.company as Record<string, unknown>),
    source: {
      id: mapped.sourceId,
      name: String(row.source_name ?? '官方招聘'),
      url: mapped.canonicalUrl,
      verifiedAt: mapped.verifiedAt,
    },
  } as Job;
}
export function mapCompany(row: Record<string, unknown>): Company {
  const c = camel<Company>(row);
  return {
    id: c.id,
    slug: c.slug,
    name: c.name,
    logoUrl: c.logoUrl ?? null,
    industry: c.industry ?? null,
    sizeBand: c.sizeBand ?? null,
    locations: c.locations,
    tags: c.tags,
    description: c.description,
    verifiedAt: c.verifiedAt,
  };
}
function mapExperience(row: Record<string, unknown>): Experience {
  const e = camel<Experience>(row);
  return {
    id: e.id,
    company: row.company ? mapCompany(row.company as Record<string, unknown>) : null,
    title: e.title,
    summary: e.summary,
    role: e.role,
    roundType: e.roundType,
    tags: e.tags,
    occurredAt: e.occurredAt?.slice(0, 10) ?? null,
    publishedAt: e.publishedAt,
    contentMode: e.contentMode,
    sourceUrl: e.sourceUrl,
    licenseNote: e.licenseNote,
    bodyMd: e.contentMode === 'excerpt_link' ? null : e.bodyMd,
    toc: [],
  };
}
export async function jobsByIds(sql: Db, ids: string[]): Promise<Job[]> {
  if (!ids.length) return [];
  const rows =
    await sql`select j.*,row_to_json(c) company,s.name source_name from jobs j join companies c on c.id=j.company_id left join sources s on s.id=j.source_id where j.id in ${sql(ids)}`;
  return rows.map(mapJob);
}
async function rows(kind: PublicKind): Promise<(Job | Company | Experience | Chapter)[]> {
  if (dataMode() === 'mock')
    return kind === 'jobs'
      ? mockJobs
      : kind === 'companies'
        ? mockCompanies
        : kind === 'experiences'
          ? mockExperiences
          : mockChapters;
  return transaction(null, async (sql) => {
    if (kind === 'jobs') {
      const records =
        await sql`select j.*,row_to_json(c) company,s.name source_name from jobs j join companies c on c.id=j.company_id left join sources s on s.id=j.source_id`;
      return records.map(mapJob);
    }
    if (kind === 'companies') return (await sql`select * from companies`).map(mapCompany);
    if (kind === 'experiences')
      return (
        await sql`select e.*,row_to_json(c) company from experiences e left join companies c on c.id=e.company_id where e.status='published'`
      ).map(mapExperience);
    return (await sql`select * from handbook_chapters where status='published'`).map((r) => {
      const c = camel<Chapter>(r);
      return { ...chapterCard(c), bodyMd: c.bodyMd };
    });
  });
}
export async function publicList(kind: PublicKind, params: URLSearchParams) {
  const { q } = listQuery(params);
  const query = q.toLowerCase();
  const sort = params.get('sort') ?? 'newest';
  if (!['newest', 'deadline'].includes(sort) || (kind !== 'jobs' && sort === 'deadline'))
    throw new ApiError(422, 'VALIDATION_ERROR', '排序方式无效。');
  if (dataMode() === 'api') {
    const result = await databasePublicList(kind, params);
    return {
      ...result,
      data: result.data.map((v) =>
        kind === 'jobs'
          ? jobCard(v as Job)
          : kind === 'experiences'
            ? experienceCard(v as Experience)
            : kind === 'chapters'
              ? chapterCard(v as Chapter)
              : v,
      ),
    };
  }
  let all = await rows(kind);
  all = all.filter((item) => {
    if (kind === 'jobs') {
      const j = item as Job;
      return (
        (!query ||
          [j.title, j.company.name, ...j.skills, j.role].some((s) =>
            s.toLowerCase().includes(query),
          )) &&
        match(params, 'city', j.cities) &&
        match(params, 'companyId', j.company.id) &&
        match(params, 'role', j.role) &&
        match(params, 'education', j.education) &&
        match(params, 'recruitmentType', j.recruitmentType) &&
        match(params, 'graduationYear', j.graduationYears.map(String)) &&
        match(params, 'status', j.status)
      );
    }
    if (kind === 'companies') {
      const c = item as Company;
      return !query || [c.name, c.description, c.slug].some((s) => s.toLowerCase().includes(query));
    }
    if (kind === 'experiences') {
      const e = item as Experience;
      return (
        (!query || [e.title, e.summary, ...e.tags].some((s) => s.toLowerCase().includes(query))) &&
        match(params, 'companyId', e.company?.id ?? '') &&
        match(params, 'role', e.role) &&
        match(params, 'roundType', e.roundType) &&
        match(params, 'tag', e.tags)
      );
    }
    const c = item as Chapter;
    return (
      (!query || [c.title, c.bodyMd].some((s) => s.toLowerCase().includes(query))) &&
      match(params, 'direction', c.direction)
    );
  });
  const sortValue = (item: (typeof all)[number]): string | null =>
    kind === 'jobs'
      ? sort === 'deadline'
        ? (item as Job).deadlineAt
        : (item as Job).publishedAt
      : kind === 'experiences'
        ? (item as Experience).publishedAt
        : kind === 'chapters'
          ? String((item as Chapter).sortOrder)
          : null;
  all.sort((a, b) => {
    const aa = sortValue(a),
      bb = sortValue(b);
    if (kind === 'chapters') return Number(aa) - Number(bb) || a.id.localeCompare(b.id);
    if (sort === 'deadline')
      return aa === null
        ? bb === null
          ? a.id.localeCompare(b.id)
          : 1
        : bb === null
          ? -1
          : aa.localeCompare(bb) || a.id.localeCompare(b.id);
    return (bb ?? '').localeCompare(aa ?? '') || b.id.localeCompare(a.id);
  });
  const result =
    kind === 'chapters'
      ? { data: all, page: { hasMore: false, nextCursor: null }, meta: {} }
      : paginate(all, params, sortValue);
  return {
    ...result,
    data: result.data.map((v) =>
      kind === 'jobs'
        ? jobCard(v as Job)
        : kind === 'experiences'
          ? experienceCard(v as Experience)
          : kind === 'chapters'
            ? chapterCard(v as Chapter)
            : v,
    ),
  };
}
export async function publicDetail(kind: PublicKind, id: string) {
  if (kind !== 'chapters') parseId(id);
  if (dataMode() === 'api') return databasePublicDetail(kind, id);
  const item = (await rows(kind)).find((r) =>
    kind === 'chapters' ? (r as Chapter).slug === id : r.id === id,
  );
  if (!item) throw notFound();
  return item;
}
export async function search(params: URLSearchParams): Promise<SearchResults> {
  const { q, limit } = listQuery(params);
  const types = values(params, 'types');
  if (types.some((t) => !['job', 'company', 'experience', 'handbook'].includes(t)))
    throw new ApiError(422, 'VALIDATION_ERROR', '搜索类型无效。');
  const result: SearchResults = { jobs: [], companies: [], experiences: [], handbook: [] };
  for (const [kind, type, key] of [
    ['jobs', 'job', 'jobs'],
    ['companies', 'company', 'companies'],
    ['experiences', 'experience', 'experiences'],
    ['chapters', 'handbook', 'handbook'],
  ] as const) {
    if (types.length && !types.includes(type)) continue;
    const items = await publicList(kind, new URLSearchParams({ q, limit: String(limit) }));
    result[key] = items.data.map((v) => ({
      id: v.id,
      type,
      title: 'title' in v ? v.title : (v as Company).name,
      subtitle:
        'summary' in v
          ? v.summary
          : 'description' in v
            ? v.description
            : 'direction' in v
              ? v.direction
              : (v as JobCard).company.name,
      href:
        kind === 'chapters'
          ? `/handbook?chapter=${encodeURIComponent((v as Chapter).slug)}`
          : kind === 'companies'
            ? `/company/${v.id}`
            : `/${kind}/${v.id}`,
      previewable: type === 'job' || type === 'experience',
    }));
  }
  return result;
}
