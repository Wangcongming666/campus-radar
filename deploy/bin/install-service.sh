#!/usr/bin/env bash
# Run from the extracted release on the Ubuntu server, as root.
set -euo pipefail
if [[ $EUID != 0 ]]; then echo 'Run as root on the server.' >&2; exit 1; fi
if systemctl is-active --quiet campus-radar; then
  echo 'Stop campus-radar before switching its release.' >&2; exit 1
fi
release=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd -P)
case "$release" in /opt/campus-radar/releases/*) ;; *) echo 'Extract under /opt/campus-radar/releases/ first.' >&2; exit 1 ;; esac
[[ -f "$release/backend/app.jar" && -f "$release/frontend/index.html" ]]
if ! id campus-radar >/dev/null 2>&1; then
  useradd --system --user-group --home-dir /opt/campus-radar --no-create-home --shell /usr/sbin/nologin campus-radar
fi
install -d -m 755 /opt/campus-radar /opt/campus-radar/releases /opt/campus-radar/shared
install -d -m 750 -o root -g campus-radar /opt/campus-radar/shared/config
install -d -m 700 -o campus-radar -g campus-radar /opt/campus-radar/shared/private-files
for file in application-prod.yml dependencies.env nginx-site.conf; do
  [[ -f "/opt/campus-radar/shared/config/$file" ]] || { echo 'Run configure.py init first.' >&2; exit 1; }
done
chown root:campus-radar /opt/campus-radar/shared/config/application-prod.yml
chmod 640 /opt/campus-radar/shared/config/application-prod.yml
chmod 600 /opt/campus-radar/shared/config/dependencies.env /opt/campus-radar/shared/config/nginx-site.conf
if [[ -e /opt/campus-radar/current && ! -L /opt/campus-radar/current ]]; then
  echo 'current must be a release symlink; refusing to replace a directory.' >&2; exit 1
fi
ln -sfn "$release" /opt/campus-radar/current
install -m 644 "$release/ops/campus-radar.service" /etc/systemd/system/campus-radar.service
systemctl daemon-reload
systemctl enable campus-radar
echo 'Service installed and enabled, but not started. Start dependencies and initialize the empty database first.'
