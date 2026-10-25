import { z } from 'zod';
import { body, hash, json, ApiError, dataMode } from './http';
import { withUser } from './private';
const httpUrl = z
  .url()
  .max(2000)
  .refine(
    (value) => ['https:', 'http:'].includes(new URL(value).protocol),
    '仅允许 http/https 来源链接',
  );
export const manualJobSchema = z
  .object({
    company: z
      .object({
        id: z.uuid().optional(),
        name: z.string().trim().min(1).max(150).optional(),
        slug: z
          .string()
          .regex(/^[a-zA-Z0-9][a-zA-Z0-9-]{0,99}$/)
          .optional(),
        industry: z.string().max(100).default(''),
        description: z.string().max(10000).default(''),
        locations: z.array(z.string().min(1).max(80)).max(30).default([]),
      })
      .strict()
      .refine((value) => !!value.id || !!value.name, '请填写公司 ID 或名称'),
    title: z.string().trim().min(1).max(300),
    role: z.string().trim().min(1).max(100),
    cities: z.array(z.string().trim().min(1).max(80)).min(1).max(30),
    education: z.enum(['any', 'associate', 'bachelor', 'master', 'doctorate']).nullable().default(null),
    recruitmentType: z.enum(['campus', 'internship']),
    graduationYears: z.array(z.number().int().min(2020).max(2100)).min(1).max(10),
    skills: z.array(z.string().max(100)).max(100).default([]),
    descriptionMd: z.string().trim().min(1).max(100000),
    canonicalUrl: httpUrl,
    sourceName: z.string().trim().min(1).max(150).default('手动录入 · 官方未核验'),
    publishedAt: z.iso.datetime({ offset: true }).optional(),
    deadlineAt: z.iso.datetime({ offset: true }).nullable().default(null),
    deadlinePrecision: z.enum(['exact', 'date', 'unknown']).default('unknown'),
    status: z.enum(['open', 'closed', 'unknown']).default('unknown'),
  })
  .strict()
  .refine((value) => (value.deadlineAt === null) === (value.deadlinePrecision === 'unknown'), {
    message: '截止日期与精度必须同时填写',
    path: ['deadlineAt'],
  });
export const manualImportSchema = z
  .object({ jobs: z.array(manualJobSchema).min(1).max(100) })
  .strict();
export function importJobs(request: Request) {
  if (dataMode() !== 'api')
    throw new ApiError(409, 'INVALID_DATA_MODE', '真实岗位录入仅在云端模式启用。');
  return withUser(request, true, async (sql, session) => {
    const input = await body(request, manualImportSchema);
    for (const item of input.jobs) {
      let companyId = item.company.id;
      const companyName = item.company.name ?? '';
      if (companyId) {
        const rows = await sql`select id from companies where id=${companyId}::uuid`;
        if (!rows[0]) throw new ApiError(422, 'VALIDATION_ERROR', '公司不存在。');
      } else {
        const slug = item.company.slug ?? `manual-${crypto.randomUUID()}`;
        const existing = item.company.slug
          ? await sql`select id,name from companies where slug=${slug}`
          : await sql`select id,name from companies where name=${companyName} order by created_at limit 1`;
        if (existing[0] && existing[0].name !== companyName)
          throw new ApiError(
            409,
            'COMPANY_CONFLICT',
            '公司标识已存在，请使用 company.id 选择现有公司。',
          );
        if (existing[0]) companyId = existing[0].id;
        else {
          const rows =
            await sql`insert into companies(slug,name,industry,description,locations,recorded_by) values(${slug},${companyName},${item.company.industry},${item.company.description},${sql.array(item.company.locations)}::text[],${session.userId}::uuid) returning id`;
          companyId = rows[0].id;
        }
      }
      const duplicate =
        await sql`select id from jobs where company_id=${companyId!}::uuid and canonical_url=${item.canonicalUrl}`;
      if (duplicate[0])
        throw new ApiError(409, 'JOB_EXISTS', '该公司和来源链接的岗位已存在，本批次未保存。');
      const url = new URL(item.canonicalUrl),
        sourceId = crypto.randomUUID();
      await sql`insert into sources(id,name,base_url,allowed_hosts,company_id,terms_note,enabled,permission_status,recorded_by,entry_mode) values(${sourceId}::uuid,${'手动录入 · 官方未核验 · ' + item.sourceName},${url.origin},${sql.array([url.hostname])}::text[],${companyId!}::uuid,'用户手动记录来源，尚未核验，未授权自动采集。',false,'pending',${session.userId}::uuid,'manual')`;
      await sql`insert into jobs(company_id,source_id,canonical_url,title,role,cities,education,recruitment_type,graduation_years,skills,description_md,deadline_at,deadline_precision,published_at,published_precision,last_seen_at,verified_at,status,content_hash,recorded_by) values(${companyId!}::uuid,${sourceId}::uuid,${item.canonicalUrl},${item.title},${item.role},${sql.array(item.cities)}::text[],${item.education}::education,${item.recruitmentType}::recruitment_type,${sql.array(item.graduationYears)}::int[],${sql.array(item.skills)}::text[],${item.descriptionMd},${item.deadlineAt}::text::timestamptz,${item.deadlinePrecision}::deadline_precision,${item.publishedAt ?? null}::text::timestamptz,${item.publishedAt ? 'exact' : 'unknown'},now(),null,${item.status},${hash(JSON.stringify(item))},${session.userId}::uuid)`;
    }
    return json({ data: { inserted: input.jobs.length } }, 201);
  });
}
