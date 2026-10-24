"""At-least-once execution with fresh lease fencing on every write.

Connections are deliberately short-lived. Work is never performed while a
claim transaction holds locks. Do not use a table-owner DSN in a deployment.
"""
from uuid import UUID
import psycopg
from psycopg.rows import dict_row
from psycopg.types.json import Jsonb
from campus_worker.executor.retry import retry_delay


class TaskQueue:
    def __init__(self, dsn: str):
        if not dsn:
            raise ValueError('WORKER_DATABASE_URL is required')
        self.dsn = dsn

    def connect(self):
        return psycopg.connect(self.dsn, connect_timeout=5, row_factory=dict_row)

    def ready(self) -> bool:
        with self.connect() as db:
            # Validate migrations and SELECT permission, beyond TCP availability.
            db.execute('SELECT id FROM tasks LIMIT 0')
        return True

    def enqueue(self, task_type: str, payload: dict, dedup_key: str, *,
                user_id: UUID | None = None, max_attempts: int = 3):
        if payload.get('schemaVersion') != 1:
            raise ValueError('schemaVersion must be 1')
        with self.connect() as db:
            row = db.execute('''
                INSERT INTO tasks(type,payload,dedup_key,user_id,max_attempts)
                VALUES(%s,%s,%s,%s,%s)
                ON CONFLICT(dedup_key) DO UPDATE SET dedup_key=EXCLUDED.dedup_key
                WHERE tasks.type=EXCLUDED.type AND tasks.payload=EXCLUDED.payload
                  AND tasks.user_id IS NOT DISTINCT FROM EXCLUDED.user_id
                RETURNING *
            ''', (task_type, Jsonb(payload), dedup_key, user_id, max_attempts)).fetchone()
            if row is None:
                raise ValueError('Deduplication key already belongs to another input')
            return row

    def get(self, task_id: UUID):
        with self.connect() as db:
            return db.execute('SELECT * FROM tasks WHERE id=%s', (task_id,)).fetchone()

    def claim(self, owner: str, *, lease_seconds: int = 60, task_id: UUID | None = None):
        if not owner or not 1 <= lease_seconds <= 3600:
            raise ValueError('Invalid owner or lease duration')
        with self.connect() as db:
            return db.execute('''
                WITH candidate AS (
                  SELECT id FROM tasks
                  WHERE state='queued' AND available_at<=now() AND attempt<max_attempts
                    AND (expires_at IS NULL OR expires_at>now())
                    AND (%s::uuid IS NULL OR id=%s)
                  ORDER BY available_at,created_at,id FOR UPDATE SKIP LOCKED LIMIT 1
                )
                UPDATE tasks t SET state='running',attempt=attempt+1,lease_owner=%s,
                  lease_token=gen_random_uuid(),lease_until=now()+make_interval(secs=>%s),updated_at=now()
                FROM candidate c WHERE t.id=c.id RETURNING t.*
            ''', (task_id, task_id, owner, lease_seconds)).fetchone()

    def heartbeat(self, task_id: UUID, token: UUID, *, lease_seconds: int = 60) -> bool:
        if not 1 <= lease_seconds <= 3600:
            raise ValueError('Invalid lease duration')
        with self.connect() as db:
            return db.execute('''
                UPDATE tasks SET lease_until=now()+make_interval(secs=>%s),updated_at=now()
                WHERE id=%s AND state='running' AND lease_token=%s AND lease_until>now()
                  AND (expires_at IS NULL OR expires_at>now())
            ''', (lease_seconds, task_id, token)).rowcount == 1

    def finish(self, task_id: UUID, token: UUID, result_ref: dict) -> bool:
        if result_ref.get('schemaVersion') != 1:
            raise ValueError('schemaVersion must be 1')
        with self.connect() as db:
            return db.execute('''
                UPDATE tasks SET state='succeeded',result_ref=%s,progress=100,error_code=NULL,
                  lease_owner=NULL,lease_token=NULL,lease_until=NULL,updated_at=now()
                WHERE id=%s AND state='running' AND lease_token=%s AND lease_until>now()
                  AND (expires_at IS NULL OR expires_at>now())
            ''', (Jsonb(result_ref), task_id, token)).rowcount == 1

    def fail(self, task_id: UUID, token: UUID, error_code: str, *, retryable: bool = True) -> bool:
        with self.connect() as db:
            row = db.execute('''SELECT attempt FROM tasks WHERE id=%s AND state='running'
                AND lease_token=%s AND lease_until>now() FOR UPDATE''', (task_id, token)).fetchone()
            if row is None:
                return False
            return db.execute('''
                UPDATE tasks SET state=CASE WHEN %s AND attempt<max_attempts
                  AND (expires_at IS NULL OR expires_at>now()) THEN 'queued'::task_state ELSE 'failed'::task_state END,
                  available_at=now()+make_interval(secs=>%s),error_code=%s,
                  lease_owner=NULL,lease_token=NULL,lease_until=NULL,updated_at=now()
                WHERE id=%s AND lease_token=%s
            ''', (retryable, retry_delay(row['attempt']), error_code[:80], task_id, token)).rowcount == 1

    def cancel(self, task_id: UUID) -> bool:
        with self.connect() as db:
            return db.execute('''UPDATE tasks SET state='cancelled',lease_owner=NULL,
                lease_token=NULL,lease_until=NULL,error_code='CANCELLED',updated_at=now()
                WHERE id=%s AND state IN ('queued','running')''', (task_id,)).rowcount == 1

    def recover_expired(self) -> int:
        with self.connect() as db:
            # One UPDATE safely revokes old tokens, includes exhausted attempts.
            recovered = db.execute('''
                UPDATE tasks SET state=CASE WHEN attempt<max_attempts
                    AND (expires_at IS NULL OR expires_at>now()) THEN 'queued'::task_state ELSE 'failed'::task_state END,
                  available_at=now()+make_interval(secs=>least(300,power(2,least(attempt,9)))+random()),
                  lease_owner=NULL,lease_until=NULL,lease_token=NULL,error_code='LEASE_EXPIRED',updated_at=now()
                WHERE state='running' AND (lease_until<=now() OR expires_at<=now())
            ''').rowcount + db.execute('''
                UPDATE tasks SET state='failed',error_code='TASK_EXPIRED',updated_at=now()
                WHERE state='queued' AND (expires_at<=now() OR attempt>=max_attempts)
            ''').rowcount
            db.execute("""UPDATE crawl_runs r SET status=CASE WHEN t.state='cancelled' THEN 'cancelled'::task_state ELSE 'failed'::task_state END,
                error_code=coalesce(t.error_code,'TASK_ENDED'),finished_at=now(),updated_at=now()
                FROM tasks t WHERE r.task_id=t.id AND r.status='running' AND t.state!='running'""")
            return recovered

    def consume_nonce(self, key_id: str, nonce: str, expires: int) -> bool:
        with self.connect() as db:
            db.execute('DELETE FROM worker_nonces WHERE expires_at<now()')
            return db.execute('''INSERT INTO worker_nonces(key_id,nonce,expires_at)
                VALUES(%s,%s,to_timestamp(%s)) ON CONFLICT DO NOTHING''', (key_id, nonce, expires)).rowcount == 1

    def source(self, source_id: UUID):
        with self.connect() as db:
            return db.execute('SELECT * FROM sources WHERE id=%s', (source_id,)).fetchone()

    def pause_source(self, source_id: UUID, task_id: UUID, token: UUID):
        with self.connect() as db:
            valid = db.execute("""SELECT id FROM tasks WHERE id=%s AND lease_token=%s
                AND state='running' AND lease_until>now() AND (expires_at IS NULL OR expires_at>now()) FOR UPDATE""", (task_id, token)).fetchone()
            if valid:
                db.execute("UPDATE sources SET enabled=false,permission_status='paused',updated_at=now() WHERE id=%s", (source_id,))

    def begin_crawl(self, task_id: UUID, token: UUID, source_id: UUID):
        with self.connect() as db:
            task = db.execute('''SELECT id FROM tasks WHERE id=%s AND lease_token=%s
                AND state='running' AND lease_until>now() AND (expires_at IS NULL OR expires_at>now())
                AND type='CRAWL_JOBS' AND payload->>'sourceId'=%s FOR UPDATE''',
                (task_id, token, str(source_id))).fetchone()
            if task is None:
                return None
            # Previous attempts become visibly failed before starting a fresh run.
            db.execute("UPDATE crawl_runs SET status='failed',error_code='LEASE_REPLACED',finished_at=now(),updated_at=now() WHERE task_id=%s AND status='running'", (task_id,))
            return db.execute('INSERT INTO crawl_runs(source_id,task_id) VALUES(%s,%s) RETURNING id',
                              (source_id, task_id)).fetchone()['id']

    def fail_crawl(self, run_id: UUID, task_id: UUID, token: UUID):
        with self.connect() as db:
            # Lock task before run, same order as ingestion, and refuse stale writers.
            valid = db.execute('''SELECT id FROM tasks WHERE id=%s AND lease_token=%s
                AND state='running' AND lease_until>now() AND (expires_at IS NULL OR expires_at>now()) FOR UPDATE''', (task_id, token)).fetchone()
            if valid:
                db.execute("UPDATE crawl_runs SET status='failed',error_code='CRAWL_FAILED',finished_at=now(),updated_at=now() WHERE id=%s AND task_id=%s AND status='running'", (run_id, task_id))
