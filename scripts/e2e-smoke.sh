#!/usr/bin/env bash
# SPDX-FileCopyrightText: 2026 Antonio De Gaetano <antux912012@users.noreply.github.com>
# SPDX-License-Identifier: Apache-2.0
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

TMP_DIR="$(mktemp -d "$ROOT_DIR/.smoke-tmp.XXXXXX")"
COOKIE_JAR="$TMP_DIR/cookies.txt"
RUNNER_PID=""
API_PID=""

cleanup() {
  [[ -n "$API_PID" ]] && kill "$API_PID" 2>/dev/null || true
  [[ -n "$RUNNER_PID" ]] && kill "$RUNNER_PID" 2>/dev/null || true
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

export RUNNER_PORT="$(python3 -c 'import socket; s=socket.socket(); s.bind(("127.0.0.1",0)); print(s.getsockname()[1]); s.close()')"
export API_PORT="$(python3 -c 'import socket; s=socket.socket(); s.bind(("127.0.0.1",0)); print(s.getsockname()[1]); s.close()')"
export WORKSPACES_ROOT="$TMP_DIR/workspaces"
export DATABASE_URL="file:$TMP_DIR/smoke.sqlite"
export JWT_SECRET="smoke-test-jwt-secret-key-32-chars"
export RUNNER_SHARED_SECRET="smoke-test-runner-secret"
export RUNNER_URL="http://127.0.0.1:$RUNNER_PORT"
export PORT="$API_PORT"
export HOST="127.0.0.1"
export PUBLIC_URL="http://127.0.0.1:$API_PORT"

mkdir -p "$WORKSPACES_ROOT"

echo "[smoke] Starting runner on :$RUNNER_PORT..."
PYTHONPATH="$ROOT_DIR/services/runner" "$ROOT_DIR/services/runner/.venv/bin/uvicorn" \
  app.main:app --host 127.0.0.1 --port "$RUNNER_PORT" --log-level warning &
RUNNER_PID=$!

echo "[smoke] Starting API on :$API_PORT..."
node "$ROOT_DIR/apps/api/dist/server.js" &
API_PID=$!

for i in $(seq 1 30); do
  if curl -fsS "http://127.0.0.1:$RUNNER_PORT/health" >/dev/null 2>&1 && \
     curl -fsS "http://127.0.0.1:$API_PORT/health" >/dev/null 2>&1; then
    break
  fi
  sleep 0.3
done

curl -fsS "http://127.0.0.1:$API_PORT/health" | grep -q '"ok":true'
echo "[smoke] Health OK"

curl -fsS -c "$COOKIE_JAR" -X POST "http://127.0.0.1:$API_PORT/api/auth/register" \
  -H 'Content-Type: application/json' \
  -d '{"email":"smoke@example.org","displayName":"Smoke","password":"smoke-password-123"}' >/dev/null
echo "[smoke] Auth register OK"

WS_JSON="$(curl -fsS -b "$COOKIE_JAR" -X POST "http://127.0.0.1:$API_PORT/api/workspaces" \
  -H 'Content-Type: application/json' \
  -d '{"name":"Smoke Workspace"}')"
WS_ID="$(python3 -c 'import json,sys; print(json.loads(sys.argv[1])["workspace"]["id"])' "$WS_JSON")"
echo "[smoke] Workspace created: $WS_ID"

EXEC_JSON="$(curl -fsS -b "$COOKIE_JAR" -X POST "http://127.0.0.1:$API_PORT/api/workspaces/$WS_ID/execute" \
  -H 'Content-Type: application/json' \
  -d '{"engine":"python","code":"print(6 * 7)"}')"
echo "$EXEC_JSON" | grep -q '42'
echo "[smoke] Runner stateful execute OK"

EXP_JSON="$(curl -sS -b "$COOKIE_JAR" -X POST "http://127.0.0.1:$API_PORT/api/workspaces/$WS_ID/export" \
  -H 'Content-Type: application/json' \
  -d '{"path":"main.qmd","format":"html"}')"
echo "[smoke] Export response: $EXP_JSON"
echo "$EXP_JSON" | grep -q 'main.html'
echo "[smoke] Export HTML OK"

echo "[smoke] ALL E2E SMOKE CHECKS PASSED!"
