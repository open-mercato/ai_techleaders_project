#!/bin/sh
# om-prepare-test-env: generated entrypoint (contract v2)
# regenerate with: om-prepare-test-env --regenerate
# history:
#   2026-09-10 generated for isolated Next.js/PostgreSQL UI QA
#   2026-09-10 repair: retain dev build dependencies under NODE_ENV=production
#   2026-09-10 repair: share the primary install in nested worktrees so Turbopack stays inside its detected repository root
#   2026-09-10 repair: use the supported Webpack dev server in nested worktrees; Turbopack rejects both local and shared dependencies below the common Git root
#   2026-09-10 repair: detach the dev process so warm QA runs can reuse the environment
#   2026-09-10 repair: supervise the macOS app process with launchd because command sessions reap background children
#   2026-09-10 repair: pass the version-managed Node toolchain path into launchd
#   2026-09-10 repair: wait past launchd xpcproxy handoff before recording the app pid
#   2026-09-10 repair: exclude generated build output from the source-freshness reuse check
#   2026-09-10 repair: parse descriptor timestamps as UTC rather than the local timezone
set -eu

QA_DIR=.ai/qa
DESCRIPTOR="$QA_DIR/test-env.json"
BUILD_CACHE="$QA_DIR/test-env-build-cache.json"
ENV_FILE="$QA_DIR/test-env.env"
LOCK_DIR="$QA_DIR/test-env.lock"
APP_LOG="$QA_DIR/test-env-app.log"
BUILD_INPUTS="packages scripts package.json package-lock.json tsconfig.json tsconfig.base.json next.config.ts"
ARTIFACTS="node_modules"
CACHE_TTL=${TEST_ENV_CACHE_TTL_SECONDS:-600}
FORCE=0
FORCE_REBUILD=0
for arg in "$@"; do
  case "$arg" in
    --force) FORCE=1 ;;
    --force-rebuild) FORCE_REBUILD=1 ;;
    *) echo "Unknown argument: $arg" >&2; exit 2 ;;
  esac
done

mkdir -p "$QA_DIR"
if ! mkdir "$LOCK_DIR" 2>/dev/null; then
  owner_pid=$(jq -r '.pid // 0' "$LOCK_DIR/owner.json" 2>/dev/null || echo 0)
  if ! kill -0 "$owner_pid" 2>/dev/null; then
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
container=
launch_label=
cleanup() {
  if [ "$success" -ne 1 ]; then
    [ -z "$launch_label" ] || launchctl remove "$launch_label" >/dev/null 2>&1 || true
    [ -z "$container" ] || docker rm -f "$container" >/dev/null 2>&1 || true
  fi
  rm -f "$LOCK_DIR/owner.json"
  rmdir "$LOCK_DIR" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

if [ "$FORCE" -ne 1 ] && [ -f "$DESCRIPTOR" ]; then
  status=$(jq -r '.status // ""' "$DESCRIPTOR")
  old_pid=$(jq -r '.app.pid // 0' "$DESCRIPTOR")
  base_url=$(jq -r '.baseUrl // ""' "$DESCRIPTOR")
  started_at=$(jq -r '.startedAt // ""' "$DESCRIPTOR")
  started_epoch=$(TZ=UTC date -j -f '%Y-%m-%dT%H:%M:%SZ' "$started_at" +%s 2>/dev/null || echo 0)
  now_epoch=$(date +%s)
  fresh=0
  [ $((now_epoch - started_epoch)) -le "$CACHE_TTL" ] && fresh=1
  changed=$(find packages scripts package.json package-lock.json tsconfig.json tsconfig.base.json -type f \
    ! -path '*/node_modules/*' ! -path '*/.next/*' ! -path '*/coverage/*' ! -path '*/storybook-static/*' \
    -newer "$DESCRIPTOR" 2>/dev/null | head -n 1 || true)
  if [ "$status" = running ] && [ "$fresh" -eq 1 ] && [ -z "$changed" ] \
    && kill -0 "$old_pid" 2>/dev/null \
    && curl -fsS --max-time 5 "$base_url/api/health" | jq -e '.status == "ok" and .database == "up"' >/dev/null; then
    success=1
    echo "TEST_ENV_STATUS=running"
    echo "TEST_ENV_BASE_URL=$base_url"
    echo "TEST_ENV_DESCRIPTOR=$DESCRIPTOR"
    echo "TEST_ENV_REUSED=1"
    echo "BROWSER_PROVIDER=agent-browser"
    echo "BROWSER_INSTALLED=1"
    exit 0
  fi
  sh .ai/scripts/test-env-down.sh >/dev/null 2>&1 || true
fi

free_port() {
  node -e 'const s=require("net").createServer();s.listen(0,"127.0.0.1",()=>{console.log(s.address().port);s.close()})'
}
fp_file() { stat -f '%z:%m' "$1" 2>/dev/null || stat -c '%s:%Y' "$1" 2>/dev/null; }
fingerprint() {
  {
    for path in $BUILD_INPUTS; do
      if [ -d "$path" ]; then
        find "$path" -type f ! -path '*/node_modules/*' ! -path '*/.next/*' ! -path '*/coverage/*' ! -path '*/storybook-static/*'
      elif [ -f "$path" ]; then
        echo "$path"
      fi
    done | LC_ALL=C sort | while IFS= read -r file; do printf '%s:%s\n' "$file" "$(fp_file "$file")"; done
    printf 'env:NODE_ENV=development\n'
  } | cksum | awk '{print $1"-"$2}'
}
build_needed() {
  [ "$FORCE_REBUILD" -eq 1 ] && return 0
  [ -f "$BUILD_CACHE" ] || return 0
  cached_fp=$(jq -r '.sourceFingerprint // ""' "$BUILD_CACHE" 2>/dev/null || echo '')
  cached_root=$(jq -r '.projectRoot // ""' "$BUILD_CACHE" 2>/dev/null || echo '')
  [ "$cached_fp" = "$(fingerprint)" ] || return 0
  [ "$cached_root" = "$(pwd)" ] || return 0
  for artifact in $ARTIFACTS; do [ -d "$artifact" ] || [ -s "$artifact" ] || return 0; done
  return 1
}

run_id="$(date -u +%Y%m%d-%H%M%S)-$$"
db_port=$(free_port)
app_port=$(free_port)
container="devmentor-qa-$run_id"
launch_label="devmentor-qa-$run_id"
database_url="postgres://devmentor:devmentor@127.0.0.1:$db_port/devmentor_qa"
base_url="http://127.0.0.1:$app_port"
session_secret=$(openssl rand -hex 32)
cat > "$ENV_FILE" <<EOF
DATABASE_URL=$database_url
SESSION_SECRET=$session_secret
APP_URL=$base_url
NODE_ENV=development
NEXT_TELEMETRY_DISABLED=1
DB_POOL_MIN=0
DB_POOL_MAX=5
DB_MIGRATIONS_SNAPSHOT=false
AUTH_IDENTITY_ADAPTER=mock
MAILER_ADAPTER=log
INTEGRATION_TEST_RUN=1
OPERATOR_EMAILS=mock-operator@devmentor.test
TEST_MENTOR_PASSWORD=not-used-mock-identity
EOF
chmod 600 "$ENV_FILE"
set -a
. "$ENV_FILE"
set +a

docker run -d --rm --name "$container" \
  -e POSTGRES_DB=devmentor_qa -e POSTGRES_USER=devmentor -e POSTGRES_PASSWORD=devmentor \
  -p "127.0.0.1:$db_port:5432" postgres:17-alpine >/dev/null
ready=0
for _ in $(seq 1 60); do
  if docker exec "$container" pg_isready -U devmentor -d devmentor_qa >/dev/null 2>&1; then ready=1; break; fi
  sleep 1
done
[ "$ready" -eq 1 ] || { echo 'PostgreSQL did not become ready.' >&2; exit 1; }

if build_needed; then
  npm ci --include=dev --prefer-offline
  npm run typecheck
  jq -n --arg at "$(date -u +%FT%TZ)" --arg fp "$(fingerprint)" --arg root "$(pwd)" \
    --arg artifacts "$ARTIFACTS" '{builtAt:$at,sourceFingerprint:$fp,projectRoot:$root,artifactPaths:$artifacts}' > "$BUILD_CACHE"
fi
npm run db:migrate
npm run db:seed

project_root=$(pwd)
tool_path=$PATH
npm_command=$(command -v npm)
: > "$APP_LOG"
launchctl submit -l "$launch_label" -- /bin/sh -c \
  'cd "$1"; set -a; . "$2"; set +a; PATH=$5; export PATH; exec "$6" run dev --workspace @devmentor/app -- --hostname 127.0.0.1 --port "$3" --webpack > "$4" 2>&1' \
  sh "$project_root" "$project_root/$ENV_FILE" "$app_port" "$project_root/$APP_LOG" "$tool_path" "$npm_command"
sleep 1
app_pid=$(launchctl print "gui/$(id -u)/$launch_label" | sed -n 's/^[[:space:]]*pid = \([0-9][0-9]*\)$/\1/p' | head -n 1)
[ -n "$app_pid" ] || { echo 'launchd did not report an application pid.' >&2; exit 1; }
healthy=0
for _ in $(seq 1 120); do
  if ! launchctl print "gui/$(id -u)/$launch_label" >/dev/null 2>&1; then tail -80 "$APP_LOG" >&2; exit 1; fi
  if curl -fsS --max-time 5 "$base_url/api/health" 2>/dev/null | jq -e '.status == "ok" and .database == "up"' >/dev/null 2>&1; then healthy=1; break; fi
  sleep 1
done
[ "$healthy" -eq 1 ] || { echo 'Application did not become ready.' >&2; exit 1; }

started_at=$(date -u +%FT%TZ)
browser_command="$(pwd)/node_modules/.bin/agent-browser"
jq -n \
  --arg runId "$run_id" --arg baseUrl "$base_url" --arg databaseUrl "$database_url" \
  --arg container "$container" --arg launchLabel "$launch_label" --arg browserCommand "$browser_command" --arg startedAt "$started_at" \
  --argjson appPort "$app_port" --argjson dbPort "$db_port" --argjson appPid "$app_pid" \
  '{version:1,runId:$runId,status:"running",mode:"dev",baseUrl:$baseUrl,startedByThisRepo:true,startScript:".ai/scripts/test-env-up.sh",stopScript:".ai/scripts/test-env-down.sh",app:{startCommand:"npm run dev --workspace @devmentor/app -- --webpack",port:$appPort,healthPath:"/api/health",pid:$appPid,launchLabel:$launchLabel},services:[{type:"postgres",host:"127.0.0.1",port:$dbPort,container:$container,url:$databaseUrl,env:{DATABASE_URL:$databaseUrl}}],credentials:[{role:"mentor",username:"mock-mentor",passwordEnv:"TEST_MENTOR_PASSWORD"}],credentialsFile:".ai/qa/test-env.env",browser:{provider:"agent-browser",installed:true,command:$browserCommand,version:"0.36.0",descriptor:".ai/browsers/agent-browser.md",notes:"Repository-pinned agent-browser passed doctor."},testRunner:{name:"vitest+agent-browser",config:"vitest.integration.config.mts"},platform:"darwin",startedAt:$startedAt,notes:"Ephemeral PostgreSQL; migrations and idempotent seed applied. Webpack dev mode avoids the current Next.js Turbopack nested-worktree root bug. launchd keeps the app alive across command sessions. Mock GitHub identity is enabled only for this disposable integration run."}' > "$DESCRIPTOR"

success=1
echo "TEST_ENV_STATUS=running"
echo "TEST_ENV_BASE_URL=$base_url"
echo "TEST_ENV_DESCRIPTOR=$DESCRIPTOR"
echo "TEST_ENV_REUSED=0"
echo "BROWSER_PROVIDER=agent-browser"
echo "BROWSER_INSTALLED=1"
