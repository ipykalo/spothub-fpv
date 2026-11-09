#!/usr/bin/env bash
# Proves the backups restore: a backup that has never been restored is a hope.
#
#   /opt/spothub/restore-test.sh
#
# Downloads the newest dump from R2 — the off-site copy, not the one on this
# disk — restores it into a throwaway database beside the real one, and
# compares every table's row count with the live database. Then counts the
# files in the R2 storage mirror against MinIO. Drops the throwaway database
# and the download when it is done, whatever happened.
#
# The live database is only ever read. Counts can differ by whatever was
# written since the dump was taken, so run it soon after a backup.
set -euo pipefail

cd "$(dirname "$(readlink -f "$0")")"
umask 077

set -a
# shellcheck source=/dev/null
. ./.env
set +a

scratch=spothub_restore_test
mkdir -p backups/restore-test

cleanup() {
  docker compose exec -T postgres dropdb -U "$POSTGRES_USER" --if-exists "$scratch" || true
  rm -f backups/restore-test/latest.dump
}
trap cleanup EXIT

offsite() {
  docker compose run --rm --no-deps -T \
    --user "$(id -u):$(id -g)" -e HOME=/tmp \
    -v "$PWD/backups/restore-test:/restore" \
    --entrypoint /bin/sh backup -c "
      mc alias set local http://minio:9000 \"\$S3_ACCESS_KEY\" \"\$S3_SECRET_KEY\" > /dev/null
      mc alias set r2 \"\$BACKUP_S3_ENDPOINT\" \"\$BACKUP_S3_ACCESS_KEY\" \"\$BACKUP_S3_SECRET_KEY\" --api S3v4 > /dev/null
      $1"
}

echo "== Fetching the newest dump from R2"
# The image has a shell and mc but no awk; names carry their UTC time, so the
# last in sorted order is the newest.
offsite '
  latest=$(mc find "r2/$BACKUP_S3_BUCKET/db/daily/" --name "spothub-*.dump" | sort | tail -n 1)
  [ -n "$latest" ] || { echo "no dump in db/daily/" >&2; exit 1; }
  echo "newest: ${latest##*/}"
  mc cp -q "$latest" /restore/latest.dump > /dev/null'

echo "== Restoring into a throwaway database, $scratch"
docker compose exec -T postgres dropdb -U "$POSTGRES_USER" --if-exists "$scratch"
docker compose exec -T postgres createdb -U "$POSTGRES_USER" "$scratch"
docker compose exec -T postgres \
  pg_restore -U "$POSTGRES_USER" -d "$scratch" --no-owner --exit-on-error \
  < backups/restore-test/latest.dump

# Every base table and its exact row count, in one query.
counts() {
  docker compose exec -T postgres psql -U "$POSTGRES_USER" -d "$1" -tA -F ' ' -c "
    select table_name,
           (xpath('/row/c/text()', query_to_xml(
              format('select count(*) as c from public.%I', table_name), false, true, '')))[1]::text
    from information_schema.tables
    where table_schema = 'public' and table_type = 'BASE TABLE'
    order by table_name"
}

echo "== Comparing row counts, live against restored"
live=$(counts "$POSTGRES_DB")
restored=$(counts "$scratch")

mismatches=0
while read -r table count; do
  [ -n "$table" ] || continue
  got=$(printf '%s\n' "$restored" | awk -v t="$table" '$1 == t { print $2 }')
  if [ "$got" = "$count" ]; then
    printf '  ok    %-28s %s\n' "$table" "$count"
  else
    printf '  DIFF  %-28s live %s, restored %s\n' "$table" "$count" "${got:-missing}"
    mismatches=$((mismatches + 1))
  fi
done <<< "$live"

echo "== Comparing storage, MinIO against the R2 mirror"
offsite '
  here=$(mc ls --recursive "local/$S3_BUCKET" | wc -l)
  there=$(mc ls --recursive "r2/$BACKUP_S3_BUCKET/media" | wc -l)
  echo "  MinIO $here files, R2 mirror $there files"
  # The mirror only grows, so it may hold more; never fewer.
  [ "$there" -ge "$here" ]'

if [ "$mismatches" -gt 0 ]; then
  echo "== $mismatches table(s) differ. Anything written since the dump explains a difference; anything else is a broken backup." >&2
  exit 1
fi

echo "== Restore test passed"
