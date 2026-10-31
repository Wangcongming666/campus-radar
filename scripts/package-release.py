#!/usr/bin/env python3
"""Build a native BaoTa upload bundle and a separate, private production config."""
import argparse
import hashlib
import json
import os
import pathlib
import re
import shutil
import subprocess
import tarfile
import time
import zipfile

ROOT = pathlib.Path(__file__).resolve().parents[1]
BAOTA_FILES = ['nginx.conf', 'java-command.txt', 'prepare-directories.sh']


def validate_jar(path):
    with zipfile.ZipFile(path) as archive:
        names = set(archive.namelist())
        if any(pathlib.PurePosixPath(name).name in (
                'application-dev.yml', 'application-dev.yaml',
                'application-prod.yml', 'application-prod.yaml', 'test-access.json') for name in names):
            raise ValueError('Release JAR contains a private environment configuration.')
        if not {'BOOT-INF/classes/application.yml', 'BOOT-INF/classes/contracts/openapi.json'} <= names:
            raise ValueError('Missing application configuration or API contract in executable JAR.')


def validate_production_config(path):
    if not path.is_file() or path.is_symlink():
        raise ValueError('Missing regular backend/config/application-prod.yml.')
    content = path.read_text()
    if re.search(r'CHANGE_ME_[A-Z_]+|填写.+密码|填写.+密钥', content):
        raise ValueError('Production credentials are still pending. Complete the private config before packaging.')


def checked_copy(source, target):
    if source.is_symlink():
        raise ValueError('Release sources must not contain symlinks.')
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(source, target)
    target.chmod(0o644)


def export_private_config(source, target):
    descriptor = os.open(target, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    try:
        with os.fdopen(descriptor, 'wb') as handle:
            handle.write(source.read_bytes())
    except Exception:
        target.unlink(missing_ok=True)
        raise


def assemble_native(root, stage, jar, private_config):
    validate_production_config(private_config)
    validate_jar(jar)
    stage.mkdir(parents=True, mode=0o755)
    checked_copy(jar, stage / 'backend/app.jar')
    dist = root / 'frontend/dist'
    if not (dist / 'index.html').is_file():
        raise ValueError('Missing frontend/dist/index.html.')
    for source in dist.rglob('*'):
        if source.is_symlink():
            raise ValueError('Frontend output contains a symlink.')
        if source.is_file():
            checked_copy(source, stage / 'frontend' / source.relative_to(dist))
    checked_copy(root / 'docs/contracts/schema.sql', stage / 'database/schema.sql')
    checked_copy(root / 'docs/11-deployment-bt-native.md', stage / 'README-部署.md')
    for name in BAOTA_FILES:
        checked_copy(root / 'deploy/baota' / name, stage / 'baota' / name)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--offline', action='store_true', help='Use the existing Maven cache only.')
    parser.add_argument('--version', default=time.strftime('%Y%m%dT%H%M%SZ', time.gmtime()))
    args = parser.parse_args()
    if not re.fullmatch(r'[A-Za-z0-9-]+', args.version):
        parser.error('Version must contain only letters, digits or hyphens.')
    output = ROOT / '.data/releases'
    name = 'campus-radar-native-' + args.version
    stage, archive = output / name, output / (name + '.tar.gz')
    private_source = ROOT / 'backend/config/application-prod.yml'
    try:
        validate_production_config(private_source)
    except ValueError as error:
        parser.error(str(error))
    private_copy = output / (name + '-application-prod.yml')
    if stage.exists() or archive.exists() or private_copy.exists() or private_copy.is_symlink():
        parser.error('Release version already exists; choose a new version.')
    maven = [str(ROOT / 'backend/mvnw'), '-B', f'-Dmaven.repo.local={ROOT}/.data/maven-repository']
    if args.offline:
        maven.append('-o')
    subprocess.run(maven + ['clean', 'package'], cwd=ROOT / 'backend', check=True)
    subprocess.run(['npm', 'test'], cwd=ROOT / 'frontend', check=True)
    subprocess.run(['npm', 'run', 'build'], cwd=ROOT / 'frontend', check=True)
    jar = ROOT / 'backend/target/campus-radar-0.1.0-SNAPSHOT.jar'
    assemble_native(ROOT, stage, jar, private_source)
    manifest = {
        'release': name, 'builtAtUtc': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
        'java': 21, 'deployment': 'BaoTa Java project + HTML project; native services',
        'database': 'fresh MySQL 8.4, schema only', 'includesLocalAccounts': False,
        'includesLocalPrivateFiles': False, 'includesRuntimeSecrets': False,
        'productionConfig': 'separate private sidecar; upload outside frontend root',
    }
    (stage / 'release.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
    checksums = []
    for path in sorted(stage.rglob('*')):
        if path.is_file():
            checksums.append(f'{hashlib.sha256(path.read_bytes()).hexdigest()}  {path.relative_to(stage).as_posix()}\n')
    (stage / 'SHA256SUMS').write_text(''.join(checksums))
    with tarfile.open(archive, 'w:gz') as bundle:
        bundle.add(stage, arcname=name)
    digest = hashlib.sha256(archive.read_bytes()).hexdigest()
    archive.with_name(archive.name + '.sha256').write_text(f'{digest}  {archive.name}\n')
    # Credentials intentionally remain outside both the public archive and its extracted directory.
    export_private_config(private_source, private_copy)
    print(f'Release: {archive}\nPrivate configuration: {private_copy}\nSHA256: {digest}')
    print('Archive excludes credentials and local data. Upload private config only to the backend config directory.')


if __name__ == '__main__':
    main()
