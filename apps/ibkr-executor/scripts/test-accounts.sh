#!/usr/bin/env bash
set -euo pipefail

EXECUTOR_URL="${EXECUTOR_URL:-http://localhost:8080}"

curl -sS "$EXECUTOR_URL/ibkr/accounts" \
  -H "x-api-key: ${EXECUTOR_API_KEY:?EXECUTOR_API_KEY is required}"
