#!/usr/bin/env bash
# Is the site up, and is the disk filling? Run by cron on the server every
# five minutes:
#
#   */5 * * * * /opt/spothub/watch.sh >> /opt/spothub/backups/watch.log 2>&1
#
# Each answer goes to its own check (healthchecks.io or alike), so the email
# says which it is:
#
# - UPTIME_HEARTBEAT_URL — the site, asked the way a visitor asks it: the
#   public address, through DNS, the certificate and Caddy. /api/health must
#   say "ok" (the API is up and reaches the database) and the home page must
#   render. A failure is reported to /fail at once; a server that is off, or
#   a cron that stopped, reports nothing, and the check emails about that too.
# - DISK_HEARTBEAT_URL — the root disk, where the database, the photos and
#   the logs all live. Past DISK_ALERT_PERCENT (80 unless set) it reports
#   /fail with the numbers, every five minutes until there is room again.
#
# Either URL unset skips that half. Nothing here changes anything.
set -uo pipefail

cd "$(dirname "$(readlink -f "$0")")"

set -a
# shellcheck source=/dev/null
. ./.env
set +a

log() { echo "$(date -u +%FT%TZ) $*"; }

# Sends `body` as the ping's text, which the alert email quotes. Best effort:
# an unreachable monitor is logged, never fatal.
report() {
  local url=$1 suffix=$2 body=$3
  curl -fsS -m 10 --retry 3 -o /dev/null --data-raw "$body" "${url}${suffix}" ||
    log "could not reach the monitor"
}

check_site() {
  [ -n "${UPTIME_HEARTBEAT_URL:-}" ] || return 0

  local site="https://${SITE_DOMAIN}" health page problem=""

  health=$(curl -sS -m 20 "$site/api/health" 2>&1) || problem="the API did not answer: $health"
  if [ -z "$problem" ] && [[ "$health" != *'"status":"ok"'* ]]; then
    problem="the API is not healthy: $health"
  fi

  if [ -z "$problem" ]; then
    page=$(curl -sS -m 20 -o /dev/null -w '%{http_code}' "$site/" 2>&1) || page="no answer: $page"
    [ "$page" = "200" ] || problem="the home page answered $page"
  fi

  if [ -n "$problem" ]; then
    log "site DOWN: $problem"
    report "$UPTIME_HEARTBEAT_URL" /fail "$problem"
  else
    report "$UPTIME_HEARTBEAT_URL" "" "up"
  fi
}

check_disk() {
  [ -n "${DISK_HEARTBEAT_URL:-}" ] || return 0

  local limit=${DISK_ALERT_PERCENT:-80} line used
  # Size, used, available and use% of the root filesystem, in plain numbers.
  line=$(df -P -h / | tail -n 1)
  used=$(df --output=pcent / | tail -n 1 | tr -dc '0-9')

  if [ "$used" -ge "$limit" ]; then
    log "disk at ${used}% (limit ${limit}%)"
    report "$DISK_HEARTBEAT_URL" /fail "Disk ${used}% full, past ${limit}%: $line"
  else
    report "$DISK_HEARTBEAT_URL" "" "Disk ${used}% full: $line"
  fi
}

check_site
check_disk
