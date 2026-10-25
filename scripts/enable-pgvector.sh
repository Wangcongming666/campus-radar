#!/usr/bin/env bash
# macOS Bash 3.2 / Linux. Operates on the existing local database only.
set -Eeuo pipefail
umask 077

usage() {
  cat <<'TEXT'
校招雷达：为现有 PostgreSQL 启用 pgvector
用法：bash scripts/enable-pgvector.sh [--check | --help]
  默认：检查原实例 → 私有备份 → 构建镜像 → 复用原卷 → 启用并验证扩展
  --check：只读检查 Docker、原容器与数据卷，不启动或升级数据库
备份默认放在 ~/campus-radar-backups，可用 CAMPUS_PG_BACKUP_DIR 指定目录。
不会创建另一套业务库、删除数据卷、执行业务表迁移或调用 embedding 模型。
TEXT
}
mode=enable
if [ "$#" -gt 1 ]; then usage >&2; exit 2; fi
case "${1:-}" in
  --help|-h) usage; exit 0 ;;
  --check) mode=check ;;
  '') ;;
  *) usage >&2; exit 2 ;;
esac

root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
cd "$root"
container=campus-radar-postgres-1
volume=campus-radar_campus_pg
compose_file="$root/infrastructure/docker-compose.yml"
backup=''
locked=0
replacing=0
sql_started=0
lock_dir="$root/infrastructure/.pgvector-enable.lock"

die() { printf '错误：%s\n' "$*" >&2; exit 1; }
step() { printf '\n%s\n' "$*"; }
compose() { docker compose --project-name campus-radar -f "$compose_file" "$@"; }
wait_ready() {
  local count=0
  while [ "$count" -lt 60 ]; do
    if docker exec "$container" pg_isready -U postgres -d campus_radar >/dev/null 2>&1; then
      return 0
    fi
    count=$((count + 1))
    sleep 1
  done
  return 1
}
cleanup() {
  local code=$?
  trap - EXIT INT TERM
  if [ "$code" -ne 0 ]; then
    printf '\n执行未完成。原数据卷保留：%s\n' "$volume" >&2
    if [ -n "$backup" ]; then printf '备份与恢复信息：%s\n' "$backup" >&2; fi
    if [ "$replacing" -eq 1 ] && [ "$sql_started" -eq 0 ]; then
      printf '正在用升级前的镜像恢复原数据库服务…\n' >&2
      if docker compose --project-name campus-radar -f "$compose_file" \
        -f "$backup/rollback.yml" up -d --no-build --no-deps --force-recreate postgres \
        && wait_ready; then
        printf '原镜像已恢复，未执行扩展 SQL。\n' >&2
      else
        printf '自动恢复未完成。请保留数据卷，并依据备份目录内 README.txt 检查恢复。\n' >&2
      fi
    elif [ "$sql_started" -eq 1 ]; then
      printf '保留包含 pgvector 的镜像；扩展 SQL 使用事务。请检查错误后重试，不降级已启用扩展的运行环境。\n' >&2
    fi
  fi
  if [ "$locked" -eq 1 ]; then rmdir "$lock_dir" 2>/dev/null || true; fi
  exit "$code"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

step '[1/6] 检查 Docker、正式容器和原数据卷'
command -v docker >/dev/null 2>&1 || die '请先安装并打开 Docker Desktop。'
docker info >/dev/null 2>&1 || die '无法连接 Docker，请先打开 Docker Desktop 并等待启动完成。'
docker compose version >/dev/null 2>&1 || die '需要 Docker Compose v2（docker compose）。'
[ -f "$compose_file" ] && [ -f "$root/infrastructure/postgres/Dockerfile" ] \
  || die '项目文件不完整，请使用当前项目中的完整脚本与基础设施配置。'
docker inspect "$container" >/dev/null 2>&1 || die "未找到原容器 ${container}；为避免误建新库，已停止。"
project=$(docker inspect --format '{{index .Config.Labels "com.docker.compose.project"}}' "$container")
service=$(docker inspect --format '{{index .Config.Labels "com.docker.compose.service"}}' "$container")
[ "$project" = campus-radar ] && [ "$service" = postgres ] || die '容器不属于本项目的 postgres 服务。'
mounted=$(docker inspect --format '{{range .Mounts}}{{if eq .Destination "/var/lib/postgresql/data"}}{{.Name}}{{end}}{{end}}' "$container")
[ "$mounted" = "$volume" ] || die "数据卷与预期不一致（应为 ${volume}），未做修改。"
docker volume inspect "$volume" >/dev/null 2>&1 || die '原数据卷不存在，已停止。'
old_image=$(docker inspect --format '{{.Image}}' "$container")
old_name=$(docker inspect --format '{{.Config.Image}}' "$container")
running=$(docker inspect --format '{{.State.Running}}' "$container")
printf '容器：%s\n镜像：%s\n数据卷：%s\n运行中：%s\n' "$container" "$old_name" "$volume" "$running"
if [ "$mode" = check ]; then
  printf '\n检查完成：未启动、备份或修改数据库。运行默认命令才会启用扩展。\n'
  exit 0
fi

mkdir "$lock_dir" 2>/dev/null || die "已有脚本在执行；若上次被强制终止，请确认无任务运行后移除 ${lock_dir}。"
locked=1
# Another invocation may have completed between the read-only checks and this lock.
# Never roll back to a snapshot from before that invocation enabled the extension.
old_image=$(docker inspect --format '{{.Image}}' "$container")
old_name=$(docker inspect --format '{{.Config.Image}}' "$container")
running=$(docker inspect --format '{{.State.Running}}' "$container")
mounted=$(docker inspect --format '{{range .Mounts}}{{if eq .Destination "/var/lib/postgresql/data"}}{{.Name}}{{end}}{{end}}' "$container")
[ "$mounted" = "$volume" ] || die '取得执行锁后发现数据卷已变化，已停止。'
# Mount the existing volume read-only; never initialize an empty or other-major volume.
docker run --rm --network none --read-only \
  --mount "type=volume,source=$volume,target=/data,readonly" \
  --entrypoint sh "$old_image" -c 'test -f /data/PG_VERSION && test "$(cat /data/PG_VERSION)" = 16' \
  || die '原卷不是已初始化的 PostgreSQL 16 数据目录，已停止。'
compose config --quiet

step '[2/6] 恢复原服务并检查 PostgreSQL 版本'
if [ "$running" != true ]; then docker start "$container" >/dev/null; fi
wait_ready || die "原服务未就绪，请执行 docker logs --tail 50 $container 检查。"
major=$(docker exec "$container" psql -X -U postgres -d campus_radar -A -t \
  -v ON_ERROR_STOP=1 -c "SELECT current_setting('server_version_num')::int / 10000;")
[ "$major" = 16 ] || die '当前数据库主版本不是 16，已停止。'

step '[3/6] 备份数据库和全局角色，并校验备份可读取'
backup_root=${CAMPUS_PG_BACKUP_DIR:-"$HOME/campus-radar-backups"}
mkdir -p "$backup_root"
backup=$(mktemp -d "$backup_root/pgvector-$(date +%Y%m%d-%H%M%S)-XXXXXX")
docker exec "$container" pg_dump -U postgres -d campus_radar --format=custom > "$backup/database.dump.partial"
[ -s "$backup/database.dump.partial" ] || die '数据库备份为空，已停止。'
docker exec -i "$container" pg_restore --list < "$backup/database.dump.partial" > "$backup/database.contents.txt"
mv "$backup/database.dump.partial" "$backup/database.dump"
docker exec "$container" pg_dumpall -U postgres --globals-only > "$backup/globals.sql"
chmod 600 "$backup/database.dump" "$backup/globals.sql"
rollback_tag="campus-radar-postgres:rollback-$(date +%Y%m%d-%H%M%S)-$$"
docker tag "$old_image" "$rollback_tag"
cat > "$backup/rollback.yml" <<YAML
services:
  postgres:
    image: $rollback_tag
YAML
cat > "$backup/README.txt" <<TEXT
创建时间：$(date -u +%Y-%m-%dT%H:%M:%SZ)
原容器：$container
原镜像：$old_name
原镜像ID：$old_image
原数据卷：$volume
database.dump：pg_dump 自定义格式；globals.sql：角色信息，包含敏感凭据摘要，请私密保存。
脚本不会自动用备份覆盖原库。不要删除原数据卷。
在尚未执行扩展 SQL 时，可从项目根目录恢复原镜像：
docker compose --project-name campus-radar -f "$compose_file" -f "$backup/rollback.yml" up -d --no-build --no-deps postgres
若扩展已启用，不要降级到没有 pgvector 文件的镜像。
TEXT
printf '备份：%s\n' "$backup"

step '[4/6] 构建兼容原 PostgreSQL 16.6 Alpine 的 pgvector 镜像（首次需要联网）'
compose build postgres

step '[5/6] 仅重建原 postgres 服务，继续使用原数据卷'
replacing=1
compose up -d --no-build --no-deps --force-recreate postgres
wait_ready || die '新镜像未就绪，将尝试恢复升级前镜像。'
mounted=$(docker inspect --format '{{range .Mounts}}{{if eq .Destination "/var/lib/postgresql/data"}}{{.Name}}{{end}}{{end}}' "$container")
[ "$mounted" = "$volume" ] || die '重建后的数据卷不一致，已停止。'

step '[6/6] 在 campus_radar 中启用并验证 pgvector'
sql_started=1
docker exec -i "$container" psql -X -U postgres -d campus_radar -v ON_ERROR_STOP=1 <<'SQL'
BEGIN;
CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA public;
DO $$
BEGIN
  IF ('[1,0,0]'::vector <=> '[1,0,0]'::vector) IS DISTINCT FROM 0::double precision THEN
    RAISE EXCEPTION 'pgvector cosine distance verification failed';
  END IF;
  IF vector_dims(array_fill(0::real, ARRAY[1536])::vector) <> 1536 THEN
    RAISE EXCEPTION 'pgvector 1536 dimensions verification failed';
  END IF;
END $$;
SELECT extversion AS pgvector_version FROM pg_extension WHERE extname = 'vector';
SELECT '[1,0,0]'::vector <=> '[1,0,0]'::vector AS cosine_distance;
COMMIT;
SQL
printf '\npgvector 启用成功。数据库：campus_radar；原数据卷：%s\n' "$volume"
printf '备份保存在：%s\n' "$backup"
printf '未执行业务表迁移，未生成 embedding；此脚本可重复执行。\n'
