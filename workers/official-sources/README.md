# Xiaomi public metadata acquisition

Reviewed 2026-10-24. This is a **single acquisition/export**, separate from the
licensed full-JD Scrapy feed. No database writes or recurring schedule are enabled.

## Source/rule evidence

- Official page: https://hr.xiaomi.com/website/opportunities.html
- Script actually loaded by that page: https://hr.xiaomi.com/website/assets/js/jobs.js
- The script explicitly maps 校招 to `type=2`, 实习 to `type=3`, and constructs
  `GET /website/api/agent/searchJobPage?keyword=&cityZhNames=&pageSize=10&pageNum=1&type=2`.
- https://hr.xiaomi.com/robots.txt returned a real HTTP 404 on review. This means
  no robots file was available; it is **not** a content redistribution license.
  Every run fetches robots again and fails on 401/403/429, outages, redirects,
  HTML masquerading as robots, or applicable Disallow rules.
- The official footer links https://privacy.mi.com/XiaomiZhaopin/zh_CN/
  (v20251009). This is the recruitment privacy policy for candidate data; it
  does not grant permission to republish JDs. No separate public terms link was
  visible in the reviewed public page/footer. This is a limited source review,
  not a claim of express site authorization or an exhaustive legal opinion.
- Detail URLs returned by this official list point to Xiaomi's recruiting site
  `https://xiaomi.jobs.f.mioffice.cn/.../position/<id>/detail`. Those URLs are
  retained as references only; the collector does not request that host.

Only factual metadata, an original metadata summary, official links, hashes and
collection time are exported. Full `description` and `requirement` values from
the response are discarded. No candidate data, login, cookies, retries, proxy
rotation, browser automation or captcha handling is used. API data is public
website backing data, **not** an authenticated partner API integration.

The public response supplies a date-only `publishTime`. The artifact retains it
as `publishedDate` with `publishedPrecision=date` and leaves `publishedAt=null`.
Absent deadlines remain null/unknown. Graduation year and qualifications are
not inferred from the recruitment program or title. Each record carries an
`observedAt`; top-level provenance records exact endpoint and response SHA-256.

## One reviewed export

```sh
node --test workers/official-sources/xiaomi.test.mjs
# Node 24. CA verification remains enabled; use system CA if your corporate
# network's root is already installed in the operating system trust store.
NODE_USE_SYSTEM_CA=1 node scripts/import-official-xiaomi.mjs \
  --allow-source=xiaomi_official_public_v1 \
  --output=workers/artifacts/official-xiaomi-2026-10-24.json
```

If the environment requires its configured `HTTP_PROXY`/`HTTPS_PROXY`, Node 24
can additionally use `NODE_USE_ENV_PROXY=1`; this honors the existing network
configuration and does not rotate proxies or disable TLS verification.

The script uses exact host/path allowlists, concurrency one, at least 6.5 seconds
between requests, no redirects or retries, first page only, ten jobs per type,
an exclusive local lock and a persistent one-hour cooldown between attempts.
It fetches at most one campus and one internship page. Output files cannot be
overwritten. `workers/artifacts/.xiaomi-acquire-state.json` records an attempted
run even if the source becomes unavailable. Do not erase it to evade a source
limit. A crash may leave the lock; inspect process state before removing it.

This is **partial coverage**. Do not close unseen jobs or tell users that the
export is a complete inventory. The exported rows are intentionally not the
existing `CrawlJob` DTO: company identity is assigned by the importing backend,
and date precision must be preserved rather than fabricating a timestamp.
The importing backend must explicitly allow `metadata_only` content.

## Offline administrator import (run separately after review)

Apply `database/migrations/0008_official_job_dates.sql` through the existing
migration ledger first. It adds nullable publication timestamps, date/precision,
unknown education and provenance; exact legacy timestamps retain their source
calendar date. Runtime Web/worker credentials do not gain administrator access.

The importer accepts only this reviewed artifact's exact SHA-256, then validates
its strict schema, official endpoint/link origins, metadata hashes, page hashes
and observation consistency. A new acquisition requires a new explicit review
instead of silently widening this allowlist.

Generate SQL for review without database access:

```sh
node scripts/load-official-jobs.mjs \
  --artifact workers/artifacts/official-xiaomi-2026-10-24.json \
  --sql-output /private/tmp/campus-official-xiaomi.sql
```

The administrator can then run it against the existing local Docker PostgreSQL
container, after substituting the container's verified name:

```sh
node scripts/load-official-jobs.mjs \
  --artifact workers/artifacts/official-xiaomi-2026-10-24.json \
  --apply --container campus-radar-postgres-1
```

Expected first import: **20 rows**, all `published_at IS NULL`, publication
precision `date`, education NULL, deadline unknown; 10 campus and 10 internship.
Company/source creation preserves existing company metadata. Job matching uses
source external ID or official URL; conflicting identities abort the transaction.
Reimporting does not duplicate rows or source observations and does not delete or
close unseen jobs. Unknown incoming qualifications, salary and deadline never
replace existing known fields. The source remains `enabled=false` and no schedule
is created. Its `approved` status records only the internal metadata review,
not authorization by Xiaomi to reproduce job descriptions.

`verified_at` records observation of metadata on the official public list; each
job's provenance states this limited scope and retains the source review, source
response hash and deterministic observation ID. It does not claim that the full
JD or application availability was independently verified.

```sh
node --test workers/official-sources/*.test.mjs
npm run test --workspace=@campus-radar/web -- server/official-dates.test.ts
# Optional, only after migrating a disposable local test database:
API_INTEGRATION_DATABASE_URL=... DATABASE_URL=... \
  npm run test --workspace=@campus-radar/web -- server/official-dates.test.ts
```

The PostgreSQL test uses temporary UUID fixtures, exercises one-row pages across
microsecond timestamps, date-only values and unknown dates, then removes only its
own fixtures. Without its database environment variable it is explicitly skipped.
