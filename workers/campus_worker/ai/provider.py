"""Explicit, opt-in OpenAI-compatible transport. No synthetic production results."""
import httpx
from campus_worker.settings import Settings
from campus_worker.tasks import TaskError


class TextProvider:
    def __init__(self, settings: Settings):
        if not all((settings.llm_base_url, settings.llm_api_key, settings.llm_model)):
            raise TaskError('AI_PROVIDER_NOT_CONFIGURED')
        if not settings.llm_base_url.startswith('https://'):
            raise TaskError('AI_PROVIDER_INVALID_ORIGIN')
        self.settings = settings

    def generate(self, text: str, *, idempotency_key: str):
        # This transport is not wired to the MVP dispatcher. V2 must reserve a
        # configured budget and consent before invoking it.
        if not text or len(text) > 48000:
            raise TaskError('AI_INPUT_LIMIT')
        try:
            response = httpx.post(self.settings.llm_base_url.rstrip('/') + '/chat/completions',
                                 headers={'Authorization': 'Bearer ' + self.settings.llm_api_key,
                                          'Idempotency-Key': idempotency_key},
                                 json={'model': self.settings.llm_model,
                                       'messages': [{'role': 'user', 'content': text}], 'max_tokens': 2000},
                                 timeout=90, follow_redirects=False)
            response.raise_for_status()
            data = response.json()
            content = data['choices'][0]['message']['content']
            if not isinstance(content, str):
                raise ValueError()
            return {'text': content, 'model': self.settings.llm_model,
                    'providerRequestId': response.headers.get('x-request-id'), 'usage': data.get('usage')}
        except httpx.HTTPStatusError as error:
            raise TaskError('AI_PROVIDER_REJECTED', retryable=error.response.status_code in (429, 502, 503, 504)) from None
        except httpx.RequestError:
            raise TaskError('AI_PROVIDER_UNAVAILABLE', retryable=True) from None
        except (ValueError, KeyError, IndexError, TypeError):
            raise TaskError('AI_PROVIDER_INVALID_RESPONSE') from None
