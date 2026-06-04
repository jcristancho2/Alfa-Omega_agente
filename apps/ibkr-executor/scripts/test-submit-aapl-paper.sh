#!/usr/bin/env bash
set -euo pipefail

if [[ "${CONFIRM_SUBMIT:-false}" != "true" ]]; then
  echo "Refusing to submit. Set CONFIRM_SUBMIT=true to continue." >&2
  exit 1
fi

EXECUTOR_URL="${EXECUTOR_URL:-http://localhost:8080}"

curl -sS -X POST "$EXECUTOR_URL/orders" \
  -H "x-api-key: ${EXECUTOR_API_KEY:?EXECUTOR_API_KEY is required}" \
  -H "content-type: application/json" \
  -d '{
    "accountMode":"paper",
    "symbol":"AAPL",
    "conid":265598,
    "side":"BUY",
    "orderType":"LMT",
    "quantity":1,
    "limitPrice":100,
    "tif":"DAY"
  }'
