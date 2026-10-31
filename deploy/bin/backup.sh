#!/usr/bin/env bash
# Briefly stops the API to keep database rows and private files consistent.
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/common.sh"
[[ $EUID == 0 ]] || { echo 'Run as root.' >&2; exit 1; }
umask 077
install -d -m 700 "$APP_ROOT/backups"
exec 9>"$APP_ROOT/backups/.backup.lock"
flock -n 9 || { echo 'A backup is already running.' >&2; exit 1; }
destination=$(mktemp -d "$APP_ROOT/backups/$(date -u +%Y%m%dT%H%M%SZ)-XXXXXX")
active=false
if systemctl is-active --quiet campus-radar; then active=true; systemctl stop campus-radar; fi
resume() { if $active; then systemctl start campus-radar; fi; }
trap resume EXIT
compose exec -T mysql sh -c 'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" exec mysqldump -uroot --single-transaction --quick --no-tablespaces --set-gtid-purged=OFF --default-character-set=utf8mb4 "$MYSQL_DATABASE"' | gzip > "$destination/database.sql.gz"
tar -C "$APP_ROOT/shared" -czf "$destination/private-files.tar.gz" private-files
tar -C "$APP_ROOT/shared" -czf "$destination/config.tar.gz" config
(cd "$destination" && sha256sum database.sql.gz private-files.tar.gz config.tar.gz > SHA256SUMS)
touch "$destination/COMPLETE"
echo "Backup completed: $destination"
