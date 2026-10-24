"""Optional integration suite against a migrated, disposable PostgreSQL database.

TEST_DATABASE_URL must use a local migration owner. Tests create isolated UUID
rows and clean up only those rows. Never point this at a production database.
"""
import os
import time
import unittest
from uuid import uuid4
from campus_worker.executor.retry import retry_delay


class RetryTests(unittest.TestCase):
    def test_exponential_retry_is_bounded_and_jitter_positive(self):
        self.assertEqual(retry_delay(1, jitter=0), 2)
        self.assertEqual(retry_delay(2, jitter=0), 4)
        self.assertEqual(retry_delay(99, jitter=0), 300)
        self.assertEqual(retry_delay(2, jitter=0.5), 4.5)


@unittest.skipUnless(os.getenv('TEST_DATABASE_URL'), 'TEST_DATABASE_URL not configured; real Postgres required')
class QueueIntegrationTests(unittest.TestCase):
    def setUp(self):
        import psycopg
        from campus_worker.executor.queue import TaskQueue
        self.dsn = os.environ['TEST_DATABASE_URL']
        self.queue = TaskQueue(self.dsn)
        self.connection = psycopg.connect(self.dsn, autocommit=True)
        self.prefix = 'test:' + str(uuid4())
        self.source_id = str(uuid4())

    def tearDown(self):
        self.connection.execute('DELETE FROM tasks WHERE dedup_key LIKE %s', (self.prefix + '%',))
        self.connection.close()

    def enqueue(self, suffix='', max_attempts=3):
        return self.queue.enqueue('CRAWL_JOBS', {'schemaVersion': 1, 'sourceId': self.source_id},
                                  self.prefix + suffix, max_attempts=max_attempts)

    def test_deduplication_claim_and_fencing(self):
        task = self.enqueue()
        self.assertEqual(self.enqueue()['id'], task['id'])
        first = self.queue.claim('executor-a', lease_seconds=1, task_id=task['id'])
        self.assertIsNotNone(first)
        self.assertIsNone(self.queue.claim('executor-b', task_id=task['id']))
        self.assertFalse(self.queue.finish(task['id'], uuid4(), {'schemaVersion': 1}))
        time.sleep(1.1)
        self.assertFalse(self.queue.heartbeat(task['id'], first['lease_token']))
        self.queue.recover_expired()
        self.connection.execute('UPDATE tasks SET available_at=now() WHERE id=%s', (task['id'],))
        second = self.queue.claim('executor-b', task_id=task['id'])
        self.assertNotEqual(first['lease_token'], second['lease_token'])
        self.assertEqual(second['attempt'], 2)
        self.assertFalse(self.queue.finish(task['id'], first['lease_token'], {'schemaVersion': 1}))
        self.assertTrue(self.queue.finish(task['id'], second['lease_token'], {'schemaVersion': 1, 'count': 2}))
        self.assertEqual(self.queue.get(task['id'])['state'], 'succeeded')

    def test_cancellation_revokes_running_lease(self):
        task = self.enqueue()
        lease = self.queue.claim('executor-a', task_id=task['id'])
        self.assertTrue(self.queue.cancel(task['id']))
        self.assertFalse(self.queue.heartbeat(task['id'], lease['lease_token']))
        self.assertFalse(self.queue.finish(task['id'], lease['lease_token'], {'schemaVersion': 1}))
        self.assertEqual(self.queue.get(task['id'])['state'], 'cancelled')

    def test_retry_and_terminal_failure(self):
        task = self.enqueue(max_attempts=2)
        first = self.queue.claim('executor-a', task_id=task['id'])
        self.assertTrue(self.queue.fail(task['id'], first['lease_token'], 'UPSTREAM_TIMEOUT'))
        self.assertEqual(self.queue.get(task['id'])['state'], 'queued')
        self.assertIsNone(self.queue.claim('executor-a', task_id=task['id']))
        self.connection.execute('UPDATE tasks SET available_at=now() WHERE id=%s', (task['id'],))
        second = self.queue.claim('executor-a', task_id=task['id'])
        self.assertTrue(self.queue.fail(task['id'], second['lease_token'], 'UPSTREAM_TIMEOUT'))
        self.assertEqual(self.queue.get(task['id'])['state'], 'failed')

    def test_skip_locked_does_not_block_other_work(self):
        first, second = self.enqueue('a'), self.enqueue('b')
        import psycopg
        with psycopg.connect(self.dsn) as blocker:
            blocker.execute('SELECT id FROM tasks WHERE id=%s FOR UPDATE', (first['id'],))
            lease = self.queue.claim('other-executor', task_id=second['id'])
            self.assertEqual(lease['id'], second['id'])
            self.assertIsNone(self.queue.claim('blocked', task_id=first['id']))


    def test_nonce_is_atomic_and_dedup_conflicts_rejected(self):
        task = self.enqueue()
        with self.assertRaises(ValueError):
            self.queue.enqueue('CRAWL_JOBS', {'schemaVersion': 1, 'sourceId': str(uuid4())}, self.prefix)
        nonce = str(uuid4())
        self.assertTrue(self.queue.consume_nonce('test', nonce, int(time.time()) + 600))
        self.assertFalse(self.queue.consume_nonce('test', nonce, int(time.time()) + 600))
        self.connection.execute('DELETE FROM worker_nonces WHERE key_id=%s AND nonce=%s', ('test', nonce))

    def test_expired_queued_and_exhausted_lease_fail(self):
        expired = self.enqueue('expired')
        self.connection.execute("UPDATE tasks SET expires_at=now()-interval '1 second' WHERE id=%s", (expired['id'],))
        self.assertIsNone(self.queue.claim('worker', task_id=expired['id']))
        exhausted = self.enqueue('exhausted', max_attempts=1)
        lease = self.queue.claim('worker', task_id=exhausted['id'])
        self.connection.execute("UPDATE tasks SET lease_until=now()-interval '1 second' WHERE id=%s", (exhausted['id'],))
        self.queue.recover_expired()
        self.assertEqual(self.queue.get(expired['id'])['error_code'], 'TASK_EXPIRED')
        self.assertEqual(self.queue.get(exhausted['id'])['state'], 'failed')
        self.assertFalse(self.queue.fail(exhausted['id'], lease['lease_token'], 'STALE'))


class WorkerRoleQueueIntegrationTests(QueueIntegrationTests):
    """Repeat the queue contract with the deployed runtime role and forced RLS."""
    def setUp(self):
        super().setUp()
        from psycopg.conninfo import make_conninfo
        from campus_worker.executor.queue import TaskQueue
        self.queue = TaskQueue(make_conninfo(self.dsn, options='-c role=campus_worker'))
