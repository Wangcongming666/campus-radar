#!/usr/bin/env node
/** Preserve the existing local database; never run integration fixtures against it.
 * node scripts/setup-local-api.mjs [--integration-tests] [--through=0007]
 * Secrets and database backups stay under ignored .data/local-api-bootstrap (0700).
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import postgres from 'postgres';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const container = 'campus-radar-postgres-1';
const businessDatabase = 'campus_radar';
const privateRoot = join(root, '.data/local-api-bootstrap');
const envPath = join(root, 'apps/web/.env.local');
const credentialsPath = join(privateRoot, 'role-credentials.env');
export const migrationPlan = ['0001_mvp.sql', '0003_runtime_boundaries.sql', '0004_stage_order_snapshots.sql', '0002_vector_capability.sql', '0005_local_identity.sql', '0006_workspace_resources.sql', '0007_core_resources.sql'];
export function discoverMigrations(names, through = Infinity) {
  const numbered = names.filter((name) => /^\d{4,}_[a-z0-9_]+\.sql$/.test(name));
  const numbers = new Map();
  for (const name of numbered) {
    const number = Number(name.split('_')[0]);
    if (!Number.isSafeInteger(number) || number < 1) throw new Error('Invalid migration number: ' + name);
    if (numbers.has(number)) throw new Error('Duplicate migration number: ' + number);
    numbers.set(number, name);
  }
  for (const name of migrationPlan) {
    if (!numbered.includes(name)) throw new Error('Missing historical migration: ' + name);
  }
  const future = numbered.filter((name) => Number(name.split('_')[0]) > 7 && Number(name.split('_')[0]) <= through)
    .sort((a, b) => Number(a.split('_')[0]) - Number(b.split('_')[0]));
  return [...migrationPlan, ...future];
}
const quote = (value) => "'" + String(value).replaceAll("'", "''") + "'";
const identifier = (value) => '"' + String(value).replaceAll('"', '""') + '"';
const hash = (value) => createHash('sha256').update(value).digest('hex');

export function parsePrivateEnv(source) {
  const values = {};
  for (const line of source.split(/\r?\n/)) {
    if (!line.trim() || line.trim().startsWith('#')) continue;
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) throw new Error('Invalid private environment file line; expected KEY=value');
    const [, key, raw] = match;
    if (Object.hasOwn(values, key)) throw new Error(`Duplicate private environment key: ${key}`);
    let value = raw;
    if (raw.startsWith('"')) {
      try { value = JSON.parse(raw); } catch { throw new Error(`Invalid quoted private environment key: ${key}`); }
    } else if (raw.startsWith("'") && raw.endsWith("'")) value = raw.slice(1, -1);
    if (typeof value !== 'string' || /[\r\n\0]/.test(value)) throw new Error(`Invalid private environment value: ${key}`);
    values[key] = value;
  }
  return values;
}
export function compareCatalogs(expected, actual) {
  const differences = [];
  for (const key of Object.keys(expected).sort()) {
    if (!(key in actual)) differences.push('missing ' + key);
    else if (JSON.stringify(expected[key]) !== JSON.stringify(actual[key])) differences.push('changed ' + key);
  }
  for (const key of Object.keys(actual).sort()) if (!(key in expected)) differences.push('unexpected ' + key);
  return differences;
}
function readEnv(path) { return existsSync(path) ? parsePrivateEnv(readFileSync(path, 'utf8')) : {}; }
function atomicPrivateWrite(path, content) {
  const temporary = path + '.' + randomBytes(6).toString('hex') + '.tmp';
  writeFileSync(temporary, content, { mode: 0o600, flag: 'wx' });
  chmodSync(temporary, 0o600);
  renameSync(temporary, path);
  chmodSync(path, 0o600);
}
function serializeEnv(values) { return Object.entries(values).map(([key, value]) => key + '=' + JSON.stringify(value)).join('\n') + '\n'; }
function docker(args, input, sensitive = false) {
  try { return execFileSync('docker', args, { input, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['pipe', 'pipe', 'pipe'] }); }
  catch (error) {
    const details = sensitive ? 'Credential operation failed; private values suppressed.' : String(error.stderr ?? '').trim().slice(0, 2000);
    throw new Error(`Docker ${args[0]} failed (exit ${error.status ?? 'unavailable'}): ${details}`);
  }
}
function sql(database, statement, sensitive = false) {
  return docker(['exec', '-i', container, 'psql', '-X', '-q', '-A', '-t', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', database], statement, sensitive).trim();
}
function jsonSql(database, statement) { return JSON.parse(sql(database, statement)); }

// Fingerprint every application object, including grants and RLS, without OIDs,
// database names, data, or extension-owned functions. This detects partial init.
const catalogQuery = `WITH objects AS (
SELECT 'table:'||n.nspname||'.'||c.relname AS key,
 jsonb_build_object('kind',c.relkind,'owner',pg_get_userbyid(c.relowner),'rls',c.relrowsecurity,'force',c.relforcerowsecurity,'acl',coalesce((SELECT jsonb_agg(a::text ORDER BY a::text) FROM unnest(c.relacl) a),'[]')) AS value
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname IN ('public','app') AND c.relkind IN ('r','p','v','m','S') AND c.relname!='schema_migrations'
AND NOT EXISTS(SELECT 1 FROM pg_depend d WHERE d.classid='pg_class'::regclass AND d.objid=c.oid AND d.deptype='e')
UNION ALL
SELECT 'column:'||n.nspname||'.'||c.relname||'.'||a.attname,
 jsonb_build_object('type',format_type(a.atttypid,a.atttypmod),'notnull',a.attnotnull,'default',pg_get_expr(ad.adbin,ad.adrelid),'identity',a.attidentity,'generated',a.attgenerated,'acl',coalesce((SELECT jsonb_agg(x::text ORDER BY x::text) FROM unnest(a.attacl) x),'[]'))
FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace LEFT JOIN pg_attrdef ad ON ad.adrelid=a.attrelid AND ad.adnum=a.attnum
WHERE n.nspname IN ('public','app') AND c.relkind IN ('r','p') AND c.relname!='schema_migrations' AND a.attnum>0 AND NOT a.attisdropped
AND NOT EXISTS(SELECT 1 FROM pg_depend d WHERE d.classid='pg_class'::regclass AND d.objid=c.oid AND d.deptype='e')
UNION ALL
SELECT 'constraint:'||n.nspname||'.'||c.relname||'.'||con.conname,to_jsonb(pg_get_constraintdef(con.oid,true))
FROM pg_constraint con JOIN pg_class c ON c.oid=con.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('public','app') AND c.relname!='schema_migrations'
UNION ALL
SELECT 'index:'||n.nspname||'.'||i.relname,to_jsonb(pg_get_indexdef(i.oid))
FROM pg_index x JOIN pg_class i ON i.oid=x.indexrelid JOIN pg_class c ON c.oid=x.indrelid JOIN pg_namespace n ON n.oid=i.relnamespace WHERE n.nspname IN ('public','app') AND c.relname!='schema_migrations'
UNION ALL
SELECT 'trigger:'||n.nspname||'.'||c.relname||'.'||t.tgname,
 jsonb_build_object('definition',pg_get_triggerdef(t.oid,true),'enabled',t.tgenabled)
FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname IN ('public','app') AND NOT t.tgisinternal
UNION ALL
SELECT 'policy:'||schemaname||'.'||tablename||'.'||policyname,to_jsonb(p)-'schemaname'-'tablename'-'policyname' FROM pg_policies p WHERE schemaname IN ('public','app')
UNION ALL
SELECT 'function:'||n.nspname||'.'||p.proname||'('||pg_get_function_identity_arguments(p.oid)||')',
 jsonb_build_object('definition',pg_get_functiondef(p.oid),'owner',pg_get_userbyid(p.proowner),'acl',coalesce((SELECT jsonb_agg(a::text ORDER BY a::text) FROM unnest(p.proacl) a),'[]'))
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN ('public','app') AND p.prokind!='a' AND NOT EXISTS(SELECT 1 FROM pg_depend d WHERE d.classid='pg_proc'::regclass AND d.objid=p.oid AND d.deptype='e')
UNION ALL
SELECT 'enum:'||n.nspname||'.'||t.typname,jsonb_agg(e.enumlabel ORDER BY e.enumsortorder) FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace JOIN pg_enum e ON e.enumtypid=t.oid WHERE n.nspname IN ('public','app') GROUP BY n.nspname,t.typname
UNION ALL
SELECT 'extension:'||extname,to_jsonb(extversion) FROM pg_extension WHERE extname IN ('pgcrypto','pg_trgm','vector')
UNION ALL
SELECT 'schema:'||nspname,jsonb_build_object('owner',pg_get_userbyid(nspowner),'acl',coalesce((SELECT jsonb_agg(a::text ORDER BY a::text) FROM unnest(nspacl) a),'[]')) FROM pg_namespace WHERE nspname IN ('public','app')
) SELECT coalesce(jsonb_object_agg(key,value),'{}') FROM objects;`;
function catalog(database) { return jsonSql(database, catalogQuery); }
function migrationBody(source) {
  if (!/^BEGIN;$/m.test(source) || !/^COMMIT;\s*$/m.test(source)) throw new Error('Migration must have a single explicit transaction');
  return source.replace(/^BEGIN;\s*$/m, '').replace(/^COMMIT;\s*$/m, '');
}
function urlFor(role, password, database) {
  return `postgresql://${encodeURIComponent(role)}:${encodeURIComponent(password)}@127.0.0.1:54322/${database}`;
}
async function verifyLogin(url, role, database) {
  const connection = postgres(url, { max: 1, connect_timeout: 5, onnotice() {} });
  try {
    const [row] = await connection`select current_user as role, current_database() as database`;
    if (row.role !== role || row.database !== database) throw new Error('Unexpected identity');
  } catch { throw new Error(`Cannot authenticate restricted role ${role}; existing passwords were not changed`); }
  finally { await connection.end({ timeout: 1 }); }
}
async function configureRoles(inspect, env) {
  const saved = readEnv(credentialsPath);
  const containerEnv = Object.fromEntries((inspect.Config.Env ?? []).map((line) => { const i = line.indexOf('='); return [line.slice(0,i), line.slice(i+1)]; }));
  const specifications = [['web','DATABASE_URL'],['worker','DATABASE_WORKER_URL'],['scheduler',null]];
  const result = {};
  for (const [kind, envKey] of specifications) {
    const role = `campus_${kind}_login`, base = `campus_${kind}`, key = `CAMPUS_${kind.toUpperCase()}_PASSWORD`;
    const roles = jsonSql(businessDatabase, `SELECT coalesce(json_agg(row_to_json(r)),'[]') FROM (SELECT rolname,rolcanlogin,rolsuper,rolcreatedb,rolcreaterole,rolreplication,rolbypassrls FROM pg_roles WHERE rolname=${quote(role)}) r`);
    let password = saved[key];
    if (envKey && env[envKey]) {
      let parsed;
      try { parsed = new URL(env[envKey]); } catch { throw new Error(`Invalid ${envKey}; no credentials were changed`); }
      if (parsed.username !== role || !['127.0.0.1','localhost'].includes(parsed.hostname) || parsed.port !== '54322' || parsed.pathname !== '/campus_radar') throw new Error(`Existing ${envKey} must point to the restricted local ${role}`);
      password = decodeURIComponent(parsed.password);
    }
    if (roles.length) {
      const attributes = roles[0];
      if (!attributes.rolcanlogin || ['rolsuper','rolcreatedb','rolcreaterole','rolreplication','rolbypassrls'].some((name) => attributes[name])) throw new Error(`Existing ${role} has unsafe role attributes; refusing automatic modification`);
      password ??= containerEnv[key];
      if (!password) throw new Error(`Existing ${role} has no reusable private credential; password was not reset`);
      await verifyLogin(urlFor(role,password,businessDatabase),role,businessDatabase);
    } else {
      password ??= randomBytes(32).toString('base64url');
      saved[key] = password;
      atomicPrivateWrite(credentialsPath, serializeEnv(saved)); // survive interruption before env write
      sql(businessDatabase, `CREATE ROLE ${identifier(role)} LOGIN INHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD ${quote(password)} IN ROLE ${identifier(base)};`, true);
    }
    const memberships = jsonSql(businessDatabase, `WITH RECURSIVE parents(oid) AS (SELECT oid FROM pg_roles WHERE rolname=${quote(role)} UNION SELECT m.roleid FROM pg_auth_members m JOIN parents p ON m.member=p.oid) SELECT coalesce(json_agg(rolname),'[]') FROM pg_roles WHERE oid IN (SELECT oid FROM parents) AND rolname NOT IN (${quote(role)},${quote(base)})`);
    if (memberships.length) throw new Error(`Existing ${role} has unexpected inherited memberships; refusing to continue`);
    sql(businessDatabase, `GRANT ${identifier(base)} TO ${identifier(role)}; ALTER ROLE ${identifier(role)} SET statement_timeout='10s';`);
    await verifyLogin(urlFor(role,password,businessDatabase),role,businessDatabase);
    saved[key] = password;
    atomicPrivateWrite(credentialsPath, serializeEnv(saved));
    result[kind] = { role, password, url: urlFor(role,password,businessDatabase) };
  }
  return result;
}

async function runIntegrationTests(inspect, roles, files) {
  const database = 'campus_integration_' + randomBytes(8).toString('hex');
  if (!/^campus_integration_[a-f0-9]{16}$/.test(database)) throw new Error('Unsafe test database name');
  const ownerPassword = (inspect.Config.Env ?? []).find((line) => line.startsWith('POSTGRES_PASSWORD='))?.slice('POSTGRES_PASSWORD='.length);
  if (!ownerPassword) throw new Error('Container owner credential unavailable for disposable integration database');
  console.log('Creating disposable integration database; business database is excluded from all test URLs.');
  sql('postgres', `CREATE DATABASE ${identifier(database)} OWNER postgres TEMPLATE template0;`);
  try {
    for (const file of files) sql(database, file.source);
    const ownerUrl = urlFor('postgres', ownerPassword, database);
    const webUrl = urlFor(roles.web.role, roles.web.password, database);
    const workerUrl = urlFor(roles.worker.role, roles.worker.password, database);
    await verifyLogin(ownerUrl,'postgres',database);
    await verifyLogin(webUrl,roles.web.role,database);
    const child = spawnSync(process.execPath, [join(root,'node_modules/vitest/vitest.mjs'),'run','server/api.integration.test.ts','server/local-auth.integration.test.ts','server/workspace.integration.test.ts','server/official-dates.test.ts','server/account-data.integration.test.ts'], {
      cwd: join(root,'apps/web'), stdio: 'inherit', env: { ...process.env, API_INTEGRATION_DATABASE_URL: ownerUrl, DATABASE_URL: webUrl, DATABASE_WORKER_URL: workerUrl, NEXT_PUBLIC_DATA_MODE: 'api', AUTH_PROVIDER: 'local', SESSION_ENCRYPTION_KEY: randomBytes(32).toString('base64'), APP_ORIGIN: 'http://localhost:3000' },
    });
    if (child.error || child.status !== 0) throw new Error(`Disposable API integration suites failed (exit ${child.status ?? 'unavailable'}); test database cleanup will still run`);
  } finally {
    sql('postgres', `DROP DATABASE ${identifier(database)} WITH (FORCE);`);
    console.log('Disposable integration database removed.');
  }
}

export async function main(args = process.argv.slice(2)) {
  if (args.some((arg) => !['--integration-tests','--integration-tests-only'].includes(arg) && !/^--through=\d{4,}$/.test(arg))) throw new Error('Usage: node scripts/setup-local-api.mjs [--integration-tests | --integration-tests-only] [--through=0007]');
  const ceilings = args.filter((arg) => arg.startsWith('--through='));
  if (ceilings.length > 1) throw new Error('Specify --through only once');
  const through = ceilings.length ? Number(ceilings[0].split('=')[1]) : Infinity;
  if (through < 7 || (through !== Infinity && !Number.isSafeInteger(through))) throw new Error('--through must be at least 0007');
  if (Number(process.versions.node.split('.')[0]) < 24) throw new Error('Node.js 24 or newer is required');
  process.umask(0o077);
  mkdirSync(privateRoot, { recursive: true, mode: 0o700 });
  chmodSync(privateRoot, 0o700);
  const lockPath = join(privateRoot, 'bootstrap.lock');
  const inspect = JSON.parse(docker(['inspect',container]))[0];
  if (!inspect.State.Running) throw new Error('Original PostgreSQL container is stopped; start it without replacing its volume');
  const mount = inspect.Mounts.find((item) => item.Destination === '/var/lib/postgresql/data');
  if (mount?.Type !== 'volume' || mount.Name !== 'campus-radar_campus_pg') throw new Error('Expected original campus-radar_campus_pg data volume; refusing to touch another database');
  const published = inspect.NetworkSettings.Ports?.['5432/tcp'];
  if (!published?.some((port) => port.HostIp === '127.0.0.1' && port.HostPort === '54322') || published.some((port) => port.HostIp !== '127.0.0.1')) throw new Error('PostgreSQL must publish only 127.0.0.1:54322');
  const info = jsonSql(businessDatabase, `SELECT json_build_object('version',current_setting('server_version_num')::int,'vector',(SELECT default_version FROM pg_available_extensions WHERE name='vector'),'owner',(SELECT rolsuper FROM pg_roles WHERE rolname=current_user));`);
  if (info.version !== 160006 || info.vector !== '0.8.7' || !info.owner) throw new Error('Expected trusted postgres owner, PostgreSQL 16.6, and available vector 0.8.7');
  const bases = jsonSql(businessDatabase, `SELECT json_agg(row_to_json(r)) FROM (SELECT rolname,rolcanlogin,rolsuper,rolcreatedb,rolcreaterole,rolreplication,rolbypassrls FROM pg_roles WHERE rolname IN ('campus_web','campus_worker','campus_scheduler')) r`);
  if (bases?.length !== 3 || bases.some((role) => role.rolcanlogin || role.rolsuper || role.rolcreatedb || role.rolcreaterole || role.rolreplication || role.rolbypassrls)) throw new Error('Expected three existing safe NOLOGIN application roles');
  if (sql(businessDatabase, "SELECT count(*) FROM pg_auth_members m JOIN pg_roles r ON r.oid=m.member WHERE r.rolname IN ('campus_web','campus_worker','campus_scheduler')") !== '0') throw new Error('Application base roles must not inherit other roles');
  if (args.includes('--integration-tests-only')) {
    if (args.includes('--integration-tests')) throw new Error('Choose either --integration-tests or --integration-tests-only');
    const env = readEnv(envPath);
    const roles = {};
    for (const [kind,key] of [['web','DATABASE_URL'],['worker','DATABASE_WORKER_URL']]) {
      let url;
      try { url = new URL(env[key]); } catch { throw new Error('Missing private restricted test credential: '+key); }
      if (url.username !== `campus_${kind}_login` || !['127.0.0.1','localhost'].includes(url.hostname) || url.port !== '54322' || !url.password) throw new Error('Expected restricted local credential for '+kind);
      roles[kind] = { role: url.username, password: decodeURIComponent(url.password) };
    }
    const files = discoverMigrations(readdirSync(join(root,'database/migrations')),through).map((name) => ({ name, source: readFileSync(join(root,'database/migrations',name),'utf8') }));
    await runIntegrationTests(inspect,roles,files);
    return;
  }
  // Use an atomic filesystem lock; concurrent mutations are rejected, and stale
  // lock recovery is manual so a disconnected client cannot launch another run.
  try { writeFileSync(lockPath, String(process.pid), { flag: 'wx', mode: 0o600 }); }
  catch { throw new Error('Bootstrap lock exists under .data/local-api-bootstrap; verify no setup process is running before removing a stale lock'); }
  const { unlinkSync } = await import('node:fs');
  let reference;
  try {
    const backupRoot = join(privateRoot,'backups',new Date().toISOString().replaceAll(':','-') + '-' + randomBytes(4).toString('hex'));
    mkdirSync(backupRoot,{ recursive:true,mode:0o700 });
    const dump = execFileSync('docker',['exec',container,'pg_dump','-U','postgres','-d',businessDatabase,'-Fc'],{maxBuffer:512*1024*1024,stdio:['ignore','pipe','pipe']});
    writeFileSync(join(backupRoot,'campus_radar.dump'),dump,{mode:0o600});
    atomicPrivateWrite(join(backupRoot,'globals.sql'),docker(['exec',container,'pg_dumpall','-U','postgres','--globals-only'],undefined,true));
    docker(['exec','-i',container,'pg_restore','--list'],dump);
    atomicPrivateWrite(join(backupRoot,'manifest.json'),JSON.stringify({container,volume:mount.Name,serverVersion:info.version,vectorVersion:info.vector,database:businessDatabase,dumpSha256:hash(dump),createdAt:new Date().toISOString()},null,2)+'\n');
    console.log('Verified original PostgreSQL 16.6 / vector 0.8.7 volume; private database and globals backups saved.');
    const files = discoverMigrations(readdirSync(join(root,'database/migrations')), through).map((name) => { const source = readFileSync(join(root,'database/migrations',name),'utf8'); return {name,source,checksum:hash(source)}; });
    reference = 'campus_schema_check_' + randomBytes(8).toString('hex');
    sql('postgres',`CREATE DATABASE ${identifier(reference)} OWNER postgres TEMPLATE template0;`);
    // enable-pgvector.sh can install only the extension before migration 0002.
    // Mirror that known independent prerequisite; its typed job columns still
    // must match an actual complete migration stage.
    if (sql(businessDatabase, "SELECT EXISTS(SELECT 1 FROM pg_extension WHERE extname='vector' AND extversion='0.8.7')") === 't') sql(reference, 'CREATE EXTENSION vector;');
    const snapshots = [];
    for (const file of files) { sql(reference,file.source); snapshots.push(catalog(reference)); }
    const actual = catalog(businessDatabase);
    const stage = snapshots.findIndex((expected) => compareCatalogs(expected,actual).length === 0);
    if (stage < 0) {
      const nearest = snapshots.map((expected,index) => ({index,differences:compareCatalogs(expected,actual)})).sort((a,b) => a.differences.length-b.differences.length)[0];
      throw new Error('Database is partially initialized or differs from migrations; no baseline or migration was recorded. Nearest complete stage '+files[nearest.index].name+': '+nearest.differences.slice(0,12).join('; '));
    }
    const trackerExists = sql(businessDatabase,"SELECT to_regclass('app.schema_migrations') IS NOT NULL") === 't';
    let records = [];
    if (trackerExists) records = jsonSql(businessDatabase,'SELECT coalesce(json_agg(row_to_json(m)),\'[]\') FROM (SELECT filename,checksum FROM app.schema_migrations ORDER BY applied_order) m');
    for (const record of records) {
      const file = files.find((candidate) => candidate.name === record.filename);
      if (!file || file.checksum !== record.checksum) throw new Error('Recorded migration checksum mismatch: '+record.filename);
    }
    if (records.length && (records.length !== stage+1 || records.some((record,index) => record.filename !== files[index].name))) throw new Error('Migration records do not match the complete verified schema; refusing to guess');
    if (!trackerExists) sql(businessDatabase,`CREATE TABLE app.schema_migrations(filename text PRIMARY KEY,checksum text NOT NULL CHECK(checksum ~ '^[a-f0-9]{64}$'),applied_order integer NOT NULL UNIQUE,baseline boolean NOT NULL DEFAULT false,applied_at timestamptz NOT NULL DEFAULT now()); REVOKE ALL ON app.schema_migrations FROM PUBLIC,campus_web,campus_worker,campus_scheduler;`);
    if (!records.length) {
      sql(businessDatabase, 'BEGIN;\n'+files.slice(0,stage+1).map((file,index) => `INSERT INTO app.schema_migrations(filename,checksum,applied_order,baseline) VALUES(${quote(file.name)},${quote(file.checksum)},${index+1},true);`).join('\n')+'\nCOMMIT;');
      console.log('Registered fully verified historical baseline: '+files.slice(0,stage+1).map((file)=>file.name.slice(0,4)).join(', '));
    }
    for (let index=stage+1;index<files.length;index++) {
      const file=files[index];
      sql(businessDatabase,'BEGIN;\n'+migrationBody(file.source)+`\nINSERT INTO app.schema_migrations(filename,checksum,applied_order) VALUES(${quote(file.name)},${quote(file.checksum)},${index+1});\nCOMMIT;`);
      const differences=compareCatalogs(snapshots[index],catalog(businessDatabase));
      if (differences.length) throw new Error('Post-migration verification failed for '+file.name+': '+differences.slice(0,8).join('; '));
      console.log('Applied and verified '+file.name);
    }
    const env=readEnv(envPath);
    for (const [name,value] of Object.entries(env)) {
      if (name === 'API_INTEGRATION_DATABASE_URL' || name === 'POSTGRES_PASSWORD') throw new Error('Owner/test credentials must not be stored in the web environment: '+name);
      if (name.includes('DATABASE') && value.startsWith('postgres') && new URL(value).username === 'postgres') throw new Error('Owner URL must not be stored in the web environment: '+name);
    }
    const roles=await configureRoles(inspect,env);
    const key=env.SESSION_ENCRYPTION_KEY ?? randomBytes(32).toString('base64');
    if (Buffer.from(key,'base64').length !== 32) throw new Error('Existing SESSION_ENCRYPTION_KEY must decode to exactly 32 bytes; value was preserved');
    const fileRoot=join(root,'apps/web/.data/private-files');
    mkdirSync(fileRoot,{recursive:true,mode:0o700});
    chmodSync(fileRoot,0o700);
    atomicPrivateWrite(envPath,serializeEnv({...env,NEXT_PUBLIC_DATA_MODE:'api',AUTH_PROVIDER:'local',DATABASE_URL:roles.web.url,DATABASE_WORKER_URL:roles.worker.url,SESSION_ENCRYPTION_KEY:key,APP_ORIGIN:'http://127.0.0.1:3000',NEXT_PUBLIC_APP_URL:'http://127.0.0.1:3000',PRIVATE_FILE_ROOT:fileRoot}));
    console.log('API environment saved with mode 0600 and restricted logins. No sample data or collectors were started.');
    if (args.includes('--integration-tests')) await runIntegrationTests(inspect,roles,files);
  } finally {
    try { if(reference) sql('postgres',`DROP DATABASE IF EXISTS ${identifier(reference)} WITH (FORCE);`); }
    finally { unlinkSync(lockPath); }
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => { console.error('Local API setup stopped: '+error.message); process.exitCode=1; });
}
