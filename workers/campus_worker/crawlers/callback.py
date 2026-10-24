import json
from urllib.parse import urlsplit
import httpx
from campus_worker.signing import sign_headers
from campus_worker.tasks import TaskError

PATH = '/api/internal/v1/crawl/batches'


class BatchClient:
    def __init__(self, settings):
        origin = urlsplit(settings.internal_origin)
        # Local HTTP is only for the documented local compose deployment.
        if (origin.scheme not in ('https', 'http') or not origin.hostname or origin.username
                or origin.password or origin.query or origin.fragment or origin.path not in ('', '/')
                or (origin.scheme == 'http' and origin.hostname not in ('localhost', '127.0.0.1', 'web'))
                or len(settings.hmac_key.encode()) < 32 or not settings.hmac_key_id):
            raise TaskError('CRAWL_CALLBACK_NOT_CONFIGURED')
        self.settings = settings

    def send(self, batch, checkpoint):
        body = json.dumps(batch, separators=(',', ':'), ensure_ascii=False).encode()
        if len(body) > 1024 * 1024:
            raise TaskError('CRAWL_BATCH_TOO_LARGE')
        for attempt in range(3):
            checkpoint()
            # Fresh nonce per retry; stable batchId and exact bytes for idempotency.
            headers = sign_headers(body, 'POST', PATH, self.settings.hmac_key_id, self.settings.hmac_key.encode())
            headers['Content-Type'] = 'application/json'
            try:
                response = httpx.post(self.settings.internal_origin.rstrip('/') + PATH,
                                      content=body, headers=headers, timeout=20, follow_redirects=False)
            except httpx.RequestError:
                if attempt == 2:
                    raise TaskError('CRAWL_CALLBACK_UNAVAILABLE', retryable=True) from None
                continue
            if response.is_success:
                try:
                    result = response.json()['data']
                    if result['batchId'] != batch['batchId'] or result['finalized'] != batch['final']:
                        raise ValueError()
                    return result
                except (KeyError, ValueError, TypeError):
                    raise TaskError('CRAWL_CALLBACK_INVALID_RESPONSE') from None
            if response.status_code not in (429, 502, 503, 504):
                raise TaskError('CRAWL_CALLBACK_REJECTED')
        raise TaskError('CRAWL_CALLBACK_UNAVAILABLE', retryable=True)
