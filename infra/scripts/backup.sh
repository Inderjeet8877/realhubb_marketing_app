#!/bin/sh
# Nightly logical backup of the Broadzen database (run from infra/).
#   ./scripts/backup.sh            → backups/broadzen-YYYYmmdd-HHMM.sql.gz, keeps the last 14
# On a VPS, schedule with cron:  15 2 * * * cd /opt/broadzen/infra && ./scripts/backup.sh
# and copy backups/ off-site (e.g. `rclone copy backups r2:broadzen-backups`).
set -eu
cd "$(dirname "$0")/.."
mkdir -p backups
file="backups/broadzen-$(date +%Y%m%d-%H%M).sql.gz"
docker compose exec -T postgres pg_dump -U broadzen_owner -d broadzen --no-owner | gzip > "$file"
echo "backup written: $file"
ls -1t backups/broadzen-*.sql.gz | tail -n +15 | xargs -r rm --
