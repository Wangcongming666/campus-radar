import test from 'node:test';
import assert from 'node:assert/strict';
import { isolatedDatabaseUrl, browserEnvironment } from './verify-real-api.mjs';
const temporary = 'campus_browser_0123456789abcdef';
const existing = {
  NEXT_PUBLIC_DATA_MODE: 'api', AUTH_PROVIDER: 'local',
  DATABASE_URL: 'postgresql://campus_web_login:private-web@127.0.0.1:54322/campus_radar',
  DATABASE_WORKER_URL: 'postgresql://campus_worker_login:private-worker@127.0.0.1:54322/campus_radar',
  SESSION_ENCRYPTION_KEY: 'preserved-private-key', APP_ORIGIN: 'http://127.0.0.1:3000',
};
test('isolated URL preserves restricted login and refuses production database or owner', () => {
  assert.equal(new URL(isolatedDatabaseUrl(existing.DATABASE_URL,temporary,'web')).pathname, '/'+temporary);
  assert.throws(() => isolatedDatabaseUrl(existing.DATABASE_URL,'campus_radar','web'), /temporary database/);
  assert.throws(() => isolatedDatabaseUrl(existing.DATABASE_URL.replace('campus_web_login','postgres'),temporary,'web'), /restricted/);
  assert.throws(() => isolatedDatabaseUrl(existing.DATABASE_URL.replace('127.0.0.1','remote.example'),temporary,'web'), /local/);
});
test('browser env only forwards safe platform values and points every service to disposable state', () => {
  const result = browserEnvironment(existing, { PATH:'/bin', HOME:'/home/test', OPENAI_API_KEY:'must-not-forward', API_INTEGRATION_DATABASE_URL:'owner-secret' },temporary,'/tmp/browser-files');
  assert.equal(result.PATH,'/bin');
  assert.equal(result.OPENAI_API_KEY,undefined);
  assert.equal(result.API_INTEGRATION_DATABASE_URL,undefined);
  assert.equal(result.SESSION_ENCRYPTION_KEY,existing.SESSION_ENCRYPTION_KEY);
  assert.equal(new URL(result.DATABASE_URL).pathname,'/'+temporary);
  assert.equal(new URL(result.DATABASE_WORKER_URL).pathname,'/'+temporary);
  assert.equal(result.APP_ORIGIN,'http://127.0.0.1:3300');
  assert.equal(result.NEXT_PUBLIC_APP_URL,result.APP_ORIGIN);
  assert.equal(result.NEXT_TEST_DIST_DIR,'.next-real-test');
  assert.equal(result.PRIVATE_FILE_ROOT,'/tmp/browser-files');
  assert.throws(() => browserEnvironment({...existing,POSTGRES_PASSWORD:'owner'}, {},temporary,'/tmp/files'), /Owner/);
});
