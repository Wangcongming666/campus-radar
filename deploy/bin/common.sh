#!/usr/bin/env bash
set -euo pipefail
APP_ROOT=/opt/campus-radar
CONFIG_DIR="$APP_ROOT/shared/config"
OPS_DIR="$APP_ROOT/current/ops"
compose() {
  docker compose --env-file "$CONFIG_DIR/dependencies.env" -f "$OPS_DIR/compose.yml" "$@"
}
mysql_root() {
  compose exec -T mysql sh -c 'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" exec mysql --default-character-set=utf8mb4 --batch --skip-column-names -uroot "$MYSQL_DATABASE"'
}
