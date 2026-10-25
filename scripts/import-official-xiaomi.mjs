#!/usr/bin/env node
/** Single acquisition only. No DB connection, writes, scheduling or credentials. */
import { mkdir, open, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SOURCE_ID, ROBOTS_URL, SCRIPT_URL, USER_AGENT, checkRobots, listUrl, normalizePage, readOptions, requireOfficialUrl, sha256, verifyOfficialTypeMap } from '../workers/official-sources/xiaomi.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const stateDir = resolve(root, 'workers/artifacts');
const lock = resolve(stateDir, '.xiaomi-acquire.lock');
const state = resolve(stateDir, '.xiaomi-acquire-state.json');
const delay = (ms) => new Promise((done) => setTimeout(done, ms));
let lastRequest = 0;

async function request(url) {
  requireOfficialUrl(url);
  if (lastRequest) await delay(Math.max(0, 6500 - (Date.now() - lastRequest)));
  lastRequest = Date.now();
  const response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(20000), headers: { 'User-Agent': USER_AGENT, Accept: 'application/json,text/plain,text/javascript' } });
  if ([401, 403, 429].includes(response.status)) throw new Error(`Source paused on HTTP ${response.status}; no retry`);
  if (Number(response.headers.get('content-length')) > 2 * 1024 * 1024) throw new Error('Response too large');
  const reader = response.body.getReader();
  const parts = [];
  let bytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > 2 * 1024 * 1024) { await reader.cancel(); throw new Error('Response too large'); }
    parts.push(value);
  }
  return { status: response.status, text: Buffer.concat(parts).toString('utf8'), contentType: response.headers.get('content-type') || '' };
}

async function main() {
  const options = readOptions(process.argv.slice(2));
  await mkdir(stateDir, { recursive: true });
  await mkdir(lock); // Exclusive across concurrent processes; never remove another run's lock.
  try {
    const previous = await readFile(state, 'utf8').then(JSON.parse).catch((error) => { if (error.code === 'ENOENT') return null; throw error; });
    if (previous && Date.now() - previous.startedAt < 60 * 60 * 1000) throw new Error('Source cooldown: at most one acquisition attempt per hour');
    await writeFile(state, JSON.stringify({ startedAt: Date.now() }));
    const endpoints = options.types.map(listUrl);
    const robotsResponse = await request(ROBOTS_URL);
    const robots = checkRobots(robotsResponse.status, robotsResponse.text, [SCRIPT_URL, ...endpoints]);
    const script = await request(SCRIPT_URL);
    if (script.status !== 200) throw new Error('Official parameter documentation unavailable');
    verifyOfficialTypeMap(script.text);
    const jobs = [];
    const pages = [];
    for (let index = 0; index < endpoints.length; index++) {
      const response = await request(endpoints[index]);
      if (response.status !== 200 || !response.contentType.includes('json')) throw new Error('Official JSON endpoint unavailable');
      const observedAt = new Date().toISOString();
      const normalized = normalizePage(JSON.parse(response.text), options.types[index], observedAt);
      jobs.push(...normalized.jobs);
      pages.push({ endpoint: endpoints[index], observedAt, responseSha256: sha256(response.text), reportedTotal: normalized.reportedTotal, collected: normalized.jobs.length, pageNum: 1, pageSize: 10 });
    }
    const artifact = {
      schemaVersion: 1, sourceId: SOURCE_ID, company: { name: '小米', officialWebsite: 'https://www.mi.com' },
      collectedAt: new Date().toISOString(), contentMode: 'metadata_only', coverage: 'First page only for each requested type; not a complete inventory. Do not close unseen jobs.',
      provenance: {
        sourcePage: 'https://hr.xiaomi.com/website/opportunities.html', robotsUrl: ROBOTS_URL, robots,
        rulesReviewedAt: '2026-10-24', visiblePolicyUrl: 'https://privacy.mi.com/XiaomiZhaopin/zh_CN/',
        rulesNote: 'Official footer links the recruitment privacy policy v20251009. No public crawling/redistribution permission was granted by that policy. Restrict this review to factual job metadata and official detail links; no JD/requirements, candidates, login, cookies, captcha bypass, private APIs or recurring schedule.',
        parameterEvidenceUrl: SCRIPT_URL, parameterEvidenceSha256: sha256(script.text), pages,
      }, jobs,
    };
    const destination = resolve(options.output);
    await mkdir(dirname(destination), { recursive: true });
    const output = await open(destination, 'wx');
    try { await output.writeFile(JSON.stringify(artifact, null, 2) + '\n'); } finally { await output.close(); }
    console.log(JSON.stringify({ sourceId: SOURCE_ID, output: destination, jobs: jobs.length, databaseWrites: 0 }));
  } finally { await rm(lock, { recursive: true }); }
}

main().catch((error) => { console.error(error.message); process.exitCode = 1; });
