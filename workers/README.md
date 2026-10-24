# Campus Radar worker

Python 3.11+ (container: 3.12). FastAPI is a private control plane; tasks run in
a separate executor. No `BackgroundTasks` or in-memory queue is used for durable work.

## Local start

From the repository root:

```sh
python3 -m venv workers/.venv
workers/.venv/bin/pip install -r workers/requirements.txt
cp .env.example .env
# Docker must be running. This initializes a new local volume only.
docker compose --env-file .env -f infrastructure/docker-compose.yml up --build -d
curl http://127.0.0.1:8000/health/live
curl http://127.0.0.1:8000/health/ready
```

Compose uses explicitly local development passwords and a local control token;
all ports bind loopback. Replace them for shared environments. Existing volumes
are not automatically migrated. Never delete a production volume to apply a
migration. Set real credentials outside the repository.

Without containers, export the variables in `.env` through your shell and run
these as three independent processes from `workers/`:

```sh
.venv/bin/python -m uvicorn campus_worker.api.app:app --host 127.0.0.1 --port 8000
.venv/bin/python -m campus_worker.executor.runner
.venv/bin/python -m campus_worker.scheduler.main
```

`GET /internal/tasks/{uuid}` and `POST /internal/tasks/{uuid}/cancel` require
`Authorization: Bearer $WORKER_CONTROL_TOKEN` (at least 32 characters). Liveness
works without a database; readiness checks migrated task-table access. Do not
publish this service to the public internet. The executor handles SIGINT/SIGTERM;
unfinished leases expire and are reclaimed after restart.

## Database

The migration owner applies `database/migrations/0001_mvp.sql` then
`0003_runtime_boundaries.sql` then `0004_stage_order_snapshots.sql` once. `0002_vector_capability.sql` is an **optional
V2** migration requiring a pgvector distribution; local MVP does not run it.
There is one SQL migration source for Web and Python. Runtime roles are non-owner
and do not have BYPASSRLS. Local bootstrap creates separate login members of
`campus_web`, `campus_worker`, and `campus_scheduler`. Authentication helper
functions have pinned search paths and revoked public execution. Their owner
must be the trusted migration role with BYPASSRLS, as in local `postgres`.

The executor claims with `SKIP LOCKED`, fresh lease token, 60-second leases and
20-second heartbeat. Cancellation immediately revokes tokens. Every completion,
retry, callback, and run write verifies the current lease. Retries are bounded
exponential backoff with jitter; permanent configuration/input errors do not
retry. Delivery is at least once. A callback retries exact bytes with stable
batch ID and fresh signature nonce; the Web receiver must commit ingestion and
batch deduplication atomically. Scheduler ticks use a transaction advisory lock,
durable `scheduled_sources.next_run_at`, and deterministic enqueue keys. Missed
runs coalesce into one. Task payloads contain IDs, never personal documents or keys.

## Approved-source adapter (disabled by default)

No real recruiting site is enabled or contacted by tests/startup. Both
`CRAWL_ALLOWED_SOURCES` (comma-separated UUIDs) and an approved, enabled Source
record are required. Compose deliberately forces an empty allowlist. Review
robots, terms, redistribution rights, allowed hosts and company identity first.
For full job descriptions, explicitly set `allowed_content_mode=licensed_full`.
Set `rate_policy` to `{ "schemaVersion":1, "adapter":"official_json_v1",
"delaySeconds":6, "concurrency":1 }` only for an approved **official normalized
JSON feed**, and insert its durable schedule using the migration/admin role.
The feed is `{ "jobs": [CrawlJob, ...] }`, validated against the copied OpenAPI
schema in `workers/contracts/`; maximum 1000 jobs per response. This adapter does
not implement Tencent/ByteDance site-specific pagination or presume permission.

Scrapy obeys robots, uses HTTPS allowlisted origins, global-DNS destination checks,
concurrency one, minimum six-second delay plus positive jitter, AutoThrottle,
no login/cookies/proxy rotation and no automatic HTTP retries. A 403/429 pauses
the source. Other failures are recorded as task failures. Production requires a
network egress policy to cover DNS rebinding races and metadata/private-network
ranges. Response and subprocess sizes/time are bounded. Callback uses the
OpenAPI HMAC raw-body contract and refuses redirects. Configure the Web receiver,
`WEB_INTERNAL_ORIGIN`, `WORKER_HMAC_KEY_ID`, and a >=32-byte HMAC key before use.

## Explicit capability boundaries

`DATA_EXPORT` and `USER_ERASURE` currently fail permanently with
`DATA_EXPORT_NOT_CONFIGURED` / `USER_ERASURE_NOT_CONFIGURED`; neither reports
false success or partially deletes an account. Web endpoints should stay disabled
until private object storage, expiring signed links, identity-provider deletion,
and an audited retention flow are integrated. Unknown types fail
`UNSUPPORTED_TASK_TYPE`. AI transport requires explicit HTTPS base/key/model and
returns configuration/upstream errors. It is not wired to MVP execution; V2 must
add consent, budget reservation, JSON output validation and model/version caching
before enabling paid AI. No tests perform real crawling or paid model calls.

## Verify

```sh
PYTHONPATH=workers workers/.venv/bin/python -m unittest discover -s workers/campus_worker/tests -v
# Optional integration tests: disposable migrated PostgreSQL only, migration owner.
TEST_DATABASE_URL=postgresql://postgres:localownerpassword@localhost:54322/campus_radar \
PYTHONPATH=workers workers/.venv/bin/python -m unittest discover -s workers/campus_worker/tests -v
```

Without `TEST_DATABASE_URL`, real PostgreSQL tests are explicitly skipped; unit
checks do not prove production DB grants/locking. Integration tests create UUID
fixtures and remove only those rows. Never target production.
