import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import postgres from 'postgres';
import { randomUUID } from 'node:crypto';
import { mapJob } from './public';
import { catalogJob } from './catalog';
import { databasePublicList } from './public-repository';
import type { Job } from '../lib/api/contracts';

const company = {
  id: randomUUID(),
  slug: 'date-test',
  name: '日期测试',
  locations: [],
  tags: [],
  description: '',
  verified_at: null,
};
const row = {
  id: randomUUID(),
  company,
  title: '真实来源日期精度',
  role: 'other',
  cities: ['北京'],
  education: null,
  recruitment_type: 'campus',
  graduation_years: [],
  skills: [],
  salary: null,
  deadline_at: null,
  deadline_precision: 'unknown',
  source_timezone: 'Asia/Shanghai',
  published_at: null,
  published_date: '2026-07-22',
  published_precision: 'date',
  verified_at: null,
  status: 'open',
  source_id: randomUUID(),
  source_name: '官方公开元数据',
  canonical_url: 'https://hr.xiaomi.com/website/opportunities.html',
  description_md: '元数据摘要',
  publication_sort_key: '2026-07-22T00:00:00.000000Z',
  provenance: { internalReview: 'not public DTO' },
};

it('publishes a date without inventing a timestamp and does not leak the internal sort key', () => {
  const job = mapJob(row);
  expect(job).toMatchObject({
    publishedAt: null,
    publishedDate: '2026-07-22',
    publishedPrecision: 'date',
    education: null,
  });
  expect(job).not.toHaveProperty('publicationSortKey');
  expect(job).not.toHaveProperty('provenance');
  expect(catalogJob(job)).toMatchObject({
    posted: '2026-07-22',
    education: '学历未注明',
    deadline: null,
  });
  expect(
    catalogJob(mapJob({ ...row, published_date: null, published_precision: 'unknown' })).posted,
  ).toBe('发布时间未注明');
});

// Root runs this only after migrating its disposable local test database.
const testDatabase = process.env.API_INTEGRATION_DATABASE_URL;
describe.skipIf(!testDatabase)('PostgreSQL mixed publication precision keyset', () => {
  let admin: ReturnType<typeof postgres>;
  const companyId = randomUUID();
  const sourceId = randomUUID();
  const ids = Array.from({ length: 6 }, () => randomUUID());
  beforeAll(async () => {
    vi.stubEnv('NEXT_PUBLIC_DATA_MODE', 'api');
    if (!process.env.DATABASE_URL) vi.stubEnv('DATABASE_URL', testDatabase!);
    admin = postgres(testDatabase!, { max: 1 });
    await admin`insert into companies(id,slug,name) values(${companyId}::uuid,${'precision-' + companyId},'Precision fixture')`;
    await admin`insert into sources(id,name,base_url,allowed_hosts,company_id) values(${sourceId}::uuid,'Precision fixture','https://example.invalid',array['example.invalid'],${companyId}::uuid)`;
    const publications = [
      { exact: '2026-10-24T08:00:00.000002Z', date: null, precision: 'exact' },
      { exact: '2026-10-24T08:00:00.000001Z', date: null, precision: 'exact' },
      { exact: null, date: '2026-10-24', precision: 'date' },
      { exact: '2026-10-23T23:59:59Z', date: null, precision: 'exact' },
      { exact: null, date: null, precision: 'unknown' },
      { exact: null, date: null, precision: 'unknown' },
    ];
    for (const [index, publication] of publications.entries()) {
      await admin`insert into jobs(id,company_id,source_id,canonical_url,title,role,education,recruitment_type,description_md,published_at,published_date,published_precision,last_seen_at,verified_at,status,content_hash) values(${ids[index]}::uuid,${companyId}::uuid,${sourceId}::uuid,${'https://example.invalid/' + ids[index]},'Precision fixture','other',null,'campus','Synthetic test fixture',${publication.exact}::text::timestamptz,${publication.date}::date,${publication.precision},now(),null,'open',${'0'.repeat(64)})`;
    }
  });
  afterAll(async () => {
    if (admin) {
      await admin`delete from jobs where source_id=${sourceId}::uuid`;
      await admin`delete from sources where id=${sourceId}::uuid`;
      await admin`delete from companies where id=${companyId}::uuid`;
      await admin.end();
    }
    vi.unstubAllEnvs();
  });

  it('visits exact microseconds, date-only and unknown rows exactly once', async () => {
    const collected: Job[] = [];
    let cursor: string | null = null;
    for (let page = 0; page < 10; page++) {
      const params = new URLSearchParams({ companyId, limit: '1' });
      if (cursor) params.set('cursor', cursor);
      const result = await databasePublicList('jobs', params);
      collected.push(...(result.data as Job[]));
      cursor = result.page.nextCursor;
      if (!result.page.hasMore) break;
    }
    expect(collected.map((job) => job.id)).toEqual([
      ...ids.slice(0, 4),
      ...ids.slice(4).sort().reverse(),
    ]);
    expect(collected[2]).toMatchObject({
      publishedAt: null,
      publishedDate: '2026-10-24',
      publishedPrecision: 'date',
    });
    expect(collected[4]).toMatchObject({
      publishedAt: null,
      publishedDate: null,
      publishedPrecision: 'unknown',
    });
    expect(new Set(collected.map((job) => job.id)).size).toBe(6);
  });

  it('supports deadline pagination when every official deadline is unknown', async () => {
    const seen: string[] = [];
    let cursor: string | null = null;
    for (let page = 0; page < 5; page++) {
      const params = new URLSearchParams({ companyId, limit: '2', sort: 'deadline' });
      if (cursor) params.set('cursor', cursor);
      const result = await databasePublicList('jobs', params);
      seen.push(...result.data.map((job) => job.id));
      cursor = result.page.nextCursor;
      if (!result.page.hasMore) break;
    }
    expect(seen).toEqual([...ids].sort());
  });
});
