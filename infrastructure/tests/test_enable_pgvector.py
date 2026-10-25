"""Exercise the real shell entry point without mounting the user's database.

Docker is replaced at the process boundary; failures must stop or roll back the
actual script. Run: python3 -m unittest discover -s infrastructure/tests -v
"""
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]
FAKE_DOCKER = r'''#!/usr/bin/env python3
import json, os, sys
from pathlib import Path
p = Path(os.environ['DOCKER_TEST_STATE'])
s = json.loads(p.read_text())
a = sys.argv[1:]
s['calls'].append(a)
p.write_text(json.dumps(s))
def save(): p.write_text(json.dumps(s))
def fail(): sys.exit(1)
if a[0] == 'info':
    if s.get('offline'): fail()
elif a[:2] == ['compose', 'version']: print('2.40.0')
elif a[0] == 'inspect':
    if s.get('missing_container'): fail()
    if '--format' not in a: sys.exit(0)
    fmt = a[a.index('--format') + 1]
    if '.Config.Image' in fmt: print('postgres:16.6-alpine')
    elif '.State.Running' in fmt: print('true' if s.get('running') else 'false')
    elif 'com.docker.compose.project' in fmt: print(s.get('project', 'campus-radar'))
    elif 'com.docker.compose.service' in fmt: print('postgres')
    elif '.Mounts' in fmt: print(s.get('volume', 'campus-radar_campus_pg'))
    elif '.Image' in fmt:
        changed = s.get('changed_before_lock') and Path(s['lock_path']).is_dir()
        print('sha256:already-vector-image' if changed else 'sha256:previous-image')
    else: fail()
elif a[:2] == ['volume', 'inspect']:
    if s.get('missing_volume'): fail()
elif a[0] == 'run':
    if s.get('data_major', '16') != '16': fail()
elif a[0] == 'start':
    s['running'] = True; save()
elif a[0] == 'tag': pass
elif a[0] == 'compose':
    if 'build' in a and s.get('build_fail'): fail()
    if 'up' in a:
        rollback = any('rollback' in v for v in a)
        s['rollbacks' if rollback else 'upgrades'] = s.get('rollbacks' if rollback else 'upgrades', 0) + 1
        save()
        if s.get('upgrade_fail') and not rollback: fail()
        if s.get('rollback_fail') and rollback: fail()
        s['running'] = True; save()
elif a[0] == 'exec':
    if 'pg_isready' in a:
        if not s.get('running'): fail()
    elif 'pg_dump' in a:
        if s.get('backup_fail'): fail()
        sys.stdout.buffer.write(b'PGDMP-fixture')
    elif 'pg_dumpall' in a: print('-- private global roles fixture')
    elif 'pg_restore' in a:
        if not sys.stdin.buffer.read().startswith(b'PGDMP'): fail()
        if s.get('invalid_backup'): fail()
    elif 'psql' in a:
        if '-c' in a:
            print(s.get('server_major', '16'))
        else:
            s['sql'] = sys.stdin.read(); save()
            if s.get('sql_fail'): fail()
            print('BEGIN\nCREATE EXTENSION\n0.8.7\n0\nCOMMIT')
    else: fail()
else: fail()
'''


class EnablePgvectorTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='radar vector test ')
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.script = self.root / 'scripts/enable-pgvector.sh'
        self.script.parent.mkdir()
        source = ROOT / 'scripts/enable-pgvector.sh'
        if source.exists():
            shutil.copy(source, self.script)
        infra = self.root / 'infrastructure'
        (infra / 'postgres').mkdir(parents=True)
        for name, text in [('docker-compose.yml', 'name: campus-radar\n'),
                           ('postgres/Dockerfile', 'FROM postgres:16.6-alpine\n')]:
            (infra / name).write_text(text)
        self.bin = self.root / 'bin'
        self.bin.mkdir()
        docker = self.bin / 'docker'
        docker.write_text(FAKE_DOCKER)
        docker.chmod(0o700)
        self.state_file = self.root / 'state.json'

    def run_script(self, state=None, args=()):
        self.state_file.write_text(json.dumps({'calls': [], **(state or {})}))
        env = {**os.environ, 'PATH': f'{self.bin}:{os.environ["PATH"]}',
               'DOCKER_TEST_STATE': str(self.state_file),
               'CAMPUS_PG_BACKUP_DIR': str(self.root / 'private backups')}
        result = subprocess.run(['bash', str(self.script), *args], cwd='/',
                                env=env, text=True, capture_output=True, timeout=15)
        self.state = json.loads(self.state_file.read_text())
        return result

    def test_happy_path_backs_up_before_replacing_existing_service(self):
        result = self.run_script()
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        calls = self.state['calls']
        dump = next(i for i, c in enumerate(calls) if 'pg_dump' in c)
        up = next(i for i, c in enumerate(calls) if 'up' in c)
        self.assertLess(dump, up)
        self.assertIn('CREATE EXTENSION IF NOT EXISTS vector', self.state['sql'])
        self.assertIn('BEGIN', self.state['sql'])
        self.assertIn('COMMIT', self.state['sql'])
        self.assertNotIn('ALTER TABLE jobs', self.state['sql'])
        self.assertFalse(any('down' in c or 'rm' == c[0] for c in calls))
        backups = list((self.root / 'private backups').glob('*/database.dump'))
        self.assertEqual(len(backups), 1)
        self.assertEqual(backups[0].stat().st_mode & 0o777, 0o600)
        self.assertIn('启用成功', result.stdout)

    def test_backup_failure_never_builds_or_replaces(self):
        result = self.run_script({'backup_fail': True})
        self.assertNotEqual(result.returncode, 0)
        self.assertFalse(any('build' in c or 'up' in c for c in self.state['calls']))
        self.assertNotIn('sql', self.state)

    def test_invalid_backup_never_replaces(self):
        result = self.run_script({'invalid_backup': True})
        self.assertNotEqual(result.returncode, 0)
        self.assertNotIn('upgrades', self.state)

    def test_build_failure_keeps_original_container(self):
        result = self.run_script({'build_fail': True})
        self.assertNotEqual(result.returncode, 0)
        self.assertNotIn('upgrades', self.state)
        self.assertNotIn('rollbacks', self.state)

    def test_recreate_failure_rolls_back_to_previous_image(self):
        result = self.run_script({'upgrade_fail': True})
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(self.state.get('rollbacks'), 1)
        self.assertNotIn('sql', self.state)

    def test_sql_failure_keeps_extension_capable_image(self):
        result = self.run_script({'sql_fail': True})
        self.assertNotEqual(result.returncode, 0)
        self.assertNotIn('rollbacks', self.state)
        self.assertIn('保留', result.stderr)

    def test_wrong_volume_or_project_is_rejected_before_start(self):
        for state in [{'volume': 'other_data'}, {'project': 'other-project'},
                      {'missing_container': True}, {'missing_volume': True},
                      {'data_major': '17'}, {'offline': True}]:
            with self.subTest(state=state):
                result = self.run_script(state)
                self.assertNotEqual(result.returncode, 0)
                self.assertFalse(any(c[0] == 'start' or 'up' in c for c in self.state['calls']))

    def test_check_does_not_start_backup_build_or_modify_database(self):
        result = self.run_script(args=['--check'])
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertFalse(any(c[0] in ['start', 'exec', 'tag'] or 'build' in c or 'up' in c
                             for c in self.state['calls']))
        self.assertFalse((self.root / 'private backups').exists())

    def test_help_needs_no_docker_and_unknown_option_fails(self):
        result = self.run_script({'offline': True}, ['--help'])
        self.assertEqual(result.returncode, 0)
        self.assertEqual(self.state['calls'], [])
        result = self.run_script(args=['--wrong'])
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(self.state['calls'], [])

    def test_repeated_runs_create_separate_backups_without_business_migrations(self):
        for _ in range(2):
            result = self.run_script({'running': True})
            self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(len(list((self.root / 'private backups').glob('*/database.dump'))), 2)

    def test_existing_lock_prevents_concurrent_change_and_is_not_removed(self):
        lock = self.root / 'infrastructure/.pgvector-enable.lock'
        lock.mkdir()
        result = self.run_script()
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('已有脚本在执行', result.stderr)
        self.assertTrue(lock.is_dir())
        self.assertFalse(any(c[0] == 'start' or 'build' in c or 'up' in c for c in self.state['calls']))

    def test_rollback_snapshot_is_taken_after_acquiring_lock(self):
        result = self.run_script({'changed_before_lock': True, 'upgrade_fail': True,
                                  'lock_path': str(self.root / 'infrastructure/.pgvector-enable.lock')})
        self.assertNotEqual(result.returncode, 0)
        tag = next(c for c in self.state['calls'] if c[0] == 'tag')
        self.assertEqual(tag[1], 'sha256:already-vector-image')


if __name__ == '__main__':
    unittest.main()
