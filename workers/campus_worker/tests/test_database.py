"""Role boundary and scheduler tests against the disposable migrated database."""
import os
import unittest
from uuid import uuid4
from datetime import datetime, timezone, timedelta


@unittest.skipUnless(os.getenv('TEST_DATABASE_URL'), 'TEST_DATABASE_URL not configured; real Postgres required')
class DatabaseBoundaryTests(unittest.TestCase):
    def setUp(self):
        import psycopg
        self.db = psycopg.connect(os.environ['TEST_DATABASE_URL'], autocommit=True)
        self.user = uuid4()
        self.other = uuid4()
        self.hash = 'session-test-' + str(uuid4())
    def tearDown(self):
        self.db.execute('RESET ROLE')
        self.db.execute('DELETE FROM auth_sessions WHERE user_id=%s', (self.user,))
        self.db.execute('DELETE FROM tasks WHERE user_id=%s', (self.user,))
        self.db.execute('DELETE FROM users WHERE id=%s', (self.user,))
        self.db.execute('DELETE FROM app.rate_limit_buckets WHERE bucket=%s', (self.hash,))
        self.db.close()
    def test_bff_session_bootstrap_and_account_freeze(self):
        self.db.execute('SET ROLE campus_web')
        session = self.db.execute('SELECT app.create_auth_session(%s,%s,%s,%s,%s)',
                                 (self.user, 'Integration test', b'x' * 32, self.hash,
                                  datetime.now(timezone.utc) + timedelta(days=1))).fetchone()
        self.assertIsNotNone(session[0])
        self.assertEqual(self.db.execute('SELECT user_id FROM app.resolve_session(%s)', (self.hash,)).fetchone()[0], self.user)
        self.db.execute("SELECT set_config('app.user_id',%s,false)", (str(self.user),))
        self.db.execute('SELECT app.freeze_user(%s)', (self.user,))
        self.assertIsNone(self.db.execute('SELECT * FROM app.resolve_session(%s)', (self.hash,)).fetchone())
        self.db.execute('RESET ROLE')
        self.assertEqual(self.db.execute('SELECT status FROM users WHERE id=%s', (self.user,)).fetchone()[0], 'deleting')
    def test_worker_cannot_read_private_users(self):
        import psycopg
        self.db.execute('SET ROLE campus_worker')
        with self.assertRaises(psycopg.errors.InsufficientPrivilege):
            self.db.execute('SELECT * FROM users')
        self.assertIsNotNone(self.db.execute('SELECT count(*) FROM tasks').fetchone())
    def test_web_has_atomic_persistent_rate_limit(self):
        self.db.execute('SET ROLE campus_web')
        self.assertTrue(self.db.execute('SELECT app.consume_rate_limit(%s,1,86400)', (self.hash,)).fetchone()[0])
        self.assertFalse(self.db.execute('SELECT app.consume_rate_limit(%s,1,86400)', (self.hash,)).fetchone()[0])
    def test_scheduler_coalesces_and_deduplicates(self):
        from campus_worker.scheduler.main import tick
        from psycopg.conninfo import make_conninfo
        scheduler_dsn = make_conninfo(os.environ['TEST_DATABASE_URL'], options='-c role=campus_scheduler')
        company, source = uuid4(), uuid4()
        try:
            self.db.execute('INSERT INTO companies(id,slug,name) VALUES(%s,%s,%s)', (company, str(company), 'Integration fixture'))
            self.db.execute("""INSERT INTO sources(id,name,base_url,allowed_hosts,company_id,robots_checked_at,
                permission_status,terms_note,enabled) VALUES(%s,'fixture','https://careers.example.com',
                ARRAY['careers.example.com'],%s,now(),'approved','reviewed fixture',true)""", (source, company))
            self.db.execute("INSERT INTO scheduled_sources(source_id,next_run_at) VALUES(%s,now()-interval '1 day')", (source,))
            self.assertEqual(tick(scheduler_dsn, (str(source),)), 1)
            self.assertEqual(tick(scheduler_dsn, (str(source),)), 0)
            count = self.db.execute("SELECT count(*) FROM tasks WHERE payload->>'sourceId'=%s", (str(source),)).fetchone()[0]
            self.assertEqual(count, 1)
        finally:
            self.db.execute("DELETE FROM tasks WHERE payload->>'sourceId'=%s", (str(source),))
            self.db.execute('DELETE FROM scheduled_sources WHERE source_id=%s', (source,))
            self.db.execute('DELETE FROM sources WHERE id=%s', (source,))
            self.db.execute('DELETE FROM companies WHERE id=%s', (company,))
