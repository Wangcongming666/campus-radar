import { transaction } from './db';
import { mapCompany, mapJob } from './public';
import { mapPublicExperience } from './public-repository';
import type { Catalog, Company, Job, Experience } from '../lib/data';
import type {
  Company as ApiCompany,
  Job as ApiJob,
  Experience as ApiExperience,
} from '../lib/api/contracts';
const roles: Record<string, string> = {
  frontend: '前端开发',
  backend: '后端开发',
  algorithm: '算法工程师',
  product: '产品经理',
  design: '设计师',
  data: '数据分析',
  client: '客户端开发',
  other: '方向未分类',
};
const education: Record<string, string> = {
  any: '不限',
  associate: '大专',
  bachelor: '本科',
  master: '硕士',
  doctorate: '博士',
};
export function catalogCompany(c: ApiCompany): Company {
  return {
    id: c.id,
    slug: c.slug,
    name: c.name,
    en: '',
    initial: c.name.slice(0, 1),
    color: 'blue',
    industry: c.industry ?? '',
    description: c.description,
    size: c.sizeBand ?? '',
    tags: c.tags,
  };
}
export function catalogJob(j: ApiJob): Job {
  const salary = j.salary;
  const money = (n: number | null) =>
    n === null ? '' : String(n / 100 / (salary?.period === 'day' ? 1 : 1000));
  return {
    id: j.id,
    title: j.title,
    companyId: j.company.id,
    department: j.source.name,
    city: j.cities.join(' / '),
    role: roles[j.role] ?? j.role,
    education: j.education === null ? '学历未注明' : education[j.education],
    type: j.recruitmentType === 'internship' ? '实习' : '校招',
    salary:
      !salary || salary.negotiable
        ? (!salary ? '薪资未注明' : '薪资面议')
        : `${money(salary.minMinor)}–${money(salary.maxMinor)}${salary.period === 'day' ? '元/天' : 'K'}${salary.months ? ` · ${salary.months}薪` : ''}`,
    tags: j.skills,
    match: 0,
    deadline: j.deadlineAt?.slice(0, 10) ?? null,
    posted: j.publishedDate ?? j.publishedAt?.slice(0, 10) ?? '发布时间未注明',
    description: [j.descriptionMd],
    requirements: [j.graduationYears.length ? `${j.graduationYears.join('、')}届` : '届别未明确'],
    canonicalUrl: j.canonicalUrl,
    sourceName: j.source.name,
    collectedAt: j.collectedAt,
    graduationYears: j.graduationYears,
    status: j.status,
  };
}
export function catalogExperience(e: ApiExperience, payload?: Partial<Experience>): Experience {
  if (
    e.contentMode !== 'excerpt_link' &&
    payload?.sections &&
    typeof payload.author === 'string' &&
    typeof payload.avatar === 'string'
  )
    return {
      ...payload,
      id: e.id,
      companyId: e.company?.id ?? '',
      title: e.title,
      role: roles[e.role] ?? e.role,
      round: payload.round ?? '',
      author: payload.author,
      avatar: payload.avatar,
      date: payload.date ?? e.publishedAt.slice(0, 10),
      readTime: payload.readTime ?? '',
      tags: e.tags,
      views: payload.views ?? 0,
      likes: payload.likes ?? 0,
      excerpt: e.summary,
      sections: payload.sections,
    };
  return {
    id: e.id,
    companyId: e.company?.id ?? '',
    title: e.title,
    role: roles[e.role] ?? e.role,
    round: {
      assessment: '笔试',
      technical: '技术面',
      business: '业务面',
      hr: 'HR面',
      final: '终面',
      other: '其他',
    }[e.roundType],
    author: e.contentMode === 'user_original' ? '原创分享' : '来源摘录',
    avatar: '面',
    date: e.publishedAt.slice(0, 10),
    readTime: `${Math.max(1, Math.ceil((e.bodyMd?.length ?? 0) / 400))}分钟`,
    tags: e.tags,
    views: 0,
    likes: 0,
    excerpt: e.summary,
    sections: e.bodyMd
      ? [{ title: '正文', content: e.bodyMd }]
      : [
          {
            title: '来源说明',
            content: `${e.licenseNote}${e.sourceUrl ? '\n' + e.sourceUrl : ''}`,
          },
        ],
  };
}
/** A real database snapshot for legacy UI; never imports demonstration rows. */
export async function databaseCatalog(): Promise<Catalog> {
  return transaction(null, async (sql) => {
    const companyRows = await sql`select * from companies order by name,id`;
    const jobRows =
      await sql`select j.*,row_to_json(c) company,s.name source_name from jobs j join companies c on c.id=j.company_id left join sources s on s.id=j.source_id order by coalesce(j.published_at,j.published_date::timestamp at time zone 'UTC') desc nulls last,j.id desc`;
    const experienceRows =
      await sql`select e.*,row_to_json(c) company from experiences e left join companies c on c.id=e.company_id where e.status='published' order by e.published_at desc,e.id`;
    const chapterRows =
      await sql`select * from handbook_chapters where status='published' order by sort_order,id`;
    const questionRows =
      await sql`select * from questions where status='published' order by created_at,id`;
    return {
      companies: companyRows.map(mapCompany).map(catalogCompany),
      jobs: jobRows.map(mapJob).map(catalogJob),
      experiences: experienceRows.map((row) =>
        catalogExperience(mapPublicExperience(row), row.ui_payload),
      ),
      chapters: chapterRows.map((c) => ({
        id: c.id,
        title: c.title,
        category: roles[c.direction] ?? c.direction,
        count: 0,
        content: c.body_md,
        sections: [],
      })),
      questions: questionRows.map((q) => ({
        id: q.id,
        title: q.title,
        topic: q.topic,
        difficulty: q.difficulty,
        frequency: q.frequency,
        answer: q.answer,
        companies: q.company_ids,
      })),
    };
  });
}
