"""Approved official JSON feed adapter; no third-party site selectors or login.

Feed shape: {"jobs": [CrawlJob ...]}. Source owners must map their official
feed to this documented DTO before enabling this adapter.
"""
import ipaddress
import json
import socket
import scrapy
from scrapy.exceptions import IgnoreRequest
from campus_worker.crawlers.policy import SourcePolicy


class PublicOriginMiddleware:
    def process_request(self, request, spider):
        # Recheck redirects, robots.txt and every outgoing request. Egress firewall
        # is still required in production to prevent DNS rebinding races.
        spider.policy.require_access(spider.allowed_sources, request.url)
        host = request.url.split('/')[2].split(':')[0]
        addresses = socket.getaddrinfo(host, 443, type=socket.SOCK_STREAM)
        if not addresses or any(not ipaddress.ip_address(row[4][0]).is_global for row in addresses):
            raise IgnoreRequest('Non-public DNS destination')


class OfficialJsonSpider(scrapy.Spider):
    name = 'official_json_v1'
    custom_settings = {
        'ROBOTSTXT_OBEY': True, 'AUTOTHROTTLE_ENABLED': True,
        'AUTOTHROTTLE_TARGET_CONCURRENCY': 1, 'CONCURRENT_REQUESTS_PER_DOMAIN': 1,
        'CONCURRENT_REQUESTS': 1, 'DOWNLOAD_DELAY': 6, 'RANDOMIZE_DOWNLOAD_DELAY': False,
        'DOWNLOAD_TIMEOUT': 20, 'DOWNLOAD_MAXSIZE': 2 * 1024 * 1024,
        'RETRY_ENABLED': False, 'HTTPERROR_ALLOW_ALL': True,
        'COOKIES_ENABLED': False, 'TELNETCONSOLE_ENABLED': False,
        'USER_AGENT': 'CampusRadar/0.1 (+official-source-approved-feed)',
        'DOWNLOADER_MIDDLEWARES': {'campus_worker.crawlers.official.PublicOriginMiddleware': 50},
        'LOG_LEVEL': 'ERROR',
    }

    def __init__(self, *, policy: SourcePolicy, allowed_sources, url, **kwargs):
        super().__init__(**kwargs)
        policy.require_access(allowed_sources, url)
        self.policy, self.allowed_sources, self.start_url = policy, allowed_sources, url
        self.jobs, self.failure = [], None

    async def start(self):
        yield scrapy.Request(self.start_url, callback=self.parse, errback=self.failed)

    def parse(self, response):
        if response.status in (403, 429):
            self.failure = 'SOURCE_PAUSED_' + str(response.status)
            return
        if response.status != 200:
            self.failure = 'SOURCE_HTTP_ERROR'
            return
        try:
            data = response.json()
            jobs = data['jobs']
            if not isinstance(jobs, list) or len(jobs) > 1000:
                raise ValueError()
            # Schema validation and canonical-URL checks occur before any callback.
            self.jobs = jobs
        except (ValueError, KeyError, TypeError):
            self.failure = 'SOURCE_INVALID_FEED'

    def failed(self, failure):
        self.failure = 'SOURCE_FETCH_FAILED'
