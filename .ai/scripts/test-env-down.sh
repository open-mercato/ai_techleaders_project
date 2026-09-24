#!/bin/sh
# om-prepare-test-env: generated entrypoint (contract v2)
# regenerate with: om-prepare-test-env --regenerate
# history:
#   2026-09-10 generated for isolated Next.js/PostgreSQL UI QA on macOS
#   2026-09-24 repair: Linux process-group teardown and scoped local PostgreSQL cleanup without jq
set -eu

ROOT=$(CDPATH= cd -- "$(dirname "$0")/../.." && pwd)
cd "$ROOT"
DESCRIPTOR=.ai/qa/test-env.json
[ -f "$DESCRIPTOR" ] || exit 0

json_get() {
  node -e '
    const fs = require("node:fs");
    const value = process.argv[2].split(".").reduce((v, key) => v?.[key], JSON.parse(fs.readFileSync(process.argv[1], "utf8")));
    process.stdout.write(value === undefined || value === null ? "" : String(value));
  ' "$1" "$2"
}

[ "$(json_get "$DESCRIPTOR" startedByThisRepo 2>/dev/null || true)" = true ] || exit 0
recorded_root=$(json_get "$DESCRIPTOR" projectRoot 2>/dev/null || true)
[ "$recorded_root" = "$ROOT" ] || { echo 'Refusing to stop an environment owned by another checkout.' >&2; exit 1; }

app_pid=$(json_get "$DESCRIPTOR" app.pid 2>/dev/null || echo 0)
case "$app_pid" in ''|*[!0-9]*|0|1) app_pid=0 ;; esac
if [ "$app_pid" -gt 1 ] && kill -0 "$app_pid" 2>/dev/null; then
  process_root=$(readlink "/proc/$app_pid/cwd" 2>/dev/null || true)
  if [ "$process_root" = "$ROOT" ]; then
    kill -TERM -"$app_pid" >/dev/null 2>&1 || true
    for _ in $(seq 1 20); do kill -0 "$app_pid" 2>/dev/null || break; sleep 0.25; done
    kill -KILL -"$app_pid" >/dev/null 2>&1 || true
  else
    echo "Refusing to stop pid $app_pid because its working directory is not this checkout." >&2
  fi
fi

pg_data=$(json_get "$DESCRIPTOR" services.0.dataDir 2>/dev/null || true)
if command -v pg_config >/dev/null 2>&1; then
  pg_bindir=$(pg_config --bindir)
else
  pg_bindir=
  for candidate in /usr/lib/postgresql/*/bin; do [ -x "$candidate/pg_ctl" ] && pg_bindir=$candidate; done
fi
case "$pg_data" in
  "${TMPDIR:-/tmp}"/devmentor-qa-postgres.*)
    [ -z "$pg_bindir" ] || "$pg_bindir/pg_ctl" -D "$pg_data" -m fast -w stop >/dev/null 2>&1 || true
    find "$pg_data" -mindepth 1 -delete 2>/dev/null || true
    rmdir "$pg_data" 2>/dev/null || true
    ;;
  '') ;;
  *) echo "Refusing to remove unexpected PostgreSQL data directory: $pg_data" >&2 ;;
esac

rm -f .ai/qa/test-env-cookie.txt
node -e '
  const fs=require("node:fs"); const p=process.argv[1]; const v=JSON.parse(fs.readFileSync(p,"utf8"));
  v.status="stopped"; fs.writeFileSync(p,JSON.stringify(v,null,2)+"\n");
' "$DESCRIPTOR"
