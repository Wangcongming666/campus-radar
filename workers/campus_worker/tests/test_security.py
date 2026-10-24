import unittest
from campus_worker.signing import sign_headers, verify_headers, SignatureError
from campus_worker.crawlers.policy import SourcePolicy, SourceNotApproved


class SigningTests(unittest.TestCase):
    def setUp(self):
        self.keys = {'local': b'a' * 32}
        self.used = set()

    def consume(self, key_id, nonce, expires):
        key = (key_id, nonce)
        if key in self.used:
            return False
        self.used.add(key)
        return True

    def headers(self):
        return sign_headers(b'{}', 'POST', '/api/internal/v1/crawl/batches',
                            'local', self.keys['local'], timestamp=1000, nonce='unique-nonce')

    def verify(self, headers, body=b'{}', now=1000):
        verify_headers(headers, body, 'POST', '/api/internal/v1/crawl/batches',
                       self.keys, self.consume, now=now)

    def test_signed_batch_accepts_once_and_rejects_replay(self):
        headers = self.headers()
        self.verify(headers)
        with self.assertRaises(SignatureError):
            self.verify(headers)

    def test_tampering_cannot_consume_nonce(self):
        headers = self.headers()
        with self.assertRaises(SignatureError):
            self.verify(headers, b'{"changed":true}')
        self.verify(headers)

    def test_expired_future_unknown_key_and_wrong_path_rejected(self):
        for now in (699, 1301):
            with self.assertRaises(SignatureError):
                self.verify(self.headers(), now=now)
        headers = self.headers()
        headers['X-Worker-Key-Id'] = 'untrusted'
        with self.assertRaises(SignatureError):
            self.verify(headers)
        with self.assertRaises(SignatureError):
            verify_headers(self.headers(), b'{}', 'POST', '/different', self.keys,
                           self.consume, now=1000)


class SourceTests(unittest.TestCase):
    def approved(self, **overrides):
        params = dict(source_id='official', enabled=True, permission_status='approved',
                      allowed_hosts=('careers.example.com',), company_id='company',
                      robots_checked=True, terms_note='Internal review recorded')
        params.update(overrides)
        return SourcePolicy(**params)

    def test_default_allow_list_disables_even_approved_source(self):
        with self.assertRaises(SourceNotApproved):
            self.approved().require_access((), 'https://careers.example.com/jobs')

    def test_permission_company_robots_and_host_are_required(self):
        for changes in ({'enabled': False}, {'permission_status': 'pending'},
                        {'company_id': None}, {'robots_checked': False}, {'terms_note': ''}):
            with self.assertRaises(SourceNotApproved):
                self.approved(**changes).require_access(('official',), 'https://careers.example.com/jobs')
        for url in ('https://careers.example.com.evil.test/jobs', 'http://careers.example.com/jobs',
                    'https://user:password@careers.example.com/jobs', 'https://127.0.0.1/jobs'):
            with self.assertRaises(SourceNotApproved):
                self.approved().require_access(('official',), url)
        self.approved().require_access(('official',), 'https://careers.example.com/jobs')


if __name__ == '__main__':
    unittest.main()
