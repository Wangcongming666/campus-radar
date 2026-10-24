import unittest
from threading import Event
from uuid import uuid4
from unittest.mock import patch, Mock
from fastapi.testclient import TestClient
from campus_worker.settings import Settings
from campus_worker.api.app import create_app
from campus_worker.executor.runner import Executor, TaskContext, dispatch
from campus_worker.tasks import TaskError, LeaseLost
from campus_worker.ai.provider import TextProvider
from campus_worker.crawlers.callback import BatchClient


class MemoryQueue:
    """Stateful test double; PG SQL is covered separately in integration tests."""
    def __init__(self):
        self.task = {'id': uuid4(), 'lease_token': uuid4(), 'type': 'DATA_EXPORT',
                     'payload': {'schemaVersion': 1}, 'state': 'queued', 'attempt': 0, 'max_attempts': 3}
        self.failures = []
        self.result = None
    def ready(self): return True
    def recover_expired(self): return 0
    def get(self, task_id): return self.task if task_id == self.task['id'] else None
    def claim(self, owner, lease_seconds=60):
        if self.task['state'] != 'queued': return None
        self.task.update(state='running', attempt=1)
        return self.task.copy()
    def heartbeat(self, task_id, token, **kwargs):
        return self.task['state'] == 'running' and self.task['lease_token'] == token
    def finish(self, task_id, token, result):
        if not self.heartbeat(task_id, token): return False
        self.result = result
        self.task['state'] = 'succeeded'
        return True
    def fail(self, task_id, token, code, retryable=True):
        if not self.heartbeat(task_id, token): return False
        self.failures.append((code, retryable))
        self.task['state'] = 'failed'
        return True
    def cancel(self, task_id):
        if self.get(task_id) and self.task['state'] in ('running', 'queued'):
            self.task['state'] = 'cancelled'
            return True
        return False


class ApiTests(unittest.TestCase):
    def setUp(self):
        self.queue = MemoryQueue()
        self.client = TestClient(create_app(Settings(control_token='s' * 32), self.queue))
        self.headers = {'Authorization': 'Bearer ' + 's' * 32}
        self.path = '/internal/tasks/' + str(self.queue.task['id'])
    def test_liveness_and_config_readiness_are_separate(self):
        client = TestClient(create_app(Settings()))
        self.assertEqual(client.get('/health/live').status_code, 200)
        self.assertEqual(client.get('/health/ready').status_code, 503)
        self.assertEqual(client.get(self.path).status_code, 503)
    def test_missing_invalid_token_and_missing_task(self):
        self.assertEqual(self.client.get(self.path).status_code, 401)
        self.assertEqual(self.client.get(self.path, headers={'Authorization': 'Bearer nope'}).status_code, 401)
        self.assertEqual(self.client.get('/internal/tasks/' + str(uuid4()), headers=self.headers).status_code, 404)
    def test_control_result_omits_sensitive_lease_and_payload(self):
        response = self.client.get(self.path, headers=self.headers)
        self.assertEqual(response.status_code, 200)
        self.assertNotIn('lease_token', response.json()['data'])
        self.assertNotIn('payload', response.json()['data'])
    def test_cancel_is_idempotent_and_terminal_is_conflict(self):
        self.assertEqual(self.client.post(self.path + '/cancel', headers=self.headers).status_code, 200)
        self.assertEqual(self.client.post(self.path + '/cancel', headers=self.headers).status_code, 200)
        self.queue.task['state'] = 'succeeded'
        self.assertEqual(self.client.post(self.path + '/cancel', headers=self.headers).status_code, 409)
    def test_database_failure_is_sanitized(self):
        self.queue.ready = Mock(side_effect=RuntimeError('secret db password'))
        response = self.client.get('/health/ready')
        self.assertEqual(response.status_code, 503)
        self.assertNotIn('secret', response.text)


class ExecutorTests(unittest.TestCase):
    def setUp(self): self.queue = MemoryQueue()
    def test_success_stores_only_after_lease_check(self):
        worker = Executor(self.queue, Settings(), lambda *_: {'schemaVersion': 1})
        self.assertTrue(worker.run_once())
        self.assertEqual(self.queue.task['state'], 'succeeded')
        self.assertFalse(worker.run_once())
    def test_cancel_during_handler_never_writes_result(self):
        def handler(context, settings):
            self.queue.cancel(context.task['id'])
            return {'schemaVersion': 1}
        Executor(self.queue, Settings(), handler).run_once()
        self.assertEqual(self.queue.task['state'], 'cancelled')
        self.assertIsNone(self.queue.result)
        self.assertEqual(self.queue.failures, [])
    def test_permanent_task_failures_do_not_retry(self):
        Executor(self.queue, Settings()).run_once()
        self.assertEqual(self.queue.failures, [('DATA_EXPORT_NOT_CONFIGURED', False)])
    def test_retryable_task_error_preserves_policy(self):
        def handler(*_): raise TaskError('UPSTREAM_TIMEOUT', retryable=True)
        Executor(self.queue, Settings(), handler).run_once()
        self.assertEqual(self.queue.failures, [('UPSTREAM_TIMEOUT', True)])
    def test_unknown_task_is_explicit(self):
        self.queue.task['type'] = 'FUTURE_TASK'
        Executor(self.queue, Settings()).run_once()
        self.assertEqual(self.queue.failures, [('UNSUPPORTED_TASK_TYPE', False)])
    def test_stop_revokes_authority_before_work(self):
        context = TaskContext(self.queue.task, self.queue, Event())
        context.stop.set()
        with self.assertRaises(LeaseLost): context.checkpoint()


class ProviderTests(unittest.TestCase):
    def test_missing_config_and_plain_http_do_not_call_provider(self):
        with patch('httpx.post') as post:
            for config in (Settings(), Settings(llm_base_url='http://unsafe', llm_api_key='x', llm_model='x')):
                with self.assertRaises(TaskError): TextProvider(config)
            post.assert_not_called()


class CallbackTests(unittest.TestCase):
    def test_missing_config_rejected(self):
        with self.assertRaises(TaskError): BatchClient(Settings())
    def test_callback_retry_uses_fresh_nonce_and_stable_batch(self):
        client = BatchClient(Settings(internal_origin='https://web.example', hmac_key='s' * 32, hmac_key_id='test'))
        batch = {'batchId': str(uuid4()), 'final': False}
        response = Mock(is_success=True)
        response.json.return_value = {'data': {'batchId': batch['batchId'], 'finalized': False}}
        with patch('httpx.post', side_effect=[__import__('httpx').ConnectError('offline'), response]) as post:
            client.send(batch, lambda: None)
        self.assertEqual(post.call_count, 2)
        first, second = post.call_args_list
        self.assertNotEqual(first.kwargs['headers']['X-Worker-Nonce'], second.kwargs['headers']['X-Worker-Nonce'])
        self.assertEqual(first.kwargs['content'], second.kwargs['content'])

class CrawlValidationTests(unittest.TestCase):
    def test_feed_rows_validate_before_callback(self):
        from campus_worker.crawlers.run import validate_jobs
        from campus_worker.crawlers.policy import SourcePolicy
        policy = SourcePolicy(source_id='source', enabled=True, permission_status='approved',
                              allowed_hosts=('careers.example.com',), company_id=str(uuid4()),
                              robots_checked=True, terms_note='reviewed')
        job = dict(externalId=None, companyId=policy.company_id, canonicalUrl='https://careers.example.com/job/1',
                   title='工程师', role='backend', cities=['上海'], education='bachelor', recruitmentType='campus',
                   graduationYears=[2027], skills=['Python'], descriptionMd='岗位说明', salary=None,
                   deadlineAt=None, deadlinePrecision='unknown', sourceTimezone='Asia/Shanghai',
                   publishedAt='2026-10-23T00:00:00Z', observedAt='2026-10-23T01:00:00Z', status='open', contentHash='a'*64)
        self.assertEqual(len(validate_jobs([job, job.copy()], policy, ('source',))), 1)
        for changes in ({'companyId': str(uuid4())}, {'deadlinePrecision': 'exact'}, {'title': 123}):
            with self.assertRaises(TaskError): validate_jobs([{**job, **changes}], policy, ('source',))


if __name__ == '__main__': unittest.main()
