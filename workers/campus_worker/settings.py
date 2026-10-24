"""Configuration is read only on process startup; credentials never enter task payloads."""
from dataclasses import dataclass
import os


@dataclass(frozen=True)
class Settings:
    database_url: str = ''
    scheduler_database_url: str = ''
    control_token: str = ''
    allowed_sources: tuple[str, ...] = ()
    internal_origin: str = ''
    hmac_key: str = ''
    hmac_key_id: str = ''
    llm_base_url: str = ''
    llm_api_key: str = ''
    llm_model: str = ''

    @classmethod
    def from_env(cls):
        return cls(database_url=os.getenv('WORKER_DATABASE_URL', ''),
                   scheduler_database_url=os.getenv('SCHEDULER_DATABASE_URL', ''),
                   control_token=os.getenv('WORKER_CONTROL_TOKEN', ''),
                   allowed_sources=tuple(filter(None, (s.strip() for s in os.getenv('CRAWL_ALLOWED_SOURCES', '').split(',')))),
                   internal_origin=os.getenv('WEB_INTERNAL_ORIGIN', ''),
                   hmac_key=os.getenv('WORKER_HMAC_KEY', ''), hmac_key_id=os.getenv('WORKER_HMAC_KEY_ID', ''),
                   llm_base_url=os.getenv('LLM_BASE_URL', ''), llm_api_key=os.getenv('LLM_API_KEY', ''),
                   llm_model=os.getenv('LLM_MODEL', ''))
