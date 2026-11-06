#!/usr/bin/env bash
set -Eeuo pipefail

APP_DIR=/opt/homepos/app
cd "$APP_DIR"

# The deployment shell is launched by SSH, outside systemd, so load the
# production connection string explicitly for database migrations.
set -a
. /etc/homepos/homepos.env
set +a

git fetch --prune origin main
git reset --hard origin/main
npm ci
npm run db:migrate
npm run build
sudo -n systemctl restart homepos
curl --fail --silent --show-error http://127.0.0.1:3000/api/catalog >/dev/null

echo "HomePOS deployed from $(git rev-parse --short HEAD)"
