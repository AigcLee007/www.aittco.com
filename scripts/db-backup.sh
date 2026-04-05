#!/usr/bin/env bash
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/www/backup/aittco/postgres}"
RETENTION_DAYS="${RETENTION_DAYS:-7}"
ALERT_SCRIPT="${ALERT_SCRIPT:-/www/wwwroot/aittco/scripts/notify-webhook.sh}"
PROJECT_ROOT="${PROJECT_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
COMPOSE_FILE="${COMPOSE_FILE:-$PROJECT_ROOT/docker-compose.yml}"
DB_SERVICE="${DB_SERVICE:-aittco-db}"
DB_CONTAINER="${DB_CONTAINER:-}"
DB_HOST="${DB_HOST:-127.0.0.1}"
DB_PORT="${DB_PORT:-3339}"
DB_USER="${DB_USER:-aittcouser}"
DB_NAME="${DB_NAME:-aittcodb}"
TS="$(date +%F_%H%M%S)"
FILE="$BACKUP_DIR/aittcodb_$TS.sql"
LATEST="$BACKUP_DIR/latest.sql"

alert_and_fail() {
  local message="$1"
  echo "[db-backup] ERROR: $message"
  if [ -x "$ALERT_SCRIPT" ]; then
    "$ALERT_SCRIPT" "数据库备份失败" "$message" || true
  fi
  exit 1
}

mkdir -p "$BACKUP_DIR"

if [ -z "$DB_CONTAINER" ]; then
  DB_CONTAINER="$(docker compose -f "$COMPOSE_FILE" ps -q "$DB_SERVICE" | head -n1 || true)"
fi
if [ -z "$DB_CONTAINER" ] && docker ps --format '{{.Names}}' | grep -qx "$DB_SERVICE"; then
  DB_CONTAINER="$DB_SERVICE"
fi
if [ -z "$DB_CONTAINER" ]; then
  alert_and_fail "未找到数据库容器，请检查 $DB_SERVICE 服务是否启动"
fi

echo "[db-backup] container=$DB_CONTAINER"
echo "[db-backup] writing backup to $FILE"

if ! docker exec "$DB_CONTAINER" pg_dump -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" --clean --if-exists --no-owner --no-privileges > "$FILE"; then
  rm -f "$FILE"
  alert_and_fail "pg_dump 执行失败"
fi

if [ ! -s "$FILE" ]; then
  rm -f "$FILE"
  alert_and_fail "备份文件为空: $FILE"
fi

cp "$FILE" "$LATEST"

find "$BACKUP_DIR" -type f -name 'aittcodb_*.sql' -mtime +"$RETENTION_DAYS" -delete

echo "[db-backup] backup complete"
echo "[db-backup] latest backup: $FILE"
