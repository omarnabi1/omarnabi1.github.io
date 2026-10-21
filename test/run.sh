#!/usr/bin/env bash
# Starts a throwaway local server (fresh state), runs the end-to-end checks, then stops it.
set -euo pipefail
cd "$(dirname "$0")/.."
STATE=$(mktemp -d)
export WRANGLER_SEND_METRICS=false
# Local runs skip the remote Workers AI binding (Envoy falls back to rules-based replies).
grep -v '"ai": { "binding": "AI" }' wrangler.jsonc > .wrangler.test.jsonc
npx wrangler dev -c .wrangler.test.jsonc --port 8799 --ip 127.0.0.1 --persist-to "$STATE" --var OWNER_KEY:dev-owner-key >/tmp/omarnabi-dev.log 2>&1 &
PID=$!
trap 'kill $PID 2>/dev/null; rm -rf "$STATE" .wrangler.test.jsonc' EXIT
for i in $(seq 1 60); do curl -sf -m 2 http://127.0.0.1:8799/api/health >/dev/null && break; sleep 1; done
BASE=http://127.0.0.1:8799 node test/e2e.mjs
