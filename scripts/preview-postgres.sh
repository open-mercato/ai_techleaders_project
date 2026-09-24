#!/bin/sh
set -eu

repo_root="$(CDPATH='' cd -- "$(dirname -- "$0")/.." && pwd)"
cd "$repo_root"

qa_dir="$repo_root/.ai/qa"
data_dir="$qa_dir/preview-postgres"
log_file="$qa_dir/preview-postgres.log"
lock_file="$qa_dir/preview-postgres.lock"
mkdir -p "$qa_dir"

# This bootstrap must never point at a shared or production database. The workspace preview
# contract is deliberately narrow: mock adapters, the integration guard, loopback PostgreSQL,
# and the database name injected by the workspace runtime.
node -e '
  const url = new URL(process.env.DATABASE_URL ?? "");
  const local = url.hostname === "127.0.0.1" || url.hostname === "localhost";
  const valid = process.env.INTEGRATION_TEST_RUN === "1"
    && process.env.AUTH_IDENTITY_ADAPTER === "mock"
    && local
    && (url.port || "5432") === "5432"
    && url.pathname === "/open-mercato"
    && url.username === "postgres";
  if (!valid) {
    console.error("Refusing to prepare preview PostgreSQL: the disposable preview guards do not match.");
    process.exit(1);
  }
'

# The kernel releases this lock even when a preview is killed or the workspace stops, so a
# stale on-disk marker cannot make every future preview wait and fail.
command -v flock >/dev/null 2>&1 \
  || { echo 'flock is unavailable for the workspace preview.' >&2; exit 1; }
exec 9>"$lock_file"
flock -w 120 9 \
  || { echo 'Preview PostgreSQL bootstrap lock timed out.' >&2; exit 1; }

if command -v pg_config >/dev/null 2>&1; then
  pg_bindir=$(pg_config --bindir)
else
  pg_bindir=
  for candidate in /usr/lib/postgresql/*/bin; do
    [ -x "$candidate/postgres" ] && pg_bindir=$candidate
  done
fi
[ -n "$pg_bindir" ] && [ -x "$pg_bindir/initdb" ] && [ -x "$pg_bindir/pg_ctl" ] \
  || { echo 'PostgreSQL server binaries are unavailable for the workspace preview.' >&2; exit 1; }

if ! "$pg_bindir/pg_isready" -h 127.0.0.1 -p 5432 -U postgres -d open-mercato >/dev/null 2>&1; then
  if [ ! -s "$data_dir/PG_VERSION" ]; then
    mkdir -p "$data_dir"
    "$pg_bindir/initdb" -D "$data_dir" --username=postgres --auth-local=trust \
      --auth-host=trust --no-locale --encoding=UTF8 >/dev/null
  fi
  "$pg_bindir/pg_ctl" -D "$data_dir" -l "$log_file" \
    -o "-h 127.0.0.1 -p 5432 -k $data_dir" -w start >/dev/null
fi

if [ "$("$pg_bindir/psql" -h 127.0.0.1 -p 5432 -U postgres -d postgres -Atc \
  "SELECT 1 FROM pg_database WHERE datname = 'open-mercato'")" != 1 ]; then
  "$pg_bindir/createdb" -h 127.0.0.1 -p 5432 -U postgres -O postgres open-mercato
fi

npm run db:migrate
npm run db:seed
npm run lesson:14:seed

echo 'PREVIEW_DATABASE_STATUS=ready'
