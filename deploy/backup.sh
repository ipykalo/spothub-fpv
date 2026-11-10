#!/usr/bin/env bash
# Nightly off-site backup of SpotHub FPV, run by cron on the server:
#
#   17 3 * * * /opt/spothub/backup.sh >> /opt/spothub/backups/backup.log 2>&1
#
# 1. Dumps the database with pg_dump's custom format, and refuses a dump that
#    pg_restore cannot read back — an unreadable dump is not a backup.
# 2. Ships it to the R2 bucket named in .env: every night under db/daily/,
#    and on Sundays under db/weekly/ as well.
# 3. Mirrors object storage — photos, logs, covers — to media/ in the same
#    bucket. New and changed files only: nothing is ever removed from the
#    mirror, so a file deleted by mistake, or by a bug, is still there.
#    The one exception is an account its pilot deleted: their files leave the
#    mirror too, as the account page promises (see backup-offsite.sh).
# 4. Prunes: daily dumps after 14 days, weekly after 8 weeks, and all but the
#    newest three local dumps.
# 5. Reports to BACKUP_HEARTBEAT_URL, when set: the URL itself on success,
#    and /fail on any failure. A check there (healthchecks.io or alike)
#    emails when a failure arrives or when no report does — which also
#    catches a cron that stopped, or a server that is off.
#
# Off-site means off this box: a backup on the same disk dies with it. The
# bucket is EU-jurisdiction R2 and the token can touch that bucket only.
set -euo pipefail

cd "$(dirname "$(readlink -f "$0")")"
umask 077

set -a
# shellcheck source=/dev/null
. ./.env
set +a

for name in POSTGRES_USER POSTGRES_DB S3_ACCESS_KEY S3_SECRET_KEY \
  BACKUP_S3_ENDPOINT BACKUP_S3_BUCKET BACKUP_S3_ACCESS_KEY BACKUP_S3_SECRET_KEY; do
  if [ -z "${!name:-}" ]; then
    echo "backup: $name is not set in .env" >&2
    exit 1
  fi
done

log() { echo "$(date -u +%FT%TZ) $*"; }

# Best effort: an unreachable monitor must not fail the backup itself.
report() {
  [ -n "${BACKUP_HEARTBEAT_URL:-}" ] || return 0
  curl -fsS -m 10 --retry 3 -o /dev/null "${BACKUP_HEARTBEAT_URL}$1" ||
    log "could not reach the heartbeat monitor"
}

trap 'log "backup FAILED"; report /fail' ERR

mkdir -p backups
stamp=$(date -u +%Y-%m-%dT%H%MZ)
dump="spothub-$stamp.dump"

log "backup started"

docker compose exec -T postgres \
  pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom --no-owner \
  > "backups/$dump"
docker compose exec -T postgres pg_restore --list < "backups/$dump" > /dev/null
log "database dumped and readable: $dump, $(stat -c %s "backups/$dump") bytes"

# Every account that still exists, for the off-site copy to tell a deleted
# pilot's files from a live one's.
docker compose exec -T postgres \
  psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tAc 'SELECT id FROM users' \
  > backups/live-users.txt
log "accounts: $(wc -l < backups/live-users.txt)"

# Sunday, by the day of the week the dump was taken on.
weekly=no
[ "$(date -u +%u)" = 7 ] && weekly=yes

docker compose run --rm --no-deps -T \
  --user "$(id -u):$(id -g)" -e HOME=/tmp \
  -v "$PWD/backups:/backups:ro" \
  -v "$PWD/backup-offsite.sh:/backup-offsite.sh:ro" \
  -v "$PWD/backup-purge.sh:/backup-purge.sh:ro" \
  backup /backup-offsite.sh "$dump" "$weekly"

# The three newest stay on the box for a quick restore; R2 holds the history.
ls -1t backups/spothub-*.dump | tail -n +4 | xargs -r rm --

log "backup finished"
report ""
