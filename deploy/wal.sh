#!/usr/bin/env bash
# Point-in-time recovery's half of the backups, run by cron on the server
# (README.md, "Point-in-time recovery"):
#
#   23 4 * * 0 /opt/spothub/wal.sh base  >> /opt/spothub/backups/wal.log 2>&1
#   41 * * * * /opt/spothub/wal.sh check >> /opt/spothub/backups/wal.log 2>&1
#
# base   A base backup — the whole data directory, from pg_basebackup — shipped
#        to R2 under wal/base/. Every WAL segment archived since one is what
#        replays it forward to any moment. Then prunes: base backups after
#        8 weeks, as the weekly dumps; WAL a day longer, so the oldest base
#        backup kept can always be replayed.
# check  That archiving is not stuck: Postgres's own archiver has not failed
#        since it last succeeded, and nothing has waited in the local archive
#        for half an hour without reaching R2.
#
# Either reports a failure to BACKUP_HEARTBEAT_URL's /fail, when it is set —
# the backup's own check, so one email address hears about both. Never a
# success: that would clear a failed night's backup.
set -euo pipefail

cd "$(dirname "$(readlink -f "$0")")"
umask 077

set -a
# shellcheck source=/dev/null
. ./.env
set +a

mode=${1:-}
log() { echo "$(date -u +%FT%TZ) wal $mode: $*"; }

fail() {
  log "FAILED: $*"
  if [ -n "${BACKUP_HEARTBEAT_URL:-}" ]; then
    curl -fsS -m 10 --retry 3 -o /dev/null --data-raw "wal $mode: $*" \
      "${BACKUP_HEARTBEAT_URL}/fail" || log "could not reach the heartbeat monitor"
  fi
  exit 1
}

[ "${WAL_ARCHIVING:-off}" = "on" ] || { log "WAL_ARCHIVING is not on; nothing to do"; exit 0; }

psql_live() {
  docker compose exec -T postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tA -c "$1"
}

# The MinIO image's mc, on the stack's network, with the backup bucket as r2.
offsite() {
  docker compose run --rm --no-deps -T \
    --user "$(id -u):$(id -g)" -e HOME=/tmp \
    -v "$PWD/backups/base:/base" \
    --entrypoint /bin/sh backup -c "
      mc alias set r2 \"\$BACKUP_S3_ENDPOINT\" \"\$BACKUP_S3_ACCESS_KEY\" \"\$BACKUP_S3_SECRET_KEY\" --api S3v4 > /dev/null
      $1"
}

base() {
  trap 'fail "base backup did not finish"' ERR
  mkdir -p backups/base
  local name
  name="base-$(date -u +%Y-%m-%dT%H%MZ).tar.gz"

  log "started"
  # One tar of the data directory, gzipped, to stdout. No WAL inside it
  # (-X none): pg_basebackup waits until the WAL the backup needs has been
  # archived, and the archive is where a restore reads it from.
  docker compose exec -T postgres \
    pg_basebackup -U "$POSTGRES_USER" -D - -F tar -X none -z --checkpoint=fast \
    > "backups/base/$name"
  [ -s "backups/base/$name" ] || fail "the base backup is empty"

  offsite "mc cp -q /base/$name r2/\$BACKUP_S3_BUCKET/wal/base/$name > /dev/null"
  rm -f "backups/base/$name"
  log "shipped $name"

  offsite '
    mc rm -r --force --older-than 56d "r2/$BACKUP_S3_BUCKET/wal/base/" > /dev/null || true
    mc rm -r --force --older-than 57d "r2/$BACKUP_S3_BUCKET/wal/segments/" > /dev/null || true'
  log "done"
}

check() {
  local stuck archiver
  # Failed since the last success: archive_command is refusing. WAL then
  # piles up in pg_wal until the disk is full, so this must not wait.
  archiver=$(psql_live "
    select coalesce(last_failed_time > coalesce(last_archived_time, '-infinity'), false)
    from pg_stat_archiver")
  [ "$archiver" = "f" ] || fail "Postgres cannot archive WAL (pg_stat_archiver)"

  # Archived but not shipped: wal-shipper is down, or R2 refuses it.
  stuck=$(docker compose exec -T postgres \
    find /wal-archive/ready -type f -mmin +30 | wc -l)
  [ "$stuck" -eq 0 ] || fail "$stuck WAL file(s) waiting over 30 minutes to reach R2"
}

case "$mode" in
  base) base ;;
  check) check ;;
  *)
    echo "usage: $0 base|check" >&2
    exit 2
    ;;
esac
