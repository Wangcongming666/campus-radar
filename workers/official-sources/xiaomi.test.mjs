import assert from 'node:assert/strict';
import test from 'node:test';
import { ROBOTS_URL, SOURCE_ID, checkRobots, listUrl, normalizePage, readOptions, requireOfficialUrl, verifyOfficialTypeMap } from './xiaomi.mjs';

const observedAt = '2026-10-24T07:30:00.000Z';
const item = { jobPostId: '7654772244258179378', title: '校招工程师', type: 2, cityZhNames: ['北京'], levelOneDeptName: '技术部', publishTime: '2026-07-22', url: 'https://xiaomi.jobs.f.mioffice.cn/futurestar/position/7654772244258179378/detail', description: 'PRIVATE FULL JD MUST BE DISCARDED', requirement: 'PRIVATE REQUIREMENTS MUST BE DISCARDED' };
const page = (job = item) => ({ code: 0, data: { list: [job], pageNum: 1, pageSize: 10, total: 100 } });

test('requires an explicit source allowlist and bounded recruitment types', () => {
  assert.throws(() => readOptions(['--output=x.json']), /allowlist/);
  assert.throws(() => readOptions([`--allow-source=${SOURCE_ID}`, '--types=social', '--output=x.json']), /Types/);
  assert.deepEqual(readOptions([`--allow-source=${SOURCE_ID}`, '--output=x.json']).types, ['campus', 'internship']);
  assert.equal(new URL(listUrl('campus')).searchParams.get('type'), '2');
  assert.equal(new URL(listUrl('internship')).searchParams.get('type'), '3');
});

test('only exact official origins and reviewed paths may be requested', () => {
  assert.equal(requireOfficialUrl(ROBOTS_URL).hostname, 'hr.xiaomi.com');
  for (const url of ['https://hr.xiaomi.com.evil.test/robots.txt', 'http://hr.xiaomi.com/robots.txt', 'https://user:pass@hr.xiaomi.com/robots.txt', 'https://hr.xiaomi.com/private']) {
    assert.throws(() => requireOfficialUrl(url));
  }
});

test('robots permits true missing files but blocks denial, HTML and outages', () => {
  assert.equal(checkRobots(404, 'Not Found', [listUrl('campus')]).result, 'unavailable_no_rules');
  for (const status of [302, 401, 403, 429, 500, 503]) assert.throws(() => checkRobots(status, '', [listUrl('campus')]));
  assert.throws(() => checkRobots(200, '<!doctype html><title>404</title>', [listUrl('campus')]));
  assert.throws(() => checkRobots(200, 'User-agent: *\nDisallow: /website/api/', [listUrl('campus')]));
  assert.throws(() => checkRobots(200, 'User-agent: CampusRadar\nDisallow: /', [listUrl('campus')]));
  assert.equal(checkRobots(200, 'User-agent: *\nDisallow: /\nAllow: /website/api/agent/', [listUrl('campus')]).result, 'allowed');
  assert.throws(() => checkRobots(200, 'User-agent: *\nDisallow: /*type=2$', [listUrl('campus')]));
  assert.equal(checkRobots(200, 'User-agent: *\nDisallow: /api$', [listUrl('campus')]).result, 'allowed');
  assert.throws(() => checkRobots(200, 'User-agent: *\nCrawl-delay: 60', [listUrl('campus')]));
});

test('official parameter mapping must still match evidence, never guessed', () => {
  verifyOfficialTypeMap("'校招': 2, '实习': 3, '/api/agent/searchJobPage'");
  assert.throws(() => verifyOfficialTypeMap("'校招': 1, '实习': 3, '/api/agent/searchJobPage'"));
});

test('preserves metadata, date precision, provenance time and unknown deadlines', () => {
  const job = normalizePage(page(), 'campus', observedAt).jobs[0];
  assert.equal(job.publishedAt, null);
  assert.equal(job.publishedDate, '2026-07-22');
  assert.equal(job.publishedPrecision, 'date');
  assert.equal(job.deadlineAt, null);
  assert.equal(job.deadlinePrecision, 'unknown');
  assert.equal(job.observedAt, observedAt);
  assert.equal(job.recruitmentType, 'campus');
  assert.equal(JSON.stringify(job).includes('PRIVATE'), false);
  assert.equal(job.contentHash, normalizePage(page(), 'campus', '2026-10-25T00:00:00Z').jobs[0].contentHash);
  assert.equal(normalizePage(page({ ...item, publishTime: '2026-02-31' }), 'campus', observedAt).jobs[0].publishedDate, null);
});

test('fails closed for mixed types, changed pagination and foreign detail links', () => {
  assert.throws(() => normalizePage(page({ ...item, type: 1 }), 'campus', observedAt));
  assert.throws(() => normalizePage(page({ ...item, url: 'https://evil.test/detail' }), 'campus', observedAt));
  assert.throws(() => normalizePage({ code: 0, data: { list: [], pageNum: 2, pageSize: 10 } }, 'campus', observedAt));
  assert.equal(normalizePage(page({ ...item, type: 3 }), 'internship', observedAt).jobs[0].recruitmentType, 'internship');
});
