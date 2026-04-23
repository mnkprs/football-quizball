#!/usr/bin/env bash
# Run a SQL file or stdin against the linked Supabase project via the
# Management API. Useful when local migrations have drifted from remote
# (so `supabase db push` would fail) and you just want to apply one
# idempotent change.
#
# Usage:
#   scripts/supabase-sql.sh path/to/file.sql
#   echo "select 1" | scripts/supabase-sql.sh
#
# Reads SUPABASE_ACCESS_TOKEN and SUPABASE_PROJECT_REF from .env (gitignored).

set -euo pipefail

cd "$(dirname "$0")/.."

if [[ -f .env ]]; then
  set -a; . ./.env; set +a
fi

: "${SUPABASE_ACCESS_TOKEN:?SUPABASE_ACCESS_TOKEN missing — set it in .env}"
: "${SUPABASE_PROJECT_REF:?SUPABASE_PROJECT_REF missing — set it in .env}"

if [[ $# -ge 1 && -f "$1" ]]; then
  SQL=$(cat "$1")
else
  SQL=$(cat)
fi

curl -fsS -X POST "https://api.supabase.com/v1/projects/${SUPABASE_PROJECT_REF}/database/query" \
  -H "Authorization: Bearer ${SUPABASE_ACCESS_TOKEN}" \
  -H "Content-Type: application/json" \
  --data "$(jq -nc --arg q "$SQL" '{query:$q}')"
echo
