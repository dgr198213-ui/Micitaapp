#!/usr/bin/env bash
# DEV-ONLY helper: rebuilds the micitaapp_test database from scratch against a native
# Postgres install (no Docker) and runs the pgTAP suite. Used in this environment because
# the Supabase CLI's Docker-based `supabase start` needs registry pulls that are blocked by
# egress policy here. On a machine with Docker access, prefer `pnpm db:reset && pnpm db:test`.
#
# Uses `sudo -u postgres` rather than `su postgres -c` so this runs unmodified both as root
# (this sandbox) and as the unprivileged, passwordless-sudo `runner` user on GitHub Actions
# — `su` needs the target user's password in the latter case and would just hang/fail there.
set -euo pipefail
cd "$(dirname "$0")/.."

sudo -u postgres dropdb --if-exists micitaapp_test
sudo -u postgres createdb micitaapp_test
# scripts/concurrency_test.mjs (T-E) connects over TCP as `pg` (node-postgres) rather than
# through the psql unix-socket peer auth the rest of this script uses, so it needs a real
# password. DEV/CI-only credential, matches scripts/concurrency_test.mjs's default.
sudo -u postgres psql -c "alter user postgres with password 'postgres';" > /dev/null
sudo -u postgres psql -d micitaapp_test -v ON_ERROR_STOP=1 -f "$(pwd)/scripts/local_pg_auth_shim.sql" > /dev/null
for f in supabase/migrations/*.sql; do
  sudo -u postgres psql -d micitaapp_test -v ON_ERROR_STOP=1 -f "$(pwd)/$f" > /dev/null
done
sudo -u postgres psql -d micitaapp_test -v ON_ERROR_STOP=1 -f "$(pwd)/supabase/seed.sql" > /dev/null
sudo -u postgres psql -d micitaapp_test -c 'create extension if not exists pgtap;' > /dev/null

echo "micitaapp_test rebuilt. Running pgTAP suite..."
sudo -u postgres pg_prove -d micitaapp_test "$(pwd)"/supabase/tests/*.sql
