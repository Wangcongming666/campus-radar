#!/bin/sh
set -eu
# psql variables quote credentials as SQL literals, never SQL interpolation.
psql --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  --set=web_password="$CAMPUS_WEB_PASSWORD" \
  --set=worker_password="$CAMPUS_WORKER_PASSWORD" \
  --set=scheduler_password="$CAMPUS_SCHEDULER_PASSWORD" <<'SQL'
CREATE ROLE campus_web_login LOGIN PASSWORD :'web_password' IN ROLE campus_web;
CREATE ROLE campus_worker_login LOGIN PASSWORD :'worker_password' IN ROLE campus_worker;
CREATE ROLE campus_scheduler_login LOGIN PASSWORD :'scheduler_password' IN ROLE campus_scheduler;
ALTER ROLE campus_web_login SET statement_timeout='10s';
ALTER ROLE campus_worker_login SET statement_timeout='10s';
ALTER ROLE campus_scheduler_login SET statement_timeout='10s';
SQL
