#!/usr/bin/env node
/** Offline administrator import of the reviewed 2026-10-24 artifact only. */
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { parseArgs } from 'node:util';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { z } from 'zod';
import { SOURCE_ID, listUrl, sha256 } from '../workers/official-sources/xiaomi.mjs';

export const REVIEWED_ARTIFACT_SHA256 =
  '742e3beb233ad618426cc9797cfd734d2652884be25a4147402cfd918dd392d0';
export const COMPANY_ID = stableId('official-company:xiaomi');
export const SOURCE_UUID = stableId(SOURCE_ID);
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const timestamp = z.iso.datetime({ offset: true });
const date = z.iso.date();
const metadataJobSchema = z.strictObject({
  externalId: z.string().regex(/^\d+$/),
  canonicalUrl: z.url(),
  title: z.string().min(1).max(300),
  recruitmentType: z.enum(['campus', 'internship']),
  cities: z.array(z.string().min(1).max(100)).max(30),
  department: z.string().max(200).nullable(),
  publishedAt: z.null(),
  publishedDate: date.nullable(),
  publishedPrecision: z.enum(['date', 'unknown']),
  deadlineAt: z.null(),
  deadlinePrecision: z.literal('unknown'),
  sourceTimezone: z.literal('Asia/Shanghai'),
  observedAt: timestamp,
  status: z.literal('open'),
  education: z.literal('any'),
  graduationYears: z.array(z.never()).length(0),
  skills: z.array(z.never()).length(0),
  salary: z.null(),
  role: z.literal('其他'),
  descriptionMd: z.string().max(400),
  contentHash: digest,
});
const pageSchema = z.strictObject({
  endpoint: z.url(),
  observedAt: timestamp,
  responseSha256: digest,
  reportedTotal: z.number().int().nonnegative(),
  collected: z.literal(10),
  pageNum: z.literal(1),
  pageSize: z.literal(10),
});
export const officialArtifactSchema = z.strictObject({
  schemaVersion: z.literal(1),
  sourceId: z.literal(SOURCE_ID),
  company: z.strictObject({
    name: z.literal('小米'),
    officialWebsite: z.literal('https://www.mi.com'),
  }),
  collectedAt: timestamp,
  contentMode: z.literal('metadata_only'),
  coverage: z.string().min(1).max(300),
  provenance: z.strictObject({
    sourcePage: z.literal('https://hr.xiaomi.com/website/opportunities.html'),
    robotsUrl: z.literal('https://hr.xiaomi.com/robots.txt'),
    robots: z.strictObject({
      status: z.literal(404),
      result: z.literal('unavailable_no_rules'),
      sha256: digest,
    }),
    rulesReviewedAt: z.literal('2026-10-24'),
    visiblePolicyUrl: z.literal('https://privacy.mi.com/XiaomiZhaopin/zh_CN/'),
    rulesNote: z.string().min(100).max(2000),
    parameterEvidenceUrl: z.literal('https://hr.xiaomi.com/website/assets/js/jobs.js'),
    parameterEvidenceSha256: digest,
    pages: z.array(pageSchema).length(2),
  }),
  jobs: z.array(metadataJobSchema).length(20),
});

function stableId(value) {
  const s = createHash('sha256').update(value).digest('hex');
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-4${s.slice(13, 16)}-a${s.slice(17, 20)}-${s.slice(20, 32)}`;
}

export function validateArtifact(input) {
  const artifact = officialArtifactSchema.parse(input);
  const seen = new Set();
  const collected = Date.parse(artifact.collectedAt);
  for (const type of ['campus', 'internship']) {
    const matchingPages = artifact.provenance.pages.filter(
      (page) => page.endpoint === listUrl(type),
    );
    const matchingJobs = artifact.jobs.filter((job) => job.recruitmentType === type);
    if (matchingPages.length !== 1 || matchingJobs.length !== 10)
      throw new Error('Expected exactly one reviewed page and ten rows per type');
    const page = matchingPages[0];
    if (Date.parse(page.observedAt) > collected || !page.observedAt.startsWith('2026-10-24T'))
      throw new Error('Invalid collection provenance time');
    for (const job of matchingJobs) {
      const url = new URL(job.canonicalUrl);
      if (
        url.origin !== 'https://xiaomi.jobs.f.mioffice.cn' ||
        url.username ||
        url.password ||
        url.search ||
        url.hash ||
        !new RegExp(`^/[a-z]+/position/${job.externalId}/detail$`).test(url.pathname)
      )
        throw new Error('Invalid official detail URL');
      if (
        job.observedAt !== page.observedAt ||
        (job.publishedPrecision === 'unknown') !== (job.publishedDate === null)
      )
        throw new Error('Invalid date/observation precision');
      const originalSummary = `小米官方${type === 'campus' ? '校园招聘' : '实习'}岗位；工作地点：${job.cities.join('、') || '官网未注明'}。岗位职责和申请条件请查看官方详情。`;
      if (job.descriptionMd !== originalSummary)
        throw new Error('Only the original metadata summary may be imported');
      const { contentHash, ...content } = job;
      if (sha256(JSON.stringify({ ...content, observedAt: undefined })) !== contentHash)
        throw new Error('Metadata content hash mismatch');
      if (seen.has(job.externalId) || seen.has(job.canonicalUrl))
        throw new Error('Duplicate source job identity');
      seen.add(job.externalId);
      seen.add(job.canonicalUrl);
    }
  }
  return artifact;
}

export function readReviewedArtifact(text) {
  if (sha256(text) !== REVIEWED_ARTIFACT_SHA256)
    throw new Error(
      'Artifact differs from the reviewed 2026-10-24 acquisition; a new source review is required',
    );
  return validateArtifact(JSON.parse(text));
}

// SQL travels to psql over stdin, never a shell string. Standard-conforming
// strings plus doubled apostrophes preserve every title/JSON byte literally.
export const sqlLiteral = (value) =>
  value === null ? 'NULL' : `'${String(value).replaceAll("'", "''")}'`;
const jsonSql = (value) => `${sqlLiteral(JSON.stringify(value))}::jsonb`;
const textArray = (values) => `ARRAY[${values.map(sqlLiteral).join(',')}]::text[]`;

export function buildImportSql(input) {
  const artifact = validateArtifact(input);
  const companyId = `(SELECT id FROM companies WHERE slug='xiaomi')`;
  const termsNote =
    'Internal review limited to public job metadata and official links on 2026-10-24. Official robots.txt returned HTTP 404. Public footer links the candidate privacy policy v20251009; it does not grant crawling or JD redistribution authorization. No full JD is copied. Source remains disabled; no recurring worker/schedule is enabled.';
  const rows = artifact.jobs.map((job) => {
    const page = artifact.provenance.pages.find(
      (entry) => entry.endpoint === listUrl(job.recruitmentType),
    );
    const observationId = sha256(
      [SOURCE_ID, page.endpoint, page.responseSha256, job.observedAt].join('|'),
    );
    return {
      ...job,
      observationId,
      provenance: {
        schemaVersion: 1,
        contentMode: 'metadata_only',
        sourceIdentifier: SOURCE_ID,
        reviewedArtifactSha256: REVIEWED_ARTIFACT_SHA256,
        coverage: artifact.coverage,
        verificationScope:
          'Job title, recruitment type, location and official link observed in the public official list. Not verification of the complete JD, eligibility or application availability.',
        sourceReview: artifact.provenance,
        sourceMetadata: {
          department: job.department,
          originalEducation: null,
          publishedDate: job.publishedDate,
          publishedPrecision: job.publishedPrecision,
        },
        observations: {
          [observationId]: {
            observationId,
            endpoint: page.endpoint,
            observedAt: job.observedAt,
            responseSha256: page.responseSha256,
            sourceExternalId: job.externalId,
            canonicalUrl: job.canonicalUrl,
          },
        },
      },
    };
  });
  // Keep JSON outside dollar-quoted procedural bodies: a title containing a
  // dollar delimiter must remain data rather than terminate the function body.
  const dataSql = jsonSql(rows);
  return `BEGIN;
SET LOCAL standard_conforming_strings=on;
SELECT pg_advisory_xact_lock(1745620908);
INSERT INTO companies(id,slug,name,locations,tags,description,verified_at)
VALUES(${sqlLiteral(COMPANY_ID)}::uuid,'xiaomi','小米','{}','{}','小米官方招聘网站公开发布校园招聘和实习岗位。',NULL)
ON CONFLICT(slug) DO NOTHING;
DO $source_guard$ BEGIN
  IF NOT EXISTS(SELECT 1 FROM companies WHERE slug='xiaomi' AND name IN ('小米','小米集团')) THEN
    RAISE EXCEPTION 'Existing company identity conflicts with reviewed Xiaomi source';
  END IF;
END $source_guard$;
INSERT INTO sources(id,name,base_url,allowed_hosts,company_id,robots_checked_at,permission_status,terms_note,allowed_content_mode,rate_policy,enabled,entry_mode)
VALUES(${sqlLiteral(SOURCE_UUID)}::uuid,'小米官方公开岗位（仅元数据）','https://hr.xiaomi.com/website/opportunities.html',ARRAY['hr.xiaomi.com','xiaomi.jobs.f.mioffice.cn'],${companyId},${sqlLiteral(artifact.collectedAt)}::timestamptz,'approved',${sqlLiteral(termsNote)},'metadata_only',${jsonSql({ schemaVersion: 1, adapter: SOURCE_ID, delaySeconds: 6.5, concurrency: 1, pageSize: 10, maxPagesPerType: 1, scheduleEnabled: false })},false,'official')
ON CONFLICT(id) DO NOTHING;
DO $source_guard$ BEGIN
  IF NOT EXISTS(SELECT 1 FROM sources WHERE id=${sqlLiteral(SOURCE_UUID)}::uuid
    AND company_id=${companyId} AND entry_mode='official' AND allowed_content_mode='metadata_only'
    AND base_url='https://hr.xiaomi.com/website/opportunities.html' AND NOT enabled) THEN
    RAISE EXCEPTION 'Existing source identity or permission conflicts with reviewed metadata-only source';
  END IF;
END $source_guard$;
CREATE TEMP TABLE campus_official_job_import ON COMMIT DROP AS
SELECT value FROM jsonb_array_elements(${dataSql});
DO $import$
DECLARE job jsonb; target uuid; matching_count int;
BEGIN
  FOR job IN SELECT value FROM pg_temp.campus_official_job_import LOOP
    SELECT count(*),min(id::text)::uuid INTO matching_count,target FROM jobs
      WHERE source_id=${sqlLiteral(SOURCE_UUID)}::uuid
      AND (source_external_id=job->>'externalId' OR canonical_url=job->>'canonicalUrl');
    IF matching_count>1 THEN RAISE EXCEPTION 'Conflicting external ID and canonical URL; no rows were imported'; END IF;
    IF target IS NULL THEN
      INSERT INTO jobs(company_id,source_id,source_external_id,canonical_url,title,role,cities,education,recruitment_type,graduation_years,skills,description_md,salary,deadline_at,deadline_precision,source_timezone,published_at,published_date,published_precision,last_seen_at,verified_at,status,content_hash,provenance)
      VALUES(${companyId},${sqlLiteral(SOURCE_UUID)}::uuid,job->>'externalId',job->>'canonicalUrl',job->>'title','other',ARRAY(SELECT jsonb_array_elements_text(job->'cities')),NULL,(job->>'recruitmentType')::recruitment_type,'{}','{}',job->>'descriptionMd',NULL,NULL,'unknown','Asia/Shanghai',NULL,(job->>'publishedDate')::date,job->>'publishedPrecision',(job->>'observedAt')::timestamptz,(job->>'observedAt')::timestamptz,'open',job->>'contentHash',job->'provenance');
    ELSE
      -- Never overwrite known qualifications, salary, deadline, exact publication
      -- time, user links or relationships with this metadata-only observation.
      UPDATE jobs j SET source_external_id=job->>'externalId',canonical_url=job->>'canonicalUrl',
        title=job->>'title',cities=ARRAY(SELECT jsonb_array_elements_text(job->'cities')),
        recruitment_type=(job->>'recruitmentType')::recruitment_type,
        description_md=CASE WHEN j.provenance->>'contentMode'='metadata_only' THEN job->>'descriptionMd' ELSE j.description_md END,
        published_date=CASE WHEN j.published_precision='exact' THEN j.published_date ELSE (job->>'publishedDate')::date END,
        published_precision=CASE WHEN j.published_precision='exact' THEN 'exact' ELSE job->>'publishedPrecision' END,
        last_seen_at=greatest(j.last_seen_at,(job->>'observedAt')::timestamptz),
        verified_at=greatest(j.verified_at,(job->>'observedAt')::timestamptz),
        status='open',content_hash=job->>'contentHash',
        provenance=j.provenance || (job->'provenance') || jsonb_build_object('observations',coalesce(j.provenance->'observations','{}'::jsonb) || (job->'provenance'->'observations')),
        updated_at=CASE WHEN j.content_hash IS DISTINCT FROM job->>'contentHash' OR NOT (coalesce(j.provenance->'observations','{}'::jsonb) ? (job->>'observationId')) THEN now() ELSE j.updated_at END
      WHERE j.id=target AND j.company_id=${companyId};
      IF NOT FOUND THEN RAISE EXCEPTION 'Existing job company mismatch; no rows were imported'; END IF;
    END IF;
  END LOOP;
END $import$;
SELECT ${sqlLiteral(SOURCE_UUID)} AS source_id,count(*) AS imported_rows,
  count(*) FILTER(WHERE published_at IS NULL AND published_precision='date') AS date_only_rows
FROM jobs WHERE source_id=${sqlLiteral(SOURCE_UUID)}::uuid;
COMMIT;
`;
}

async function main() {
  const { values } = parseArgs({
    options: {
      artifact: { type: 'string' },
      'sql-output': { type: 'string' },
      apply: { type: 'boolean', default: false },
      container: { type: 'string' },
    },
    strict: true,
  });
  if (
    !values.artifact ||
    !!values['sql-output'] === values.apply ||
    (values.apply && !values.container)
  )
    throw new Error(
      'Use --artifact PATH with either --sql-output PATH or --apply --container LOCAL_CONTAINER',
    );
  const artifact = readReviewedArtifact(await readFile(resolve(values.artifact), 'utf8'));
  const sql = buildImportSql(artifact);
  if (values['sql-output']) {
    await writeFile(resolve(values['sql-output']), sql, { flag: 'wx', mode: 0o600 });
    console.log(
      JSON.stringify({
        expectedRows: 20,
        databaseWrites: 0,
        sqlOutput: resolve(values['sql-output']),
      }),
    );
  } else {
    if (!/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,100}$/.test(values.container))
      throw new Error('Invalid container name');
    const result = spawnSync(
      'docker',
      [
        'exec',
        '-i',
        values.container,
        'psql',
        '-X',
        '-U',
        'postgres',
        '-d',
        'campus_radar',
        '-v',
        'ON_ERROR_STOP=1',
      ],
      { input: sql, encoding: 'utf8', maxBuffer: 1024 * 1024 },
    );
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(result.stderr || 'Administrator import failed');
    console.log(result.stdout);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
