#!/bin/sh
# The off-site half of backup.sh, run inside the `backup` container — the
# MinIO image, for its `mc` — on the stack's network, so it reaches MinIO at
# minio:9000 without publishing a port. Not meant to be run by hand.
#
#   backup-offsite.sh <dump file name in /backups> <weekly: yes|no>
#
# /backups/live-users.txt lists every account that exists, one id a line.
set -eu

dump="$1"
weekly="$2"
r2="r2/$BACKUP_S3_BUCKET"

mc alias set local http://minio:9000 "$S3_ACCESS_KEY" "$S3_SECRET_KEY" > /dev/null
mc alias set r2 "$BACKUP_S3_ENDPOINT" "$BACKUP_S3_ACCESS_KEY" "$BACKUP_S3_SECRET_KEY" --api S3v4 > /dev/null

mc cp -q "/backups/$dump" "$r2/db/daily/$dump" > /dev/null
echo "database: uploaded to db/daily/"

if [ "$weekly" = yes ]; then
  mc cp -q "/backups/$dump" "$r2/db/weekly/$dump" > /dev/null
  echo "database: uploaded to db/weekly/"
fi

# Additive on purpose: no --remove, so a deletion here never reaches the copy.
mc mirror -q --overwrite "local/$S3_BUCKET" "$r2/media" > /dev/null
echo "storage: mirrored to media/ ($(mc ls --recursive "$r2/media" | wc -l) files there)"

# The one deletion that does reach it: a pilot who deleted their account.
# Every file is stored under its owner's id, so a top-level folder whose id is
# no longer an account belongs to someone who left. The list of accounts comes
# from the database, never from storage — a storage bucket lost or emptied by
# mistake removes nothing here — and an empty list removes nothing at all.
. /backup-purge.sh
purge_departed "$r2/media" /backups/live-users.txt

# Nothing old enough yet is not an error, so an empty prune passes.
mc rm -q --recursive --force --older-than 14d "$r2/db/daily/" > /dev/null 2>&1 || true
mc rm -q --recursive --force --older-than 56d "$r2/db/weekly/" > /dev/null 2>&1 || true

# What a glance at the bucket, or a future monitor, can read to know the
# last night that finished.
date -u +%FT%TZ | mc pipe -q "$r2/last-success.txt" > /dev/null
echo "off-site copy complete"
