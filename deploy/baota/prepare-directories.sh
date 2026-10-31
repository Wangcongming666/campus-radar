#!/usr/bin/env bash
# Run as root in BaoTa terminal. Creates directories and sets permissions only.
set -euo pipefail
[[ $EUID == 0 ]] || { echo 'Run as root on the server.' >&2; exit 1; }
id www >/dev/null 2>&1 || { echo 'Install BaoTa/Nginx and its www user first.' >&2; exit 1; }
install -d -m 755 /www/server/campus-radar /www/server/campus-radar/backend
install -d -m 750 -o root -g www /www/server/campus-radar/config
install -d -m 700 -o www -g www /www/server/campus-radar/private-files
install -d -m 755 -o www -g www /www/wwwroot/campus-radar
if [[ -f /www/server/campus-radar/config/application-prod.yml ]]; then
  chown root:www /www/server/campus-radar/config/application-prod.yml
  chmod 640 /www/server/campus-radar/config/application-prod.yml
fi
if [[ -f /www/server/campus-radar/backend/app.jar ]]; then
  chmod 644 /www/server/campus-radar/backend/app.jar
fi
echo 'Directories ready. No services were installed, started or stopped.'
