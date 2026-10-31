#!/usr/bin/env python3
"""Read-only HTTP smoke checks; never creates an account or prints a token."""
import argparse
import http.cookiejar
import json
import urllib.error
import urllib.request

parser = argparse.ArgumentParser()
parser.add_argument('origin')
args = parser.parse_args()
client = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
for path, expected in [('/login', 200), ('/register', 200),
                       ('/api/v1/public/stats', 200), ('/api/v1/auth/csrf', 200),
                       ('/api/v1/me', 401)]:
    try:
        response = client.open(args.origin.rstrip('/') + path, timeout=15)
    except urllib.error.HTTPError as error:
        response = error
    with response:
        if response.status != expected:
            raise SystemExit(f'FAIL {path}: HTTP {response.status}, expected {expected}')
        if path.startswith('/api/'):
            body = json.load(response)
            if path == '/api/v1/auth/csrf' and not body.get('data', {}).get('token'):
                raise SystemExit('FAIL: CSRF token missing')
    print(f'PASS {path}: HTTP {expected}')
