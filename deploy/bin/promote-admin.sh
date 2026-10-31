#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/common.sh"
if [[ $# != 1 ]]; then echo 'Usage: promote-admin.sh existing-user@example.com' >&2; exit 1; fi
encoded=$(python3 - "$1" <<'PY'
import sys
print(sys.argv[1].strip().lower().encode().hex())
PY
)
result=$(mysql_root <<SQL
START TRANSACTION;
SET @target=(SELECT id FROM users WHERE email=CONVERT(UNHEX('$encoded') USING utf8mb4) AND status='ACTIVE' AND role='USER' FOR UPDATE);
UPDATE users SET role='ADMIN',auth_version=auth_version+1,version=version+1 WHERE id=@target;
INSERT INTO audit_logs(id,actor_id,action,target_type,target_id,reason,request_id,change_summary)
SELECT UUID(),NULL,'PRODUCTION_ADMIN_BOOTSTRAP','USER',id,'服务器持有者首次授权管理员',UUID(),JSON_OBJECT('role','ADMIN') FROM users WHERE id=@target;
COMMIT;
SELECT IF(@target IS NULL,'MISSING','OK');
SQL
)
if [[ "$result" != OK ]]; then echo 'No matching active ordinary account. Register first.' >&2; exit 1; fi
echo 'Administrator enabled. Sign in again.'
