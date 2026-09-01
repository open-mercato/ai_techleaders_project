#!/bin/sh
set -eu
export HOST="${HOST:-0.0.0.0}"
export PORT="${PORT:-3000}"
exec npm run dev -- --hostname 0.0.0.0 --port 3000
