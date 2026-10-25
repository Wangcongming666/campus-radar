"""Opt-in image integration check; never mounts the Campus Radar data volume."""
import os
from pathlib import Path
import subprocess
import time
import unittest
import uuid

ROOT = Path(__file__).resolve().parents[2]


@unittest.skipUnless(os.environ.get('PGVECTOR_IMAGE_TEST') == '1',
                     'set PGVECTOR_IMAGE_TEST=1 after building the pgvector image')
class PgvectorImageTests(unittest.TestCase):
    def docker(self, *args, **kwargs):
        return subprocess.run(['docker', *args], capture_output=True, text=True,
                              check=True, timeout=30, **kwargs)

    def test_script_sql_preserves_existing_data_and_is_repeatable(self):
        name = 'campus-radar-vector-check-' + uuid.uuid4().hex[:10]
        self.addCleanup(lambda: subprocess.run(['docker', 'rm', '-f', name],
                                               capture_output=True, timeout=30))
        self.docker('run', '-d', '--name', name, '--network', 'none',
                    '--tmpfs', '/var/lib/postgresql/data',
                    '-e', 'POSTGRES_HOST_AUTH_METHOD=trust',
                    '-e', 'POSTGRES_DB=campus_radar',
                    'campus-radar-postgres:16.6-pgvector-0.8.7')
        for _ in range(60):
            ready = subprocess.run(['docker', 'exec', name, 'psql', '-X',
                                    '-U', 'postgres', '-d', 'campus_radar', '-Atc', 'SELECT 1;'],
                                   capture_output=True, timeout=10)
            if ready.returncode == 0:
                break
            time.sleep(1)
        else:
            self.fail('disposable PostgreSQL did not become ready')
        source = (ROOT / 'scripts/enable-pgvector.sh').read_text()
        sql = source.split("<<'SQL'\n", 1)[1].split('\nSQL\n', 1)[0]
        def query(sql):
            return self.docker('exec', '-i', name, 'psql', '-X', '-U', 'postgres',
                               '-d', 'campus_radar', '-At', '-v', 'ON_ERROR_STOP=1',
                               input=sql).stdout
        query("CREATE TABLE existing_record (id int PRIMARY KEY, note text); "
              "INSERT INTO existing_record VALUES (1, 'keep me');")
        for _ in range(2):
            self.assertIn('0.8.7', query(sql))
        self.assertEqual(query('SELECT note FROM existing_record;').strip(), 'keep me')
        self.assertEqual(query("SELECT '[1,0,0]'::vector <=> '[1,0,0]'::vector;").strip(), '0')
        self.assertEqual(query("SELECT vector_dims(array_fill(0::real, ARRAY[1536])::vector);").strip(), '1536')


if __name__ == '__main__':
    unittest.main()
