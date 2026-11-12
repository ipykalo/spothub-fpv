#!/usr/bin/env bash
# Proves point-in-time recovery works, from R2 alone:
#
#   /opt/spothub/pitr-test.sh                              # to the latest moment
#   /opt/spothub/pitr-test.sh "2026-11-12 09:30:00+00"     # to a moment of choice
#
# Fetches the newest base backup and every archived WAL segment from R2,
# rebuilds the database from them in a throwaway Postgres container of its
# own, replays the WAL to the moment asked for, and compares every table's
# row count with the live database. Removes the container, its volume and
# the downloads when it is done, whatever happened.
#
# The live database is only read, and asked once to close its current WAL
# segment so the latest writes are in the archive. Run to a past moment,
# counts differ by whatever was written since; that is the point of it.
#
# The same steps, with the target time and without the comparison, are the
# real restore: README.md, "Point-in-time recovery".
set -euo pipefail

cd "$(dirname "$(readlink -f "$0")")"
umask 077

set -a
# shellcheck source=/dev/null
. ./.env
set +a

target=${1:-}
image=postgis/postgis:17-3.5
container=spothub-pitr-test
volume=spothub-pitr-data
work=backups/pitr

cleanup() {
  docker rm -f "$container" > /dev/null 2>&1 || true
  docker volume rm "$volume" > /dev/null 2>&1 || true
  rm -rf "$work"
}
trap cleanup EXIT
cleanup
mkdir -p "$work/wal"

offsite() {
  docker compose run --rm --no-deps -T \
    --user "$(id -u):$(id -g)" -e HOME=/tmp \
    -v "$PWD/$work:/pitr" \
    --entrypoint /bin/sh backup -c "
      mc alias set r2 \"\$BACKUP_S3_ENDPOINT\" \"\$BACKUP_S3_ACCESS_KEY\" \"\$BACKUP_S3_SECRET_KEY\" --api S3v4 > /dev/null
      $1"
}

if [ -z "$target" ]; then
  echo "== Closing the live database's current WAL segment, and waiting for it to reach R2"
  docker compose exec -T postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tAq \
    -c "select pg_switch_wal()" > /dev/null
  for _ in $(seq 1 36); do
    sleep 5
    [ "$(docker compose exec -T postgres find /wal-archive/ready -type f | wc -l)" -eq 0 ] && break
  done
fi

echo "== Fetching the newest base backup and the archived WAL from R2"
offsite '
  latest=$(mc find "r2/$BACKUP_S3_BUCKET/wal/base/" --name "base-*.tar.gz" | sort | tail -n 1)
  [ -n "$latest" ] || { echo "no base backup in wal/base/" >&2; exit 1; }
  echo "  base backup: ${latest##*/}"
  mc cp -q "$latest" /pitr/base.tar.gz > /dev/null
  mc cp -q -r "r2/$BACKUP_S3_BUCKET/wal/segments/" /pitr/wal/ > /dev/null
  echo "  WAL segments: $(ls /pitr/wal | wc -l)"'
# Postgres reads them as its own user, not ours.
chmod -R a+rX "$work"

echo "== Rebuilding in a throwaway container, $container"
recovery="restore_command = 'test -f /wal/%f.gz && gunzip < /wal/%f.gz > %p'
recovery_target_action = 'promote'"
if [ -n "$target" ]; then
  recovery="$recovery
recovery_target_time = '$target'"
fi

docker volume create "$volume" > /dev/null
docker run --rm -v "$volume:/data" -v "$PWD/$work:/pitr:ro" -e RECOVERY="$recovery" "$image" sh -c '
  tar -xzf /pitr/base.tar.gz -C /data &&
  printf "%s\n" "$RECOVERY" >> /data/postgresql.auto.conf &&
  touch /data/recovery.signal &&
  chown -R postgres:postgres /data && chmod 700 /data'

# Archiving off, so the rebuilt database can never write into the archive.
docker run -d --name "$container" \
  -v "$volume:/var/lib/postgresql/data" -v "$PWD/$work/wal:/wal:ro" \
  "$image" postgres -c archive_mode=off > /dev/null

echo "== Replaying WAL${target:+ to $target}"
for _ in $(seq 1 120); do
  sleep 5
  state=$(docker exec "$container" psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tAq \
    -c "select pg_is_in_recovery()" 2> /dev/null || true)
  [ "$state" = "f" ] && break
done
if [ "$state" != "f" ]; then
  docker logs --tail 30 "$container" >&2
  echo "== The rebuilt database never finished recovering" >&2
  exit 1
fi

# Every base table and its exact row count, in one query.
count_sql="
  select table_name,
         (xpath('/row/c/text()', query_to_xml(
            format('select count(*) as c from public.%I', table_name), false, true, '')))[1]::text
  from information_schema.tables
  where table_schema = 'public' and table_type = 'BASE TABLE'
  order by table_name"

echo "== Comparing row counts, live against rebuilt"
live=$(docker compose exec -T postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tA -F ' ' -c "$count_sql")
rebuilt=$(docker exec "$container" psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tA -F ' ' -c "$count_sql")

mismatches=0
while read -r table count; do
  [ -n "$table" ] || continue
  got=$(printf '%s\n' "$rebuilt" | awk -v t="$table" '$1 == t { print $2 }')
  if [ "$got" = "$count" ]; then
    printf '  ok    %-28s %s\n' "$table" "$count"
  else
    printf '  DIFF  %-28s live %s, rebuilt %s\n' "$table" "$count" "${got:-missing}"
    mismatches=$((mismatches + 1))
  fi
done <<< "$live"

if [ "$mismatches" -gt 0 ]; then
  if [ -n "$target" ]; then
    echo "== $mismatches table(s) differ — expected, for whatever was written after $target"
    exit 0
  fi
  echo "== $mismatches table(s) differ. Anything written in the last few seconds explains a difference; anything else is a broken archive." >&2
  exit 1
fi

echo "== Point-in-time recovery test passed"
