#!/bin/sh
# om-prepare-test-env: generated entrypoint (contract v2)
# regenerate with: om-prepare-test-env --regenerate
# history:
#   2026-09-10 generated for isolated Next.js/PostgreSQL UI QA
#   2026-09-10 repair: terminate the launchd job's process group so Next cannot retain its worktree lock
set -eu

DESCRIPTOR=.ai/qa/test-env.json
[ -f "$DESCRIPTOR" ] || exit 0
[ "$(jq -r '.startedByThisRepo // false' "$DESCRIPTOR")" = true ] || exit 0
app_pid=$(jq -r '.app.pid // 0' "$DESCRIPTOR")
launch_label=$(jq -r '.app.launchLabel // ""' "$DESCRIPTOR")
container=$(jq -r '.services[0].container // ""' "$DESCRIPTOR")
if [ -n "$launch_label" ]; then
  launch_pid=$(launchctl print "gui/$(id -u)/$launch_label" 2>/dev/null | sed -n 's/^[[:space:]]*pid = \([0-9][0-9]*\)$/\1/p' | head -n 1)
  launch_pgid=$([ -z "$launch_pid" ] || ps -o pgid= -p "$launch_pid" 2>/dev/null | tr -d ' ' || true)
  launchctl remove "$launch_label" >/dev/null 2>&1 || true
  case "$launch_pgid" in
    ''|*[!0-9]*|0|1) ;;
    *) kill -TERM -"$launch_pgid" >/dev/null 2>&1 || true ;;
  esac
elif kill -0 "$app_pid" 2>/dev/null; then
  kill "$app_pid" 2>/dev/null || true
  for _ in $(seq 1 20); do kill -0 "$app_pid" 2>/dev/null || break; sleep 0.25; done
  kill -9 "$app_pid" 2>/dev/null || true
fi
[ -z "$container" ] || docker rm -f "$container" >/dev/null 2>&1 || true
jq '.status = "stopped"' "$DESCRIPTOR" > "$DESCRIPTOR.tmp"
mv "$DESCRIPTOR.tmp" "$DESCRIPTOR"
