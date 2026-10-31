#!/usr/bin/env python3
"""Generate server-only configuration. Does not print or overwrite credentials."""
import argparse
import base64
import ipaddress
import json
import os
import pathlib
import re
import secrets
import tempfile
from urllib.parse import urlsplit


def checked_origin(origin):
    url = urlsplit(origin)
    if (url.scheme not in ('http', 'https') or not url.hostname or url.username
            or url.password or url.path or url.query or url.fragment
            or url.port not in (None, 80 if url.scheme == 'http' else 443)):
        raise ValueError('Use a complete origin without path, credentials or nonstandard port.')
    host = url.hostname
    try:
        address = ipaddress.ip_address(host)
        if address.version != 4:
            raise ValueError('Use an IPv4 address or domain.')
    except ValueError:
        if not re.fullmatch(r'[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?', host) or '..' in host:
            raise ValueError('Invalid hostname.')
    return f'{url.scheme}://{host}', host


def private_write(path, content, replace=False):
    previous = path.stat() if path.exists() else None
    if previous and not replace:
        raise FileExistsError('Configuration exists. Refusing to regenerate its credentials.')
    descriptor, name = tempfile.mkstemp(dir=path.parent, prefix='.config-')
    try:
        with os.fdopen(descriptor, 'w', encoding='utf-8') as handle:
            handle.write(content)
        if previous:
            os.chmod(name, previous.st_mode & 0o777)
            os.chown(name, previous.st_uid, previous.st_gid)
        os.replace(name, path)
    finally:
        pathlib.Path(name).unlink(missing_ok=True)


def nginx_config(directory, host, replace=False):
    template = pathlib.Path(__file__).with_name('nginx-site.conf.template').read_text()
    private_write(directory / 'nginx-site.conf', template.replace('__SERVER_NAME__', host), replace)


def initialize(directory, origin):
    origin, host = checked_origin(origin)
    directory = pathlib.Path(directory)
    directory.mkdir(parents=True, exist_ok=True, mode=0o750)
    for name in ('application-prod.yml', 'dependencies.env', 'nginx-site.conf'):
        if (directory / name).exists():
            raise FileExistsError('Configuration exists. Use update-origin for a domain change.')
    credentials = {key: secrets.token_hex(24) for key in
                   ('DB_PASSWORD', 'DB_ROOT_PASSWORD', 'REDIS_PASSWORD', 'RABBIT_PASSWORD')}
    config = {
        'spring': {
            'datasource': {
                'url': 'jdbc:mysql://127.0.0.1:33078/campus_radar_prod?connectionTimeZone=UTC&forceConnectionTimeZoneToSession=true&characterEncoding=UTF-8',
                'username': 'campus_app', 'password': credentials['DB_PASSWORD'],
                'hikari': {'maximum-pool-size': 5, 'minimum-idle': 1}},
            'data': {'redis': {'host': '127.0.0.1', 'port': 36380,
                               'password': credentials['REDIS_PASSWORD']}},
            'session': {'redis': {'namespace': 'campus:session:prod'}},
            'rabbitmq': {'host': '127.0.0.1', 'port': 35674, 'username': 'campus_prod',
                         'password': credentials['RABBIT_PASSWORD']},
            'mail': {'host': '127.0.0.1', 'port': 587},
        },
        'server': {
            'address': '127.0.0.1', 'port': 8080, 'forward-headers-strategy': 'native',
            'tomcat': {'threads': {'max': 32, 'min-spare': 2},
                       'remoteip': {'internal-proxies': '127\\.0\\.0\\.1|::1|0:0:0:0:0:0:0:1'}},
            'servlet': {'session': {'cookie': {'secure': origin.startswith('https://')}}}},
        'campus': {
            'public-url': origin, 'allowed-origins': origin,
            'mail-from': 'no-reply@example.invalid', 'mail-key': '',
            'backup-key': base64.b64encode(secrets.token_bytes(32)).decode(),
            'backup-environment': 'campus-radar-prod',
            'file-storage-root': '/opt/campus-radar/shared/private-files',
            'rate-limit-multiplier': 1,
            'task': {'queue': 'campus.tasks.prod', 'exchange': 'campus.events.prod'},
        },
    }
    private_write(directory / 'dependencies.env', ''.join(f'{k}={v}\n' for k, v in credentials.items()))
    # JSON is a subset of YAML, readable by Spring without extra Python dependencies.
    private_write(directory / 'application-prod.yml', json.dumps(config, ensure_ascii=False, indent=2) + '\n')
    nginx_config(directory, host)


def update_origin(directory, origin):
    origin, host = checked_origin(origin)
    directory = pathlib.Path(directory)
    path = directory / 'application-prod.yml'
    config = json.loads(path.read_text())
    config['campus']['public-url'] = origin
    config['campus']['allowed-origins'] = origin
    config['server']['servlet']['session']['cookie']['secure'] = origin.startswith('https://')
    private_write(path, json.dumps(config, ensure_ascii=False, indent=2) + '\n', replace=True)
    # This is an HTTP bootstrap template, never an automatic replacement for BaoTa's TLS config.
    nginx_config(directory, host, replace=True)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('action', choices=['init', 'update-origin'])
    parser.add_argument('--origin', required=True)
    parser.add_argument('--config-dir', type=pathlib.Path,
                        default=pathlib.Path('/opt/campus-radar/shared/config'))
    args = parser.parse_args()
    try:
        (initialize if args.action == 'init' else update_origin)(args.config_dir, args.origin)
    except (ValueError, OSError) as error:
        parser.exit(1, f'Configuration failed: {error}\n')
    print('Configuration saved. No credential values were printed.')


if __name__ == '__main__':
    main()
