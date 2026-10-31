import importlib.util
import json
import pathlib
import re
import subprocess
import tempfile
import unittest
import zipfile

ROOT = pathlib.Path(__file__).resolve().parents[2]


def module(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    result = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(result)
    return result


class ConfigureTest(unittest.TestCase):
    def test_ip_configuration_is_private_and_reinitialization_preserves_keys(self):
        configure = module('configure', ROOT / 'deploy/configure.py')
        with tempfile.TemporaryDirectory() as tmp:
            directory = pathlib.Path(tmp)
            configure.initialize(directory, 'http://39.107.60.14')
            app = directory / 'application-prod.yml'
            before = app.read_bytes()
            data = json.loads(before)
            self.assertFalse(data['server']['servlet']['session']['cookie']['secure'])
            self.assertEqual('http://39.107.60.14', data['campus']['allowed-origins'])
            self.assertEqual('', data['campus']['mail-key'])
            self.assertIsNotNone(re.fullmatch(data['server']['tomcat']['remoteip']['internal-proxies'], '127.0.0.1'))
            self.assertEqual(0o600, app.stat().st_mode & 0o777)
            with self.assertRaises(FileExistsError):
                configure.initialize(directory, 'https://jobs.example.com')
            self.assertEqual(before, app.read_bytes())

    def test_https_transition_preserves_credentials_and_signing_key(self):
        configure = module('configure', ROOT / 'deploy/configure.py')
        with tempfile.TemporaryDirectory() as tmp:
            directory = pathlib.Path(tmp)
            configure.initialize(directory, 'http://39.107.60.14')
            before = json.loads((directory / 'application-prod.yml').read_text())
            dependencies = (directory / 'dependencies.env').read_bytes()
            configure.update_origin(directory, 'https://jobs.example.com')
            after = json.loads((directory / 'application-prod.yml').read_text())
            self.assertTrue(after['server']['servlet']['session']['cookie']['secure'])
            self.assertEqual(before['campus']['backup-key'], after['campus']['backup-key'])
            self.assertEqual(before['spring'], after['spring'])
            self.assertEqual(dependencies, (directory / 'dependencies.env').read_bytes())

    def test_origin_rejects_credentials_paths_and_config_injection(self):
        configure = module('configure', ROOT / 'deploy/configure.py')
        for origin in ['http://user:pass@example.com', 'http://example.com/path',
                       'https://example.com?a=1', 'https://example.com#x',
                       'http://a;listen 81', 'file:///tmp/x', 'http://example.com:8081']:
            with self.subTest(origin=origin), self.assertRaises(ValueError):
                configure.checked_origin(origin)


class PackageTest(unittest.TestCase):
    def test_release_audit_rejects_embedded_development_credentials(self):
        package = module('package_release', ROOT / 'scripts/package-release.py')
        with tempfile.TemporaryDirectory() as tmp:
            jar = pathlib.Path(tmp) / 'app.jar'
            with zipfile.ZipFile(jar, 'w') as archive:
                archive.writestr('BOOT-INF/classes/application-dev.yml', 'secret')
                archive.writestr('BOOT-INF/classes/application.yml', 'base')
            with self.assertRaises(ValueError):
                package.validate_jar(jar)

    def test_restore_refuses_nonempty_or_unreachable_database_before_import(self):
        script = ROOT / 'deploy/bin/restore-db-files.sh'
        for fake in ['printf "1\\n"', 'return 1']:
            result = subprocess.run([
                'bash', '-c', 'source "$1"; mysql_root() { ' + fake + '; }; '
                'require_empty_target; echo IMPORT_WOULD_RUN', '_', str(script)
            ], capture_output=True, text=True)
            self.assertNotEqual(0, result.returncode)
            self.assertNotIn('IMPORT_WOULD_RUN', result.stdout)

    def test_native_bundle_excludes_secrets_and_legacy_runners(self):
        package = module('package_release', ROOT / 'scripts/package-release.py')
        with tempfile.TemporaryDirectory() as tmp:
            root = pathlib.Path(tmp)
            (root / 'frontend/dist').mkdir(parents=True)
            (root / 'frontend/dist/index.html').write_text('<html>frontend</html>')
            (root / 'docs/contracts').mkdir(parents=True)
            (root / 'docs/contracts/schema.sql').write_text('CREATE TABLE users(id INT);')
            (root / 'docs/11-deployment-bt-native.md').write_text('Native deployment')
            (root / 'deploy/baota').mkdir(parents=True)
            for name in ['nginx.conf', 'java-command.txt', 'prepare-directories.sh']:
                (root / 'deploy/baota' / name).write_text(name)
            jar = root / 'app.jar'
            with zipfile.ZipFile(jar, 'w') as archive:
                archive.writestr('BOOT-INF/classes/application.yml', 'base')
                archive.writestr('BOOT-INF/classes/contracts/openapi.json', '{}')
            private = root / 'application-prod.yml'
            private.write_text('password: PRIVATE_VALUE')
            stage = root / 'release'
            package.assemble_native(root, stage, jar, private)
            files = {str(p.relative_to(stage)) for p in stage.rglob('*') if p.is_file()}
            self.assertIn('baota/nginx.conf', files)
            self.assertIn('backend/app.jar', files)
            self.assertFalse(any('compose' in p or p.endswith('.service') or 'config/' in p for p in files))
            self.assertFalse(any(b'PRIVATE_VALUE' in p.read_bytes() for p in stage.rglob('*') if p.is_file()))

    def test_native_packaging_refuses_pending_passwords(self):
        package = module('package_release', ROOT / 'scripts/package-release.py')
        with tempfile.TemporaryDirectory() as tmp:
            path = pathlib.Path(tmp) / 'application-prod.yml'
            path.write_text('password: CHANGE_ME_REDIS_PASSWORD')
            with self.assertRaises(ValueError):
                package.validate_production_config(path)

    def test_private_export_never_deletes_an_existing_configuration(self):
        package = module('package_release', ROOT / 'scripts/package-release.py')
        with tempfile.TemporaryDirectory() as tmp:
            source, target = pathlib.Path(tmp) / 'source.yml', pathlib.Path(tmp) / 'private.yml'
            source.write_text('new-private-value')
            target.write_text('existing-private-value')
            with self.assertRaises(FileExistsError):
                package.export_private_config(source, target)
            self.assertEqual('existing-private-value', target.read_text())
            target.unlink()
            package.export_private_config(source, target)
            self.assertEqual(0o600, target.stat().st_mode & 0o777)
            self.assertEqual(source.read_bytes(), target.read_bytes())


if __name__ == '__main__':
    unittest.main()
