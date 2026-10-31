#!/usr/bin/env bash
# Fresh databases only. Refuses to overwrite any existing table.
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/common.sh"
count=$(printf '%s\n' "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema=DATABASE();" | mysql_root)
if [[ "$count" != 0 ]]; then
  echo 'Refusing initialization: database is not empty. Do not reimport schema.sql.' >&2
  exit 1
fi
mysql_root < "$APP_ROOT/current/database/schema.sql"
mysql_root <<'SQL'
REVOKE ALL PRIVILEGES, GRANT OPTION FROM 'campus_app'@'%';
GRANT SELECT,INSERT,UPDATE,DELETE ON `campus\_radar\_prod`.* TO 'campus_app'@'%';
SQL
count=$(printf '%s\n' 'SELECT COUNT(*) FROM information_schema.tables WHERE table_schema=DATABASE();' | mysql_root)
[[ "$count" == 49 ]] || { echo 'Unexpected table count after initialization.' >&2; exit 1; }
echo 'Fresh schema installed. Business tables: 49.'
