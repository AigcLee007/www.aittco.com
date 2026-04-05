#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="${PROJECT_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
BACKUP_DIR="${BACKUP_DIR:-/www/backup/aittco/postgres}"
LATEST_FILE="${LATEST_FILE:-$BACKUP_DIR/latest.sql}"
COMPOSE_FILE="${COMPOSE_FILE:-$PROJECT_ROOT/docker-compose.yml}"
DB_SERVICE="${DB_SERVICE:-aittco-db}"
DB_USER="${DB_USER:-aittcouser}"
DB_NAME="${DB_NAME:-aittcodb}"
DB_HOST="${DB_HOST:-127.0.0.1}"
DB_PORT="${DB_PORT:-3339}"
RESTORE_DB="${RESTORE_DB:-aittcodb_restore_test}"
REMOTE_PATH="${REMOTE_PATH:-aliyunoss:aittco-db-backup/postgres}"
REQUIRE_RCLONE="${REQUIRE_RCLONE:-true}"

PASS_COUNT=0
FAIL_COUNT=0
RESTORE_DB_CREATED=false

pass() {
  local message="$1"
  PASS_COUNT=$((PASS_COUNT + 1))
  echo "PASS | $message"
}

fail() {
  local message="$1"
  FAIL_COUNT=$((FAIL_COUNT + 1))
  echo "FAIL | $message"
}

run_step() {
  local name="$1"
  shift
  echo "---- $name ----"
  if "$@"; then
    pass "$name"
  else
    fail "$name"
  fi
}

require_db_container() {
  DB_CONTAINER_ID="$(docker compose -f "$COMPOSE_FILE" ps -q "$DB_SERVICE" | head -n1 || true)"
  [[ -n "${DB_CONTAINER_ID:-}" ]]
}

cleanup_restore_db() {
  if [[ "${RESTORE_DB_CREATED}" != "true" ]]; then
    return 0
  fi
  if [[ -z "${DB_CONTAINER_ID:-}" ]]; then
    return 0
  fi
  docker exec "$DB_CONTAINER_ID" psql -U "$DB_USER" -d postgres -v ON_ERROR_STOP=1 \
    -h "$DB_HOST" -p "$DB_PORT" -c "DROP DATABASE IF EXISTS \"$RESTORE_DB\";" >/dev/null 2>&1 || true
}

trap cleanup_restore_db EXIT

check_backup_file_has_key_tables() {
  grep -Eq 'CREATE TABLE .*"User"|CREATE TABLE .*User' "$LATEST_FILE" \
    && grep -Eq 'CREATE TABLE .*"CoinTransaction"|CREATE TABLE .*CoinTransaction' "$LATEST_FILE" \
    && grep -Eq 'CREATE TABLE .*"ModelPricing"|CREATE TABLE .*ModelPricing' "$LATEST_FILE"
}

check_rclone_latest_exists() {
  command -v rclone >/dev/null 2>&1
  rclone lsf "$REMOTE_PATH" | grep -Fxq "latest.sql"
}

run_restore_drill() {
  require_db_container

  docker exec "$DB_CONTAINER_ID" psql -U "$DB_USER" -d postgres -v ON_ERROR_STOP=1 \
    -h "$DB_HOST" -p "$DB_PORT" -c "DROP DATABASE IF EXISTS \"$RESTORE_DB\";" >/dev/null
  docker exec "$DB_CONTAINER_ID" psql -U "$DB_USER" -d postgres -v ON_ERROR_STOP=1 \
    -h "$DB_HOST" -p "$DB_PORT" -c "CREATE DATABASE \"$RESTORE_DB\";" >/dev/null
  RESTORE_DB_CREATED=true

  cat "$LATEST_FILE" | docker exec -i "$DB_CONTAINER_ID" psql -U "$DB_USER" -d "$RESTORE_DB" -h "$DB_HOST" -p "$DB_PORT" -v ON_ERROR_STOP=1 >/dev/null

  local table_count
  table_count="$(
    docker exec "$DB_CONTAINER_ID" psql -U "$DB_USER" -d "$RESTORE_DB" -h "$DB_HOST" -p "$DB_PORT" -tA -v ON_ERROR_STOP=1 \
      -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='public';"
  )"
  [[ "${table_count:-0}" -gt 0 ]]

  docker exec "$DB_CONTAINER_ID" psql -U "$DB_USER" -d "$RESTORE_DB" -h "$DB_HOST" -p "$DB_PORT" -tA -v ON_ERROR_STOP=1 \
    -c "SELECT to_regclass('public.\"User\"') IS NOT NULL
            AND to_regclass('public.\"CoinTransaction\"') IS NOT NULL
            AND to_regclass('public.\"ModelPricing\"') IS NOT NULL;" | grep -qx "t"
}

echo "Starting backup acceptance checks..."
echo "PROJECT_ROOT=$PROJECT_ROOT"
echo "BACKUP_DIR=$BACKUP_DIR"
echo "REMOTE_PATH=$REMOTE_PATH"
echo

run_step "1) Run backup script" bash "$PROJECT_ROOT/scripts/db-backup.sh"
run_step "2) latest.sql exists and is non-empty" test -s "$LATEST_FILE"
run_step "3) latest.sql contains key tables (User/CoinTransaction/ModelPricing)" check_backup_file_has_key_tables

if [[ "$REQUIRE_RCLONE" == "true" ]]; then
  run_step "5) OSS has latest.sql via rclone" check_rclone_latest_exists
else
  echo "SKIP | 5) OSS has latest.sql via rclone (REQUIRE_RCLONE=false)"
fi

run_step "6) Restore drill (create temp DB, restore, validate, cleanup)" run_restore_drill

echo
echo "=============================="
echo "Backup Acceptance Summary"
echo "PASS: $PASS_COUNT"
echo "FAIL: $FAIL_COUNT"
echo "=============================="

if [[ "$FAIL_COUNT" -gt 0 ]]; then
  exit 1
fi

echo "All checks passed."
