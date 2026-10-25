import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import {
  REVIEWED_ARTIFACT_SHA256,
  SOURCE_UUID,
  buildImportSql,
  readReviewedArtifact,
  sqlLiteral,
  validateArtifact,
} from '../../scripts/load-official-jobs.mjs';
import { sha256 } from './xiaomi.mjs';

const artifactText = await readFile(
  fileURLToPath(new URL('../artifacts/official-xiaomi-2026-10-24.json', import.meta.url)),
  'utf8',
);
const artifact = JSON.parse(artifactText);
const copy = () => structuredClone(artifact);

test('loads only the pinned reviewed real artifact with exactly twenty metadata rows', () => {
  assert.equal(sha256(artifactText), REVIEWED_ARTIFACT_SHA256);
  assert.equal(readReviewedArtifact(artifactText).jobs.length, 20);
  assert.throws(() => readReviewedArtifact(artifactText + ' '), /differs from/);
  assert.throws(() => validateArtifact({ ...artifact, jobs: [] }));
});

test('rejects unreviewed domains, foreign list parameters and fabricated date/time', () => {
  for (const change of [
    (a) => {
      a.jobs[0].canonicalUrl = 'https://evil.test/position/1/detail';
    },
    (a) => {
      a.provenance.pages[0].endpoint = a.provenance.pages[0].endpoint.replace('type=2', 'type=1');
    },
    (a) => {
      a.jobs[0].publishedAt = '2026-10-24T00:00:00Z';
    },
    (a) => {
      a.jobs[0].observedAt = '2026-10-25T00:00:00Z';
    },
    (a) => {
      a.jobs[0].publishedPrecision = 'unknown';
    },
    (a) => {
      a.jobs[0].description = 'FULL JD';
    },
    (a) => {
      a.jobs[0].descriptionMd = 'FULL JD';
    },
    (a) => {
      a.jobs[1] = a.jobs[0];
    },
  ]) {
    const a = copy();
    change(a);
    assert.throws(() => validateArtifact(a));
  }
});

test('SQL quotes apostrophes and dollar delimiters without a shell or procedural injection', () => {
  assert.equal(sqlLiteral("O'Reilly\\notes $import$"), "'O''Reilly\\notes $import$'");
  const a = copy();
  a.jobs[0].title = "O'Reilly $import$; DROP TABLE users; --";
  const { contentHash, ...content } = a.jobs[0];
  a.jobs[0].contentHash = sha256(JSON.stringify({ ...content, observedAt: undefined }));
  const sql = buildImportSql(a);
  const jsonEnd = sql.indexOf('DO $import$');
  assert.ok(sql.slice(0, jsonEnd).includes("O''Reilly $import$; DROP TABLE users; --"));
  assert.equal(sql.slice(jsonEnd).includes("O''Reilly"), false);
});

test('import is a single isolated metadata-only transaction and never closes unseen jobs', () => {
  const sql = buildImportSql(artifact);
  assert.ok(sql.startsWith('BEGIN;'));
  assert.ok(sql.endsWith('COMMIT;\n'));
  assert.ok(sql.includes(SOURCE_UUID));
  assert.ok(sql.includes("'metadata_only'"));
  assert.ok(sql.includes("false,'official'"));
  assert.ok(sql.includes('ON CONFLICT(slug) DO NOTHING'));
  assert.ok(
    sql.includes("source_external_id=job->>'externalId' OR canonical_url=job->>'canonicalUrl'"),
  );
  assert.ok(sql.includes("job->'provenance'->'observations'"));
  assert.equal(
    /\bDELETE\s+FROM|\bTRUNCATE|status\s*=\s*'closed'|INSERT\s+INTO\s+scheduled_sources/i.test(sql),
    false,
  );
  assert.ok(sql.includes("NULL,(job->>'publishedDate')::date"));
});
