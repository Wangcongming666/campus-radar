"""Single leader per database. Durable schedule and enqueue commit together."""
import logging
from datetime import datetime, timezone
import os
from threading import Event
import signal
import psycopg
from psycopg.rows import dict_row
from apscheduler.schedulers.background import BackgroundScheduler
from campus_worker.settings import Settings

LOCK_ID = 17456202
logger = logging.getLogger(__name__)


def tick(dsn: str, allowed_sources: tuple[str, ...]) -> int:
    if not allowed_sources:
        return 0
    # Transaction advisory lock prevents overlapping ticks across processes. All
    # decisions and mutations occur while the leader lock is held.
    with psycopg.connect(dsn, connect_timeout=5, row_factory=dict_row) as db:
        if not db.execute('SELECT pg_try_advisory_xact_lock(%s) AS leader', (LOCK_ID,)).fetchone()['leader']:
            return 0
        due = db.execute('''SELECT sch.source_id,sch.next_run_at FROM scheduled_sources sch
            JOIN sources s ON s.id=sch.source_id
            WHERE sch.next_run_at<=now() AND s.enabled AND s.permission_status='approved'
              AND s.company_id IS NOT NULL AND s.robots_checked_at IS NOT NULL
              AND length(trim(s.terms_note))>0 AND s.id::text=ANY(%s)
            ORDER BY sch.next_run_at FOR UPDATE OF sch SKIP LOCKED LIMIT 20''', (list(allowed_sources),)).fetchall()
        for row in due:
            db.execute('''INSERT INTO tasks(type,payload,dedup_key)
                VALUES('CRAWL_JOBS',jsonb_build_object('schemaVersion',1,'sourceId',%s::text),%s)
                ON CONFLICT(dedup_key) DO NOTHING''',
                (row['source_id'], f"crawl:{row['source_id']}:{row['next_run_at'].isoformat()}"))
            # Coalesce missed runs into one, never replay an outage backlog.
            db.execute('''UPDATE scheduled_sources SET next_run_at=now()+make_interval(secs=>interval_seconds),
                updated_at=now() WHERE source_id=%s''', (row['source_id'],))
        return len(due)


def main():
    logging.basicConfig(level=os.getenv('LOG_LEVEL', 'INFO'))
    settings = Settings.from_env()
    if not settings.scheduler_database_url:
        raise ValueError('SCHEDULER_DATABASE_URL is required')
    stop = Event()
    for sig in (signal.SIGINT, signal.SIGTERM):
        signal.signal(sig, lambda *_: stop.set())
    def safe_tick():
        try:
            tick(settings.scheduler_database_url, settings.allowed_sources)
        except Exception:
            logger.error('scheduler tick failed')
    scheduler = BackgroundScheduler(timezone='UTC')
    scheduler.add_job(safe_tick, 'interval', seconds=30, coalesce=True, max_instances=1,
                      misfire_grace_time=30, next_run_time=datetime.now(timezone.utc))
    scheduler.start()
    try:
        stop.wait()
    finally:
        scheduler.shutdown(wait=True)


if __name__ == '__main__':
    main()
