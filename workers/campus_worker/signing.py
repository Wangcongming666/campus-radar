"""Raw-body HMAC contract shared with the web batch receiver.

The receiver must supply an atomic, durable nonce consumer (Postgres below),
then check source approval and the current task lease inside its write transaction.
"""
import hashlib
import hmac
import secrets
import time
from collections.abc import Callable, Mapping


class SignatureError(ValueError):
    pass


def _canonical(body: bytes, method: str, path: str, timestamp: str, nonce: str) -> bytes:
    if not path.startswith('/') or '?' in path or '\n' in path:
        raise SignatureError('Only URL pathname may be signed')
    return '\n'.join((timestamp, nonce, method.upper(), path,
                      hashlib.sha256(body).hexdigest())).encode()


def sign_headers(body: bytes, method: str, path: str, key_id: str, key: bytes,
                 *, timestamp: int | None = None, nonce: str | None = None) -> dict[str, str]:
    if len(key) < 32:
        raise SignatureError('HMAC key must contain at least 32 bytes')
    stamp = str(int(time.time()) if timestamp is None else timestamp)
    nonce = nonce or secrets.token_urlsafe(24)
    digest = hmac.new(key, _canonical(body, method, path, stamp, nonce), hashlib.sha256).hexdigest()
    return {'X-Worker-Key-Id': key_id, 'X-Worker-Timestamp': stamp,
            'X-Worker-Nonce': nonce, 'X-Worker-Signature': digest}


def verify_headers(headers: Mapping[str, str], body: bytes, method: str, path: str,
                   keys: Mapping[str, bytes], consume_nonce: Callable[[str, str, int], bool],
                   *, now: int | None = None) -> None:
    """Consume nonce only after authentication; DB failure must reject the request."""
    lower = {k.lower(): v for k, v in headers.items()}
    try:
        key_id = lower['x-worker-key-id']
        stamp = lower['x-worker-timestamp']
        nonce = lower['x-worker-nonce']
        signature = lower['x-worker-signature']
        key = keys[key_id]
        current = int(time.time()) if now is None else now
        if len(key) < 32 or abs(current - int(stamp)) > 300 or not 8 <= len(nonce) <= 128:
            raise ValueError()
        if '\n' in nonce or '\n' in stamp or len(signature) != 64:
            raise ValueError()
        expected = hmac.new(key, _canonical(body, method, path, stamp, nonce), hashlib.sha256).hexdigest()
        if not hmac.compare_digest(signature, expected):
            raise ValueError()
    except (KeyError, ValueError, TypeError) as error:
        raise SignatureError('Invalid worker signature') from error
    if not consume_nonce(key_id, nonce, current + 600):
        raise SignatureError('Replayed worker signature')
