#!/usr/bin/env bash
# DEV-ONLY helper: rebuilds the micitaapp_test database from scratch against a native
# Postgres install (no Docker) and runs the pgTAP suite. Used in this environment because
# the Supabase CLI's Docker-based `supabase start` needs registry pulls that are blocked by
# egress policy here. On a machine with Docker access, prefer `pnpm db:reset && pnpm db:test`.
set -euo pipefail
cd "$(dirname "$0")/.."

su postgres -c "dropdb --if-exists micitaapp_test"
su postgres -c "createdb micitaapp_test"
su postgres -c "psql -d micitaapp_test -v ON_ERROR_STOP=1 -f $(pwd)/scripts/local_pg_auth_shim.sql" > /dev/null
for f in supabase/migrations/*.sql; do
  su postgres -c "psql -d micitaapp_test -v ON_ERROR_STOP=1 -f $(pwd)/$f" > /dev/null
done
su postgres -c "psql -d micitaapp_test -v ON_ERROR_STOP=1 -f $(pwd)/supabase/seed.sql" > /dev/null
su postgres -c "psql -d micitaapp_test -c 'create extension if not exists pgtap;'" > /dev/null

echo "micitaapp_test rebuilt. Running pgTAP suite..."
su postgres -c "pg_prove -d micitaapp_test $(pwd)/supabase/tests/*.sql"
