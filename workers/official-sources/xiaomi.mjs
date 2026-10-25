/** Read-only adapter for the public job list used by Xiaomi's own website. */
import { createHash } from 'node:crypto';
import { parseArgs } from 'node:util';

export const SOURCE_ID = 'xiaomi_official_public_v1';
export const ORIGIN = 'https://hr.xiaomi.com';
export const ROBOTS_URL = `${ORIGIN}/robots.txt`;
export const SCRIPT_URL = `${ORIGIN}/website/assets/js/jobs.js`;
export const LIST_PATH = '/website/api/agent/searchJobPage';
export const USER_AGENT = 'CampusRadar/0.1 (+public-recruitment-metadata; single-run)';
export const TYPES = Object.freeze({ campus: 2, internship: 3 });
export const sha256 = (text) => createHash('sha256').update(text).digest('hex');

export function listUrl(type) {
  if (!Object.hasOwn(TYPES, type)) throw new Error('Unsupported recruitment type');
  const url = new URL(LIST_PATH, ORIGIN);
  // Exact parameters and numeric meanings come from the official jobs.js.
  url.search = new URLSearchParams({ keyword: '', cityZhNames: '', pageSize: '10', pageNum: '1', type: String(TYPES[type]) });
  return url.href;
}

export function requireOfficialUrl(value) {
  const url = new URL(value);
  if (url.origin !== ORIGIN || url.username || url.password || url.hash ||
      !['/robots.txt', '/website/assets/js/jobs.js', LIST_PATH].includes(url.pathname)) {
    throw new Error('URL is outside the source request allowlist');
  }
  return url;
}

export function checkRobots(status, text, targets) {
  // RFC 9309: a true 404/410 means no robots file. Never treat a redirect,
  // HTML error page, challenge, authentication or server failure as permission.
  if ([404, 410].includes(status)) return { status, result: 'unavailable_no_rules', sha256: sha256(text) };
  if (status !== 200 || /<\s*(?:html|!doctype)/i.test(text)) throw new Error(`Robots review blocked (HTTP ${status})`);
  const groups = [];
  let current = { agents: [], rules: [] };
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, '').trim();
    if (!line) continue;
    const match = /^([a-z-]+)\s*:\s*(.*)$/i.exec(line);
    if (!match) throw new Error('Unrecognized robots content; manual review required');
    const [, rawKey, value] = match;
    const key = rawKey.toLowerCase();
    if (key === 'user-agent') {
      if (current.rules.length) { groups.push(current); current = { agents: [], rules: [] }; }
      current.agents.push(value.toLowerCase());
    } else if (['disallow', 'allow'].includes(key) && value) current.rules.push({ key, value });
    else if (key === 'crawl-delay' && Number(value) > 6) throw new Error('Source requires a longer crawl delay; manual review required');
  }
  groups.push(current);
  // Conservatively combine generic and product-specific groups. A deny blocks
  // even if another group would be less restrictive.
  const relevant = groups.filter((g) => g.agents.some((a) => a === '*' || USER_AGENT.toLowerCase().includes(a)));
  for (const target of targets) {
    const url = new URL(target);
    const path = url.pathname + url.search;
    const matches = relevant.flatMap((g) => g.rules).filter((r) => {
      const anchored = r.value.endsWith('$');
      const value = anchored ? r.value.slice(0, -1) : r.value;
      const escaped = value.split('*').map((part) => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*');
      return new RegExp('^' + escaped + (anchored ? '$' : '')).test(path);
    }).sort((a, b) => b.value.length - a.value.length || (a.key === 'allow' ? -1 : 1));
    if (matches[0]?.key === 'disallow') throw new Error(`Robots disallows ${url.pathname}`);
  }
  return { status, result: 'allowed', sha256: sha256(text) };
}

export function verifyOfficialTypeMap(script) {
  if (!/'校招'\s*:\s*2\b/.test(script) || !/'实习'\s*:\s*3\b/.test(script) ||
      !script.includes('/api/agent/searchJobPage')) throw new Error('Official parameter mapping changed; manual review required');
}

export function normalizePage(payload, type, observedAt) {
  if (!Object.hasOwn(TYPES, type) || payload?.code !== 0 || !Array.isArray(payload?.data?.list) ||
      payload.data.list.length > 10 || payload.data.pageNum !== 1 || payload.data.pageSize !== 10) {
    throw new Error('Unexpected official list response');
  }
  const jobs = payload.data.list.map((item) => {
    if (item.type !== TYPES[type] || typeof item.title !== 'string' || !item.title.trim() || item.title.length > 300 ||
        !Array.isArray(item.cityZhNames) || item.cityZhNames.some((city) => typeof city !== 'string') ||
        !/^[0-9]+$/.test(String(item.jobPostId))) throw new Error('Invalid official job metadata');
    const canonical = new URL(item.url);
    if (canonical.origin !== 'https://xiaomi.jobs.f.mioffice.cn' || canonical.username || canonical.password ||
        canonical.search || canonical.hash || !/^\/[a-z]+\/position\/[0-9]+\/detail$/.test(canonical.pathname) ||
        !canonical.pathname.includes(`/position/${item.jobPostId}/detail`)) throw new Error('Unexpected official detail link');
    const publishedDate = validDate(item.publishTime) ? item.publishTime : null;
    const department = typeof item.levelOneDeptName === 'string' ? item.levelOneDeptName.slice(0, 200) : null;
    const title = item.title.trim();
    // This is an original metadata summary. JD/requirements are intentionally
    // discarded, including in provenance and hashes used for change tracking.
    const job = {
      externalId: String(item.jobPostId), canonicalUrl: canonical.href, title,
      recruitmentType: type, cities: item.cityZhNames, department,
      publishedAt: null, publishedDate, publishedPrecision: publishedDate ? 'date' : 'unknown',
      deadlineAt: null, deadlinePrecision: 'unknown', sourceTimezone: 'Asia/Shanghai',
      observedAt, status: 'open', education: 'any', graduationYears: [], skills: [], salary: null,
      role: '其他',
      descriptionMd: `小米官方${type === 'campus' ? '校园招聘' : '实习'}岗位；工作地点：${item.cityZhNames.join('、') || '官网未注明'}。岗位职责和申请条件请查看官方详情。`,
    };
    job.contentHash = sha256(JSON.stringify({ ...job, observedAt: undefined }));
    return job;
  });
  return { jobs, reportedTotal: payload.data.total, pageNum: 1, pageSize: 10 };
}

function validDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(value + 'T00:00:00Z');
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export function readOptions(args) {
  const { values } = parseArgs({ args, options: { 'allow-source': { type: 'string' }, output: { type: 'string' }, types: { type: 'string', default: 'campus,internship' } }, strict: true });
  if (values['allow-source'] !== SOURCE_ID) throw new Error(`Explicit source allowlist required: --allow-source=${SOURCE_ID}`);
  const types = [...new Set(values.types.split(','))];
  if (!types.length || types.some((type) => !Object.hasOwn(TYPES, type))) throw new Error('Types must be campus and/or internship');
  if (!values.output) throw new Error('--output is required; this script only exports a reviewable JSON file');
  return { types, output: values.output };
}
