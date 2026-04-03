#!/usr/bin/env bash
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/www/backup/math/postgres}"
RETENTION_DAYS="${RETENTION_DAYS:-7}"
ALERT_SCRIPT="${ALERT_SCRIPT:-/www/wwwroot/math/scripts/notify-webhook.sh}"
TS="$(date +%F_%H%M%S)"
FILE="$BACKUP_DIR/mathdb_$TS.sql"
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

echo "[db-backup] Writing backup to $FILE"

if ! docker exec math-db pg_dump -U mathuser -d mathdb --clean --if-exists --no-owner --no-privileges > "$FILE"; then
  alert_and_fail "pg_dump 执行失败"
fi

if [ ! -s "$FILE" ]; then
  alert_and_fail "备份文件为空: $FILE"
fi

cp "$FILE" "$LATEST"

find "$BACKUP_DIR" -type f -name 'mathdb_*.sql' -mtime +"$RETENTION_DAYS" -delete

echo "[db-backup] Backup complete"
echo "[db-backup] Latest backup: $FILE"
