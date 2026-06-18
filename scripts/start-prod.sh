#!/usr/bin/env bash
# Start ALFA-OMEGA services headlessly via PM2.
# Run from the project root: ./scripts/start-prod.sh
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$SCRIPT_DIR/.."

cd "$ROOT"

# Build dashboard if .next is stale or missing
if [ ! -d "apps/dashboard/.next/server" ]; then
  echo "[start-prod] Building dashboard..."
  bun --cwd apps/dashboard build
fi

pm2 start ecosystem.config.cjs
pm2 save

echo ""
echo "ALFA-OMEGA running. Commands:"
echo "  pm2 status          — service list"
echo "  pm2 logs            — tail all logs"
echo "  pm2 logs alfa-api   — tail one service"
echo "  pm2 stop all        — stop all"
echo "  pm2 restart all     — restart all"
