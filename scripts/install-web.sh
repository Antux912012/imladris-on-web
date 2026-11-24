#!/usr/bin/env bash
# SPDX-FileCopyrightText: 2026 Antonio De Gaetano <antux912012@users.noreply.github.com>
# SPDX-License-Identifier: Apache-2.0
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

MODE="local"
if [[ "${1:-}" == "--vps" ]]; then
  MODE="vps"
fi

if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
  COMPOSE_CMD=(docker compose)
elif command -v podman >/dev/null 2>&1 && podman compose version >/dev/null 2>&1; then
  COMPOSE_CMD=(podman compose)
elif command -v podman-compose >/dev/null 2>&1; then
  COMPOSE_CMD=(podman-compose)
else
  echo "[imladris] Error: neither 'docker compose' nor 'podman compose' was found." >&2
  exit 1
fi

if [[ ! -f .env ]]; then
  cp .env.example .env
  JWT_VAL="$(openssl rand -hex 32 2>/dev/null || python3 -c 'import secrets; print(secrets.token_hex(32))')"
  RUNNER_VAL="$(openssl rand -hex 24 2>/dev/null || python3 -c 'import secrets; print(secrets.token_hex(24))')"
  sed -i "s|^JWT_SECRET=.*|JWT_SECRET=${JWT_VAL}|g" .env
  sed -i "s|^RUNNER_SHARED_SECRET=.*|RUNNER_SHARED_SECRET=${RUNNER_VAL}|g" .env
  echo "[imladris] Generated .env with fresh secrets."
fi

if [[ "$MODE" == "vps" ]]; then
  "${COMPOSE_CMD[@]}" -f docker-compose.yml -f docker-compose.vps.yml up -d --build
else
  "${COMPOSE_CMD[@]}" -f docker-compose.yml up -d --build
fi

echo "[imladris] Stack started in ${MODE} mode using ${COMPOSE_CMD[*]}."
