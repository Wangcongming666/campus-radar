#!/usr/bin/env node
/** Disposable real-API browser verification. The business database is never a
 * migration/import/test target. Run: node scripts/verify-real-api.mjs
 * Requires existing private web env, PostgreSQL container and reviewed artifact.
 */
import { execFileSync, spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { createServer } from 'node:net';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import postgres from 'postgres';
import { discoverMigrations, parsePrivateEnv } from './setup-local-api.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const webRoot = join(root, 'apps/web');
const container = 'campus-radar-postgres-1';
const temporaryName = /^campus_browser_[a-f0-9]{16}$/;
const identifier = (value) => '"' + value.replaceAll('"','""') + '"';

export function isolatedDatabaseUrl(source, database, kind) {
  if (!temporaryName.test(database)) throw new Error('Expected an isolated temporary database name');
  let url;
  try { url = new URL(source); } catch { throw new Error(`Missing or invalid restricted ${kind} database URL`); }
  if (!['postgres:','postgresql:'].includes(url.protocol) || url.username !== `campus_${kind}_login` || !url.password) throw new Error(`Expected a restricted ${kind} login`);
  if (!['127.0.0.1','localhost'].includes(url.hostname) || url.port !== '54322') throw new Error('Expected the local PostgreSQL port 54322');
  if (url.search || url.hash) throw new Error('Unexpected restricted database URL connection options');
  url.pathname = '/' + database;
  return url.toString();
}

export function browserEnvironment(webEnv, platformEnv, database, privateFiles) {
  const inherited = {};
  for (const [key,value] of Object.entries(platformEnv)) {
    if (['PATH','HOME','TMPDIR','TMP','TEMP','LANG','USER','SHELL','TERM','CI','CHROME_BIN','PLAYWRIGHT_BROWSERS_PATH'].includes(key) || key.startsWith('LC_')) inherited[key]=value;
  }
  for (const [key,value] of Object.entries(webEnv)) {
    if (/POSTGRES_PASSWORD|INTEGRATION_DATABASE|DATABASE_OWNER|OWNER_DATABASE/.test(key)) throw new Error('Owner/test credentials cannot be forwarded to the browser server');
    if (/DATABASE|POSTGRES/.test(key) && value.startsWith('postgres')) {
      let url;
      try { url = new URL(value); } catch { throw new Error('Invalid web database URL'); }
      if (!['DATABASE_URL','DATABASE_WORKER_URL'].includes(key) || !['campus_web_login','campus_worker_login'].includes(url.username)) throw new Error('Owner or unexpected database credentials cannot be forwarded');
    }
  }
  if (webEnv.NEXT_PUBLIC_DATA_MODE !== 'api' || webEnv.AUTH_PROVIDER !== 'local') throw new Error('Existing web environment must enable local API accounts');
  return {
    ...inherited,...webEnv,
    DATABASE_URL: isolatedDatabaseUrl(webEnv.DATABASE_URL,database,'web'),
    DATABASE_WORKER_URL: isolatedDatabaseUrl(webEnv.DATABASE_WORKER_URL,database,'worker'),
    APP_ORIGIN: 'http://127.0.0.1:3300', NEXT_PUBLIC_APP_URL: 'http://127.0.0.1:3300',
    NEXT_TEST_DIST_DIR: '.next-real-test', PRIVATE_FILE_ROOT: privateFiles, PORT: '3300',
  };
}
function docker(args,input) {
  try { return execFileSync('docker',args,{input,encoding:'utf8',maxBuffer:32*1024*1024,stdio:['pipe','pipe','pipe']}); }
  catch(error) { throw new Error(`Docker ${args[0]} failed (exit ${error.status ?? 'unavailable'}): ${String(error.stderr ?? '').trim().slice(0,1500)}`); }
}
function sql(database,statement) {
  if (database !== 'postgres' && !temporaryName.test(database)) throw new Error('Refusing SQL against a business database');
  return docker(['exec','-i',container,'psql','-X','-q','-A','-t','-U','postgres','-d',database,'-v','ON_ERROR_STOP=1'],statement).trim();
}
async function requireFreePort() {
  await new Promise((done,reject) => {
    const server=createServer();
    server.once('error',() => reject(new Error('Port 3300 is occupied; stop the existing test server before rerunning')));
    server.listen(3300,'127.0.0.1',() => server.close((error) => error ? reject(error) : done()));
  });
}
async function verifyRestrictedConnection(url,database,baseRole) {
  const connection=postgres(url,{max:1,connect_timeout:5,onnotice(){}});
  try {
    const [role]=await connection`select current_database() as database,pg_has_role(current_user,${baseRole},'MEMBER') as member,rolsuper,rolbypassrls from pg_roles where rolname=current_user`;
    if (role.database !== database || !role.member || role.rolsuper || role.rolbypassrls) throw new Error('Unsafe effective role');
  } catch { throw new Error('Restricted browser database connection verification failed; private credentials suppressed'); }
  finally { await connection.end({timeout:1}); }
}
export async function main(args=process.argv.slice(2)) {
  if (args.length) throw new Error('Usage: node scripts/verify-real-api.mjs');
  if (Number(process.versions.node.split('.')[0]) < 24) throw new Error('Node.js 24 or newer is required');
  process.umask(0o077);
  const configPath=join(webRoot,'playwright.real.config.ts');
  if (!existsSync(configPath)) throw new Error('playwright.real.config.ts must be complete before running browser verification');
  const webEnv=parsePrivateEnv(readFileSync(join(webRoot,'.env.local'),'utf8'));
  const database='campus_browser_'+randomBytes(8).toString('hex');
  const inspect=JSON.parse(docker(['inspect',container]))[0];
  if (!inspect.State.Running || !inspect.Mounts.some((mount) => mount.Type==='volume' && mount.Name==='campus-radar_campus_pg' && mount.Destination==='/var/lib/postgresql/data')) throw new Error('Expected the original running PostgreSQL container and preserved volume');
  await requireFreePort();
  mkdirSync(join(root,'.data'),{recursive:true,mode:0o700});
  const lock=join(root,'.data/real-api-browser.lock');
  try { mkdirSync(lock,{mode:0o700}); } catch { throw new Error('Another real-API browser harness may be running; inspect .data/real-api-browser.lock before removing a stale lock'); }
  let temporary,created=false,child,interrupted=false;
  const stop=(signal) => {
    interrupted=true;
    if (child?.pid) {
      try { process.kill(-child.pid,signal); } catch { child.kill(signal); }
    }
  };
  const onInterrupt=()=>stop('SIGINT'),onTerminate=()=>stop('SIGTERM');
  process.on('SIGINT',onInterrupt); process.on('SIGTERM',onTerminate);
  try {
    temporary=mkdtempSync(join(tmpdir(),'campus-real-api-'));
    const privateFiles=join(temporary,'private-files');
    mkdirSync(privateFiles,{mode:0o700});
    const env=browserEnvironment(webEnv,process.env,database,privateFiles);
    const importPath=join(temporary,'reviewed-official-import.sql');
    try {
      execFileSync(process.execPath,[join(root,'scripts/load-official-jobs.mjs'),'--artifact',join(root,'workers/artifacts/official-xiaomi-2026-10-24.json'),'--sql-output',importPath],{cwd:root,encoding:'utf8',env:{PATH:process.env.PATH,HOME:process.env.HOME},stdio:['ignore','pipe','pipe']});
    } catch { throw new Error('Reviewed official artifact validation/SQL generation failed; no database import was attempted'); }
    const migrations=discoverMigrations(readdirSync(join(root,'database/migrations'))).map((name) => ({name,source:readFileSync(join(root,'database/migrations',name),'utf8')}));
    if (interrupted) throw new Error('Browser verification interrupted before database creation');
    sql('postgres',`CREATE DATABASE ${identifier(database)} OWNER postgres TEMPLATE template0;`);
    created=true;
    for (const migration of migrations) sql(database,migration.source);
    sql(database,readFileSync(importPath,'utf8'));
    const contents=JSON.parse(sql(database,"SELECT json_build_object('jobs',(SELECT count(*) FROM jobs),'users',(SELECT count(*) FROM users));"));
    if (contents.jobs !== 20 || contents.users !== 0) throw new Error('Disposable database must contain exactly 20 reviewed official jobs and no initial accounts');
    await verifyRestrictedConnection(env.DATABASE_URL,database,'campus_web');
    await verifyRestrictedConnection(env.DATABASE_WORKER_URL,database,'campus_worker');
    if (interrupted) throw new Error('Browser verification interrupted before Playwright');
    console.log('Disposable browser database ready: 20 reviewed official jobs, no initial accounts, restricted web login, port 3300.');
    const status=await new Promise((done,reject) => {
      child=spawn(process.execPath,[join(root,'node_modules/@playwright/test/cli.js'),'test','--config','playwright.real.config.ts'],{cwd:webRoot,env,stdio:'inherit',detached:process.platform!=='win32'});
      child.once('error',() => reject(new Error('Could not launch Playwright')));
      child.once('exit',(code,signal) => done(code ?? (signal ? 1 : 0)));
    });
    if (status !== 0 || interrupted) throw new Error(`Real-API browser verification failed (exit ${status}); disposable cleanup follows`);
  } finally {
    let cleanupFailure;
    try { if(created) sql('postgres',`DROP DATABASE ${identifier(database)} WITH (FORCE);`); }
    catch(error) { cleanupFailure=error; }
    try {
      if(temporary) rmSync(temporary,{recursive:true,force:true});
      rmSync(join(webRoot,'.next-real-test'),{recursive:true,force:true});
    } finally {
      rmSync(lock,{recursive:true,force:true});
      process.off('SIGINT',onInterrupt); process.off('SIGTERM',onTerminate);
    }
    if(cleanupFailure) throw cleanupFailure;
    console.log('Disposable browser database, private files, generated SQL and isolated Next build directory removed.');
  }
}
if(process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error)=>{console.error('Real API verification stopped: '+error.message);process.exitCode=1;});
}
