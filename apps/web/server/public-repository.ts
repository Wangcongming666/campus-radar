import { z } from 'zod';
import { type Db, transaction, camel } from './db';
import { ApiError, notFound } from './http';
import { listQuery, decodeCursor, values } from './pagination';
import { mapCompany, mapJob, type PublicKind } from './public';
import type { Chapter, Experience, Job, Company, ApiList } from '../lib/api/contracts';
export type PublicRow = Job | Company | Experience | Chapter;
export function mapPublicExperience(row: Record<string, unknown>): Experience {
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
function select(sql: Db, kind: PublicKind) {
  if (kind === 'jobs')
    return sql`select j.*,row_to_json(c) company,s.name source_name from jobs j join companies c on c.id=j.company_id left join sources s on s.id=j.source_id`;
  if (kind === 'companies') return sql`select c.* from companies c`;
  if (kind === 'experiences')
    return sql`select e.*,row_to_json(c) company from experiences e left join companies c on c.id=e.company_id`;
  return sql`select h.* from handbook_chapters h`;
}
function map(kind: PublicKind, row: Record<string, unknown>): PublicRow {
  if (kind === 'jobs') return mapJob(row);
  if (kind === 'companies') return mapCompany(row);
  if (kind === 'experiences') return mapPublicExperience(row);
  const c = camel<Chapter>(row);
  return {
    id: c.id,
    parentId: c.parentId,
    slug: c.slug,
    title: c.title,
    direction: c.direction,
    sortOrder: c.sortOrder,
    contentVersion: c.contentVersion,
    bodyMd: c.bodyMd,
  };
}
function condition(sql: Db, kind: PublicKind, params: URLSearchParams, q: string) {
  const like = '%' + q.replace(/[\\%_]/g, '\\$&') + '%';
  if (kind === 'jobs') {
    const city = values(params, 'city'),
      company = values(params, 'companyId'),
      role = values(params, 'role'),
      education = values(params, 'education'),
      type = values(params, 'recruitmentType'),
      year = values(params, 'graduationYear'),
      status = values(params, 'status');
    if (
      company.some((v) => !z.uuid().safeParse(v).success) ||
      year.some((v) => !/^\d{4}$/.test(v)) ||
      education.some((v) => !['any', 'associate', 'bachelor', 'master', 'doctorate'].includes(v)) ||
      type.some((v) => !['campus', 'internship'].includes(v)) ||
      status.some((v) => !['open', 'closed', 'unknown'].includes(v))
    )
      throw new ApiError(422, 'VALIDATION_ERROR', '岗位筛选值无效。');
    return sql`true ${q ? sql`and (j.title ilike ${like} or c.name ilike ${like} or array_to_string(j.skills,' ') ilike ${like} or j.role ilike ${like})` : sql``} ${city.length ? sql`and j.cities && ${sql.array(city)}::text[]` : sql``} ${company.length ? sql`and j.company_id in ${sql(company)}` : sql``} ${role.length ? sql`and j.role in ${sql(role)}` : sql``} ${education.length ? sql`and j.education::text in ${sql(education)}` : sql``} ${type.length ? sql`and j.recruitment_type::text in ${sql(type)}` : sql``} ${year.length ? sql`and j.graduation_years && ${sql.array(year.map(Number))}::int[]` : sql``} ${status.length ? sql`and j.status in ${sql(status)}` : sql``}`;
  }
  if (kind === 'companies')
    return sql`true ${q ? sql`and (c.name ilike ${like} or c.description ilike ${like} or c.slug ilike ${like})` : sql``}`;
  if (kind === 'experiences') {
    const company = values(params, 'companyId'),
      role = values(params, 'role'),
      round = values(params, 'roundType'),
      tag = values(params, 'tag');
    if (
      company.some((v) => !z.uuid().safeParse(v).success) ||
      round.some(
        (v) => !['assessment', 'technical', 'business', 'hr', 'final', 'other'].includes(v),
      )
    )
      throw new ApiError(422, 'VALIDATION_ERROR', '面经筛选值无效。');
    return sql`e.status='published' ${q ? sql`and (e.title ilike ${like} or e.summary ilike ${like} or array_to_string(e.tags,' ') ilike ${like})` : sql``} ${company.length ? sql`and e.company_id in ${sql(company)}` : sql``} ${role.length ? sql`and e.role in ${sql(role)}` : sql``} ${round.length ? sql`and e.round_type in ${sql(round)}` : sql``} ${tag.length ? sql`and e.tags && ${sql.array(tag)}::text[]` : sql``}`;
  }
  const direction = values(params, 'direction');
  return sql`h.status='published' ${q ? sql`and (h.title ilike ${like} or h.body_md ilike ${like})` : sql``} ${direction.length ? sql`and h.direction in ${sql(direction)}` : sql``}`;
}
function keyValue(kind: PublicKind, row: PublicRow, sort: string): string | null {
  return kind === 'jobs'
    ? sort === 'deadline'
      ? (row as Job).deadlineAt
      : (row as Job).publishedAt
    : kind === 'experiences'
      ? (row as Experience).publishedAt
      : null;
}
export function databasePublicList(
  kind: PublicKind,
  params: URLSearchParams,
): Promise<ApiList<PublicRow>> {
  return transaction(null, async (sql) => {
    const query = listQuery(params);
    const cursor = decodeCursor(query.cursor, query.filter);
    const sort = params.get('sort') ?? 'newest';
    if (
      cursor &&
      (!z.uuid().safeParse(cursor.id).success ||
        ((kind === 'jobs' || kind === 'experiences') &&
          cursor.sort !== null &&
          !z.iso.datetime({ offset: true }).safeParse(cursor.sort).success) ||
        (sort !== 'deadline' &&
          (kind === 'jobs' || kind === 'experiences') &&
          cursor.sort === null))
    )
      throw new ApiError(422, 'INVALID_CURSOR', '分页位置无效。');
    const where = condition(sql, kind, params, query.q);
    let keyset = sql``;
    let ordering = sql``;
    if (kind === 'jobs' && sort === 'deadline') {
      ordering = sql`j.deadline_at asc nulls last,j.id asc`;
      if (cursor)
        keyset =
          cursor.sort === null
            ? sql`and j.deadline_at is null and j.id>${cursor.id}::uuid`
            : sql`and (j.deadline_at>${cursor.sort}::timestamptz or (j.deadline_at=${cursor.sort}::timestamptz and j.id>${cursor.id}::uuid) or j.deadline_at is null)`;
    } else if (kind === 'jobs') {
      ordering = sql`j.published_at desc,j.id desc`;
      if (cursor)
        keyset = sql`and (j.published_at,j.id)<(${cursor.sort}::timestamptz,${cursor.id}::uuid)`;
    } else if (kind === 'experiences') {
      ordering = sql`e.published_at desc,e.id desc`;
      if (cursor)
        keyset = sql`and (e.published_at,e.id)<(${cursor.sort}::timestamptz,${cursor.id}::uuid)`;
    } else if (kind === 'companies') {
      ordering = sql`c.id desc`;
      if (cursor) keyset = sql`and c.id<${cursor.id}::uuid`;
    } else ordering = sql`h.sort_order,h.id`;
    const records =
      kind === 'chapters'
        ? await sql`${select(sql, kind)} where ${where} order by ${ordering}`
        : await sql`${select(sql, kind)} where ${where} ${keyset} order by ${ordering} limit ${query.limit + 1}`;
    const hasMore = kind !== 'chapters' && records.length > query.limit;
    const data = (hasMore ? records.slice(0, query.limit) : records).map((r) => map(kind, r));
    const last = data.at(-1);
    const count =
      query.includeTotal && !cursor
        ? await sql`select count(*)::int total from (${select(sql, kind)} where ${where}) filtered`
        : null;
    return {
      data,
      page: {
        hasMore,
        nextCursor:
          hasMore && last
            ? Buffer.from(
                JSON.stringify({
                  v: 1,
                  filter: query.filter,
                  id: last.id,
                  sort: keyValue(kind, last, sort),
                }),
              ).toString('base64url')
            : null,
      },
      meta: count ? { total: count[0].total } : {},
    };
  });
}
export function databasePublicDetail(kind: PublicKind, id: string): Promise<PublicRow> {
  return transaction(null, async (sql) => {
    const where =
      kind === 'jobs'
        ? sql`j.id=${id}::uuid`
        : kind === 'companies'
          ? sql`c.id=${id}::uuid`
          : kind === 'experiences'
            ? sql`e.id=${id}::uuid and e.status='published'`
            : sql`h.slug=${id} and h.status='published'`;
    const records = await sql`${select(sql, kind)} where ${where} limit 1`;
    if (!records[0]) throw notFound();
    return map(kind, records[0]);
  });
}
