#!/usr/bin/env python3
"""Optional local launcher. Application settings are read by Spring from the two YAML files."""
import argparse,json,os,pathlib,re,signal,socket,subprocess,sys,time,urllib.request
ROOT=pathlib.Path(__file__).resolve().parents[1]
RUN=ROOT/'.data/run'
COMPOSE=['docker','compose','--project-name','campus-radar-dev','-f',str(ROOT/'infra/compose.yml')]
DB=os.environ.get('CAMPUS_DATABASE','campus_radar')

def command(args,**kwargs):
    return subprocess.run([str(x) for x in args],cwd=ROOT,check=True,**kwargs)

def mysql(sql):
    return command(COMPOSE+['exec','-T','mysql','sh','-c','MYSQL_PWD="$MYSQL_ROOT_PASSWORD" exec mysql --default-character-set=utf8mb4 --batch --skip-column-names -uroot'],input=sql.encode(),stdout=subprocess.PIPE).stdout.decode()

def db_name(value):
    if value!='campus_radar' and not re.fullmatch(r'campus_radar_test_[a-z0-9_]{1,55}',value):
        raise RuntimeError('Database name must be campus_radar or campus_radar_test_<lowercase suffix>.')
    return value

def initialize_test_database(database):
    if not database.startswith('campus_radar_test_'):raise RuntimeError('Only isolated test databases can be initialized by this tool.')
    mysql(f"CREATE DATABASE IF NOT EXISTS `{database}` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci; GRANT SELECT,INSERT,UPDATE,DELETE ON `{database}`.* TO 'campus_app'@'%';")
    count=int(mysql(f"SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA='{database}';").strip())
    if count==0:mysql(f'USE `{database}`;\n'+(ROOT/'docs/contracts/schema.sql').read_text())

def stop_apps():
    file=RUN/'processes.json'
    if not file.exists():return
    for entry in json.loads(file.read_text()).values():
        pid=entry.get('pid')
        try:
            stamp=subprocess.check_output(['ps','-p',str(pid),'-o','lstart='],text=True,stderr=subprocess.DEVNULL).strip()
            if stamp==entry.get('stamp') and os.getpgid(pid)==pid:os.killpg(pid,signal.SIGTERM)
        except (ProcessLookupError,subprocess.CalledProcessError):pass
    time.sleep(1);file.unlink(missing_ok=True)

def listening(port):
    with socket.socket() as sock:return sock.connect_ex(('127.0.0.1',port))==0

def spawn(args,env,log):
    with (RUN/log).open('ab') as output:
        process=subprocess.Popen([str(x) for x in args],cwd=ROOT,env=env,stdin=subprocess.DEVNULL,stdout=output,stderr=subprocess.STDOUT,start_new_session=True)
    time.sleep(.1)
    return {'pid':process.pid,'stamp':subprocess.check_output(['ps','-p',str(process.pid),'-o','lstart='],text=True).strip()}

def wait_url(url,seconds=60):
    opener=urllib.request.build_opener(urllib.request.ProxyHandler({}));deadline=time.time()+seconds
    while time.time()<deadline:
        try:
            with opener.open(url,timeout=2) as response:
                if response.status==200:return
        except Exception:pass
        time.sleep(.5)
    raise RuntimeError(f'Service did not become ready: {url}; see .data/run logs.')

def start(no_build=False,dev=False):
    database=db_name(DB);RUN.mkdir(parents=True,exist_ok=True)
    command(COMPOSE+['up','-d','--wait','mysql','redis','rabbitmq','mailpit'])
    # Normal startup only connects to the existing database. Acceptance owns its temporary schema.
    if database.startswith('campus_radar_test_'):initialize_test_database(database)
    if not no_build:
        command([ROOT/'backend/mvnw','-B','-f',ROOT/'backend/pom.xml',f'-Dmaven.repo.local={ROOT}/.data/maven-repository','clean','-DskipTests','package'])
        if not (ROOT/'frontend/node_modules').exists():command(['npm','--prefix','frontend','ci'])
        command(['npm','--prefix','frontend','run','build'])
    stop_apps()
    for port in (8080,5179):
        if listening(port):raise RuntimeError(f'Port {port} is occupied by another process; stop it before starting this app.')
    args=['java','-jar',ROOT/'backend/target/campus-radar-0.1.0-SNAPSHOT.jar']
    if database.startswith('campus_radar_test_'):
        args += [f'--spring.datasource.url=jdbc:mysql://127.0.0.1:33077/{database}?connectionTimeZone=UTC&forceConnectionTimeZoneToSession=true&characterEncoding=UTF-8',f'--spring.session.redis.namespace=campus:session:{database}',f'--campus.task.queue=campus.tasks.{database}',f'--campus.task.exchange=campus.events.{database}',f'--campus.file-storage-root={ROOT}/.data/private-files/{database}',f'--campus.backup-environment={database}','--campus.rate-limit-multiplier=10','--campus.schedule.notification-poll-ms=1000']
    env={**os.environ,'VITE_DEMO_MODE':'false'}
    for log in ('backend.log','frontend.log'):(RUN/log).write_text('')
    processes={'backend':spawn(args,env,'backend.log')};(RUN/'processes.json').write_text(json.dumps(processes))
    wait_url('http://127.0.0.1:8080/api/v1/public/stats')
    processes['frontend']=spawn(['npm','--prefix',ROOT/'frontend','run','dev' if dev else 'preview','--','--port','5179','--strictPort'],env,'frontend.log')
    (RUN/'processes.json').write_text(json.dumps(processes));wait_url('http://127.0.0.1:5179')
    (RUN/'runtime.json').write_text(json.dumps({'database':database,'site':'http://127.0.0.1:5179','mail':'http://127.0.0.1:38025'}))
    print('Site: http://127.0.0.1:5179\nLocal mail: http://127.0.0.1:38025')

def promote(email):
    import unicodedata
    encoded=unicodedata.normalize('NFKC',email).strip().lower().encode().hex();database=db_name(DB)
    result=mysql(f"USE `{database}`; START TRANSACTION; SET @admin_target=(SELECT id FROM users WHERE email=CONVERT(UNHEX('{encoded}') USING utf8mb4) AND status='ACTIVE' FOR UPDATE); UPDATE users SET role='ADMIN',auth_version=auth_version+1,version=version+1 WHERE id=@admin_target; INSERT INTO audit_logs(id,actor_id,action,target_type,target_id,reason,request_id,change_summary) SELECT UUID(),NULL,'LOCAL_ADMIN_BOOTSTRAP','USER',id,'受控本机命令授权',UUID(),JSON_OBJECT('role','ADMIN') FROM users WHERE id=@admin_target; COMMIT; SELECT IF(@admin_target IS NULL,'MISSING','OK');")
    if result.strip()!='OK':raise RuntimeError('No matching active account; register an active account before promotion.')
    print('Admin updated. Sign in again to refresh the session.')

def main():
    parser=argparse.ArgumentParser();parser.add_argument('action',choices=['start','stop','promote','drop-test']);parser.add_argument('value',nargs='?');parser.add_argument('--no-build',action='store_true');parser.add_argument('--dev',action='store_true');parser.add_argument('--services',action='store_true');args=parser.parse_args()
    try:
        if args.action=='start':start(args.no_build,args.dev)
        elif args.action=='stop':
            stop_apps()
            if args.services:command(COMPOSE+['stop'])
        elif args.action=='promote':
            if not args.value:raise RuntimeError('Provide an existing verified account email.')
            promote(args.value)
        elif args.action=='drop-test':
            database=db_name(args.value or DB)
            if not database.startswith('campus_radar_test_'):raise RuntimeError('Only isolated test databases can be dropped.')
            mysql(f'DROP DATABASE IF EXISTS `{database}`;')
    except (RuntimeError,subprocess.CalledProcessError) as error:
        print(str(error),file=sys.stderr);sys.exit(1)

if __name__=='__main__':main()
