"""Isolated Twisted reactor process: input on stdin, DTO result on stdout."""
import json
import random
import sys
from scrapy.crawler import CrawlerProcess
from campus_worker.crawlers.official import OfficialJsonSpider
from campus_worker.crawlers.policy import SourcePolicy


def main():
    data = json.load(sys.stdin)
    policy = SourcePolicy(**data['policy'])
    process = CrawlerProcess(settings={'LOG_ENABLED': False})
    crawler = process.create_crawler(OfficialJsonSpider)
    crawler.settings.set('DOWNLOAD_DELAY', data['delaySeconds'] + random.uniform(0, 1), priority='cmdline')
    process.crawl(crawler, policy=policy, allowed_sources=tuple(data['allowedSources']), url=data['url'])
    process.start(install_signal_handlers=False)
    spider = crawler.spider
    print(json.dumps({'jobs': spider.jobs, 'error': spider.failure}, ensure_ascii=False))


if __name__ == '__main__':
    main()
