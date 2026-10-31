#!/usr/bin/env bash
# Restore only into an empty, stopped deployment. Does not start the API.
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/common.sh"

require_empty_target() {
  local count
  count=$(printf '%s\n' 'SELECT COUNT(*) FROM information_schema.tables WHERE table_schema=DATABASE();' | mysql_root) || return 1
  if [[ "$count" != 0 ]]; then
    echo 'Refusing restore: target database is not empty.' >&2
    return 1
  fi
}

restore_main() {
  [[ $EUID == 0 ]] || { echo 'Run as root on the recovery server.' >&2; return 1; }
  [[ $# == 1 ]] || { echo 'Usage: restore-db-files.sh /absolute/backup-directory' >&2; return 1; }
  if systemctl is-active --quiet campus-radar; then
    echo 'Stop campus-radar before restoring.' >&2; return 1
  fi
  local backup private
  backup=$(cd "$1" && pwd -P)
  private="$APP_ROOT/shared/private-files"
  [[ -f "$backup/COMPLETE" ]] || { echo 'Backup has no COMPLETE marker.' >&2; return 1; }
  (cd "$backup" && sha256sum -c SHA256SUMS)
  [[ -d "$private" && ! -L "$private" ]]
  if [[ -n $(find "$private" -mindepth 1 -print -quit) ]]; then
    echo 'Refusing restore: target private-files directory is not empty.' >&2; return 1
  fi
  # Validate every member before a root-owned extraction, rejecting links and traversal.
  python3 - "$backup/private-files.tar.gz" <<'PY'
import pathlib, sys, tarfile
with tarfile.open(sys.argv[1]) as archive:
    for member in archive:
        path = pathlib.PurePosixPath(member.name)
        if (path.is_absolute() or '..' in path.parts or not path.parts
                or path.parts[0] != 'private-files'
                or not (member.isdir() or member.isfile())):
            raise SystemExit('Unsafe private-file archive member; restore refused.')
PY
  if ! require_empty_target; then return 1; fi
  gzip -dc "$backup/database.sql.gz" | mysql_root
  mysql_root <<'SQL'
REVOKE ALL PRIVILEGES, GRANT OPTION FROM 'campus_app'@'%';
GRANT SELECT,INSERT,UPDATE,DELETE ON `campus\_radar\_prod`.* TO 'campus_app'@'%';
SQL
  tar --no-same-owner --no-same-permissions -xzf "$backup/private-files.tar.gz" -C "$APP_ROOT/shared"
  chown -R campus-radar:campus-radar "$private"
  find "$private" -type d -exec chmod 700 {} +
  find "$private" -type f -exec chmod 600 {} +
  echo 'Database and private files restored. API remains stopped; inspect and run smoke checks after starting it.'
}

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then restore_main "$@"; fi
