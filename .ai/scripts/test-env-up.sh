#!/bin/sh
# om-prepare-test-env: generated entrypoint (contract v2)
# regenerate with: om-prepare-test-env --regenerate
# history:
#   2026-09-10 generated for isolated Next.js/PostgreSQL UI QA on macOS
#   2026-09-24 repair: regenerate for Linux without jq, Docker, or launchd; use the installed PostgreSQL 17 server and production Next.js
#   2026-09-24 repair: keep the PostgreSQL Unix socket inside its disposable data directory when /var/run/postgresql is not writable
#   2026-09-24 repair: do not reorganize node_modules for an application-only rebuild while another local dev server may be running
#   2026-09-24 repair: accept TEST_ENV_APP_PORT so a workspace preview can use its expected port
#   2026-09-24 repair: support the supervised workspace preview's PostgreSQL address and database name
set -eu

ROOT=$(CDPATH= cd -- "$(dirname "$0")/../.." && pwd)
cd "$ROOT"

QA_DIR=.ai/qa
DESCRIPTOR="$QA_DIR/test-env.json"
BUILD_CACHE="$QA_DIR/test-env-build-cache.json"
ENV_FILE="$QA_DIR/test-env.env"
COOKIE_FILE="$QA_DIR/test-env-cookie.txt"
LOCK_DIR="$QA_DIR/test-env.lock"
APP_LOG="$QA_DIR/test-env-app.log"
PG_LOG="$QA_DIR/test-env-postgres.log"
BUILD_INPUTS="packages scripts package.json package-lock.json tsconfig.json tsconfig.base.json vitest.integration.config.mts"
ARTIFACTS="node_modules/.package-lock.json packages/app/.next/BUILD_ID"
BUILD_ENV_VARS="NODE_ENV APP_URL AUTH_IDENTITY_ADAPTER MAILER_ADAPTER INTEGRATION_TEST_RUN PLATFORM_CURRENCY PLATFORM_PRICE_BOUNDS"
CACHE_TTL=${TEST_ENV_CACHE_TTL_SECONDS:-600}
BROWSER_PROVIDER=agent-browser
BROWSER_COMMAND="$ROOT/node_modules/.bin/agent-browser"
BROWSER_VERSION=0.36.0
BROWSER_INSTALLED=0
BROWSER_NOTES="Chrome downloaded, but this sandbox lacks Linux shared libraries and passwordless package installation. Use a host browser for recording."
FORCE=0
FORCE_REBUILD=0
PREVIEW_MODE=${TEST_ENV_PREVIEW:-0}
case "$PREVIEW_MODE" in 0|1) ;; *) echo 'TEST_ENV_PREVIEW must be 0 or 1.' >&2; exit 2 ;; esac
for arg in "$@"; do
  case "$arg" in
    --force) FORCE=1 ;;
    --force-rebuild) FORCE_REBUILD=1 ;;
    *) echo "Unknown argument: $arg" >&2; exit 2 ;;
  esac
done

json_get() {
  node -e '
    const fs = require("node:fs");
    const value = process.argv[2].split(".").reduce((v, key) => v?.[key], JSON.parse(fs.readFileSync(process.argv[1], "utf8")));
    process.stdout.write(value === undefined || value === null ? "" : String(value));
  ' "$1" "$2"
}

free_port() {
  node -e 'const s=require("node:net").createServer();s.listen(0,"127.0.0.1",()=>{console.log(s.address().port);s.close()})'
}

health_ok() {
  curl -fsS --max-time 5 "$1/api/health" 2>/dev/null \
    | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const v=JSON.parse(s);process.exit(v.status==="ok"&&v.database==="up"?0:1)})' \
    >/dev/null 2>&1
}

auth_ok() {
  [ -f "$ENV_FILE" ] || return 1
  set -a
  . "$ENV_FILE"
  set +a
  rm -f "$COOKIE_FILE"
  login_body=$(node -e 'process.stdout.write(JSON.stringify({email:process.env.TEST_MENTEE_EMAIL,password:process.env.TEST_MENTEE_PASSWORD}))')
  curl -fsS --max-time 10 -c "$COOKIE_FILE" \
    -H 'content-type: application/json' -H 'x-devmentor-request: 1' \
    --data "$login_body" "$1/api/auth/login" 2>/dev/null \
    | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>process.exit(JSON.parse(s).ok===true?0:1))' \
    >/dev/null 2>&1
}

mkdir -p "$QA_DIR"
if ! mkdir "$LOCK_DIR" 2>/dev/null; then
  owner_pid=$(json_get "$LOCK_DIR/owner.json" pid 2>/dev/null || echo 0)
  case "$owner_pid" in ''|*[!0-9]*) owner_pid=0 ;; esac
  if [ "$owner_pid" -eq 0 ] || ! kill -0 "$owner_pid" 2>/dev/null; then
    rm -f "$LOCK_DIR/owner.json"
    rmdir "$LOCK_DIR" 2>/dev/null || true
    mkdir "$LOCK_DIR"
  else
    echo "Another test environment bootstrap is active (pid $owner_pid)." >&2
    exit 1
  fi
fi
printf '{"pid":%s,"source":"om-prepare-test-env","acquiredAt":"%s"}\n' "$$" "$(date -u +%FT%TZ)" > "$LOCK_DIR/owner.json"

success=0
app_pid=
pg_data=
pg_bindir=
cleanup() {
  rm -f "$COOKIE_FILE"
  if [ "$success" -ne 1 ]; then
    case "$app_pid" in ''|*[!0-9]*|0|1) ;; *) kill -TERM -"$app_pid" >/dev/null 2>&1 || true ;; esac
    if [ -n "$pg_data" ] && [ -n "$pg_bindir" ] && [ -x "$pg_bindir/pg_ctl" ]; then
      "$pg_bindir/pg_ctl" -D "$pg_data" -m fast -w stop >/dev/null 2>&1 || true
    fi
    case "$pg_data" in
      "${TMPDIR:-/tmp}"/devmentor-qa-postgres.*)
        find "$pg_data" -mindepth 1 -delete 2>/dev/null || true
        rmdir "$pg_data" 2>/dev/null || true
        ;;
    esac
  fi
  rm -f "$LOCK_DIR/owner.json"
  rmdir "$LOCK_DIR" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

started_seconds=$(date +%s)
if [ -f "$DESCRIPTOR" ]; then
  if [ "$FORCE" -ne 1 ]; then
    status=$(json_get "$DESCRIPTOR" status 2>/dev/null || true)
    old_pid=$(json_get "$DESCRIPTOR" app.pid 2>/dev/null || echo 0)
    base_url=$(json_get "$DESCRIPTOR" baseUrl 2>/dev/null || true)
    started_at=$(json_get "$DESCRIPTOR" startedAt 2>/dev/null || true)
    started_epoch=$(node -e 'const n=Date.parse(process.argv[1]);process.stdout.write(Number.isFinite(n)?String(Math.floor(n/1000)):"0")' "$started_at")
    now_epoch=$(date +%s)
    fresh=0
    [ $((now_epoch - started_epoch)) -le "$CACHE_TTL" ] && fresh=1
    changed=$(find packages scripts package.json package-lock.json tsconfig.json tsconfig.base.json vitest.integration.config.mts -type f \
      ! -path '*/node_modules/*' ! -path '*/.next/*' ! -path '*/coverage/*' ! -path '*/storybook-static/*' \
      ! -name '*.tsbuildinfo' ! -name 'next-env.d.ts' \
      -newer "$DESCRIPTOR" 2>/dev/null | head -n 1 || true)
    case "$old_pid" in ''|*[!0-9]*) old_pid=0 ;; esac
    if [ "$status" = running ] && [ "$fresh" -eq 1 ] && [ -z "$changed" ] \
      && [ "$old_pid" -gt 1 ] && kill -0 "$old_pid" 2>/dev/null \
      && curl -fsS --max-time 5 "$base_url/" >/dev/null 2>&1 \
      && health_ok "$base_url" && auth_ok "$base_url"; then
      warm_seconds=$(( $(date +%s) - started_seconds ))
      node -e '
        const fs=require("node:fs"); const p=process.argv[1]; const v=JSON.parse(fs.readFileSync(p,"utf8"));
        v.notes=v.notes.replace(/; warm: [^;]+/g,"")+`; warm: ${process.argv[2]}s (reused)`;
        fs.writeFileSync(p,JSON.stringify(v,null,2)+"\n");
      ' "$DESCRIPTOR" "$warm_seconds"
      success=1
      echo "TEST_ENV_STATUS=running"
      echo "TEST_ENV_BASE_URL=$base_url"
      echo "TEST_ENV_DESCRIPTOR=$DESCRIPTOR"
      echo "TEST_ENV_REUSED=1"
      echo "BROWSER_PROVIDER=$BROWSER_PROVIDER"
      echo "BROWSER_INSTALLED=$BROWSER_INSTALLED"
      exit 0
    fi
  fi
  sh .ai/scripts/test-env-down.sh >/dev/null 2>&1 || true
fi

fp_file() { stat -f '%z:%m' "$1" 2>/dev/null || stat -c '%s:%Y' "$1" 2>/dev/null; }
fingerprint() {
  {
    for path in $BUILD_INPUTS; do
      if [ -d "$path" ]; then
        find "$path" -type f \
          ! -path '*/node_modules/*' ! -path '*/.git/*' ! -path '*/.next/*' \
          ! -path '*/coverage/*' ! -path '*/storybook-static/*' \
          ! -name '*.tsbuildinfo' ! -name 'next-env.d.ts'
      elif [ -f "$path" ]; then
        echo "$path"
      fi
    done | LC_ALL=C sort | while IFS= read -r file; do printf '%s:%s\n' "$file" "$(fp_file "$file")"; done
    for var_name in $BUILD_ENV_VARS; do
      case "$var_name" in
        NODE_ENV) value=production ;;
        APP_URL) value=runtime-loopback ;;
        AUTH_IDENTITY_ADAPTER) value=mock ;;
        MAILER_ADAPTER) value=log ;;
        INTEGRATION_TEST_RUN) value=1 ;;
        PLATFORM_CURRENCY) value=PLN ;;
        PLATFORM_PRICE_BOUNDS) value=recording-defaults ;;
        *) value= ;;
      esac
      printf 'env:%s=%s\n' "$var_name" "$value"
    done
  } | cksum | awk '{print $1"-"$2}'
}

build_needed() {
  [ "$FORCE_REBUILD" -eq 1 ] && return 0
  [ -f "$BUILD_CACHE" ] || return 0
  cached_fp=$(json_get "$BUILD_CACHE" sourceFingerprint 2>/dev/null || true)
  cached_root=$(json_get "$BUILD_CACHE" projectRoot 2>/dev/null || true)
  [ "$cached_fp" = "$(fingerprint)" ] || return 0
  [ "$cached_root" = "$ROOT" ] || return 0
  for artifact in $ARTIFACTS; do [ -s "$artifact" ] || [ -d "$artifact" ] || return 0; done
  return 1
}

run_id="$(date -u +%Y%m%d-%H%M%S)-$$"
app_port=${TEST_ENV_APP_PORT:-}
case "$app_port" in
  '') app_port=$(free_port) ;;
  *[!0-9]*|0) echo 'TEST_ENV_APP_PORT must be a positive integer.' >&2; exit 2 ;;
esac
if [ "$PREVIEW_MODE" -eq 1 ]; then db_port=5432; else db_port=$(free_port); fi
while [ "$db_port" = "$app_port" ]; do db_port=$(free_port); done
base_url="http://127.0.0.1:$app_port"
if [ "$PREVIEW_MODE" -eq 1 ]; then
  database_name=open-mercato
  database_owner=postgres
  database_url="postgres://postgres@127.0.0.1:$db_port/$database_name"
else
  database_name=devmentor_qa
  database_owner=devmentor
  database_url="postgres://devmentor:devmentor@127.0.0.1:$db_port/$database_name"
fi
session_secret=$(openssl rand -hex 32)
pg_data=$(mktemp -d "${TMPDIR:-/tmp}/devmentor-qa-postgres.XXXXXX")

if command -v pg_config >/dev/null 2>&1; then
  pg_bindir=$(pg_config --bindir)
else
  for candidate in /usr/lib/postgresql/*/bin; do
    [ -x "$candidate/postgres" ] && pg_bindir=$candidate
  done
fi
[ -n "$pg_bindir" ] && [ -x "$pg_bindir/initdb" ] && [ -x "$pg_bindir/pg_ctl" ] \
  || { echo 'PostgreSQL server binaries are unavailable; install PostgreSQL 17 or Docker.' >&2; exit 1; }

"$pg_bindir/initdb" -D "$pg_data" --username=postgres --auth-local=trust --auth-host=trust --no-locale --encoding=UTF8 >/dev/null
"$pg_bindir/pg_ctl" -D "$pg_data" -l "$PG_LOG" -o "-h 127.0.0.1 -p $db_port -k $pg_data" -w start >/dev/null
if [ "$database_owner" = devmentor ]; then
  "$pg_bindir/psql" -h 127.0.0.1 -p "$db_port" -U postgres -d postgres -v ON_ERROR_STOP=1 \
    -c "CREATE ROLE devmentor LOGIN PASSWORD 'devmentor' CREATEDB" >/dev/null
fi
"$pg_bindir/createdb" -h 127.0.0.1 -p "$db_port" -U postgres -O "$database_owner" "$database_name"

printf '%s\n' \
  "DATABASE_URL=$database_url" \
  "SESSION_SECRET=$session_secret" \
  "APP_URL=$base_url" \
  'NODE_ENV=production' \
  'NEXT_TELEMETRY_DISABLED=1' \
  'DB_POOL_MIN=0' \
  'DB_POOL_MAX=5' \
  'DB_MIGRATIONS_SNAPSHOT=false' \
  'INVITATION_TTL_DAYS=14' \
  'MENTOR_PUBLISH_WINDOW_DAYS=14' \
  'PLATFORM_CURRENCY=PLN' \
  "PLATFORM_PRICE_BOUNDS='{\"25\":{\"minCents\":9000,\"maxCents\":60000},\"50\":{\"minCents\":18000,\"maxCents\":120000}}'" \
  'AUTH_IDENTITY_ADAPTER=mock' \
  'MAILER_ADAPTER=log' \
  'INTEGRATION_TEST_RUN=1' \
  'OPERATOR_EMAILS=mock-operator@devmentor.test' \
  'TEST_MENTEE_EMAIL=mock-mentee@devmentor.test' \
  'TEST_MENTEE_PASSWORD=mock-password-not-a-secret' > "$ENV_FILE"
chmod 600 "$ENV_FILE"
set -a
. "$ENV_FILE"
set +a

if build_needed; then
  if [ ! -s node_modules/.package-lock.json ] || [ package-lock.json -nt node_modules/.package-lock.json ]; then
    npm ci --include=dev --include=optional --prefer-offline
  fi
  npm run build
  node -e '
    const fs=require("node:fs");
    fs.writeFileSync(process.argv[1],JSON.stringify({builtAt:new Date().toISOString(),sourceFingerprint:process.argv[2],projectRoot:process.argv[3],artifactPaths:process.argv[4]},null,2)+"\n");
  ' "$BUILD_CACHE" "$(fingerprint)" "$ROOT" "$ARTIFACTS"
fi

npm run db:migrate
npm run db:seed
npm run db:seed
npm run lesson:14:seed

: > "$APP_LOG"
npm_command=$(command -v npm)
nohup setsid "$npm_command" run start --workspace @devmentor/app -- \
  --hostname 127.0.0.1 --port "$app_port" > "$APP_LOG" 2>&1 < /dev/null &
app_pid=$!

healthy=0
for _ in $(seq 1 120); do
  if ! kill -0 "$app_pid" 2>/dev/null; then
    tail -80 "$APP_LOG" >&2
    exit 1
  fi
  if curl -fsS --max-time 5 "$base_url/" >/dev/null 2>&1 && health_ok "$base_url"; then
    healthy=1
    break
  fi
  sleep 1
done
[ "$healthy" -eq 1 ] || { tail -80 "$APP_LOG" >&2; echo 'Application did not become ready.' >&2; exit 1; }

started_at=$(date -u +%FT%TZ)
cold_seconds=$(( $(date +%s) - started_seconds ))
pg_pid=$(head -n 1 "$pg_data/postmaster.pid")
node -e '
  const fs=require("node:fs");
  const [path,runId,baseUrl,databaseUrl,pgData,browserCommand,browserVersion,browserInstalled,browserNotes,startedAt,root,appPort,dbPort,appPid,pgPid,coldSeconds]=process.argv.slice(1);
  const redactedDatabaseUrl=databaseUrl.replace(/^postgres:\/\/[^@]+@/,"postgres://<redacted>@");
  const value={version:1,runId,status:"running",mode:"prod",baseUrl,startedByThisRepo:true,startScript:".ai/scripts/test-env-up.sh",stopScript:".ai/scripts/test-env-down.sh",projectRoot:root,app:{startCommand:"npm run start --workspace @devmentor/app",port:Number(appPort),healthPath:"/api/health",pid:Number(appPid),processGroup:Number(appPid)},services:[{type:"postgres",host:"127.0.0.1",port:Number(dbPort),pid:Number(pgPid),dataDir:pgData,url:redactedDatabaseUrl,env:{DATABASE_URL:redactedDatabaseUrl}}],credentials:[{role:"mentee",username:"mock-mentee@devmentor.test",passwordEnv:"TEST_MENTEE_PASSWORD"}],credentialsFile:".ai/qa/test-env.env",browser:{provider:"agent-browser",installed:browserInstalled==="1",command:browserCommand,version:browserVersion,descriptor:".ai/browsers/agent-browser.md",notes:browserNotes},testRunner:{name:"other",config:"vitest.integration.config.mts"},platform:"linux",startedAt,notes:`Local disposable PostgreSQL 17; migrations and idempotent seed applied twice; production Next.js; mock identity/mail adapters; cold: ${coldSeconds}s`};
  fs.writeFileSync(path,JSON.stringify(value,null,2)+"\n");
' "$DESCRIPTOR" "$run_id" "$base_url" "$database_url" "$pg_data" "$BROWSER_COMMAND" "$BROWSER_VERSION" "$BROWSER_INSTALLED" "$BROWSER_NOTES" "$started_at" "$ROOT" "$app_port" "$db_port" "$app_pid" "$pg_pid" "$cold_seconds"

success=1
echo "TEST_ENV_STATUS=running"
echo "TEST_ENV_BASE_URL=$base_url"
echo "TEST_ENV_DESCRIPTOR=$DESCRIPTOR"
echo "TEST_ENV_REUSED=0"
echo "BROWSER_PROVIDER=$BROWSER_PROVIDER"
echo "BROWSER_INSTALLED=$BROWSER_INSTALLED"
