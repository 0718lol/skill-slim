#!/usr/bin/env bash
# One-shot: run both prompt variants over the 15 cases, then apply the gate.
set -euo pipefail
cd "$(dirname "$0")"

if [ -f .env ]; then
  set -a; . ./.env; set +a
fi
: "${OPENAI_API_KEY:?set OPENAI_API_KEY (see .env.example)}"

./node_modules/.bin/promptfoo eval \
  -c promptfooconfig.mjs \
  --no-cache \
  --no-progress-bar \
  --max-concurrency 4 \
  -o results/latest.json

node scripts/gate.mjs results/latest.json
node scripts/render-report.mjs results/latest.json
