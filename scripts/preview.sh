#!/bin/sh
set -eu
export HOST="${HOST:-0.0.0.0}"
export PORT="${PORT:-3000}"

# Make the repo-root `.env` authoritative for the local preview.
#
# The sandbox force-injects its own DATABASE_URL (see CEZ_ENV_PASSTHROUGH) pointing at
# an unrelated `open-mercato` database, and it would silently win: `createOrmConfig()`
# prefers DATABASE_URL over the discrete DB_* vars, and neither dotenv nor Next
# overrides a variable that is already in the environment. Re-exporting `.env` here
# puts the project's own values back on top for the dev server.
#
# Scoped to this preview launcher on purpose — CI, integration tests and production
# still take DATABASE_URL from their own environment.
repo_root="$(CDPATH='' cd -- "$(dirname -- "$0")/.." && pwd)"
if [ -f "$repo_root/.env" ]; then
  set -a
  . "$repo_root/.env"
  set +a
fi

exec npm run dev -- --hostname 0.0.0.0 --port 3000
