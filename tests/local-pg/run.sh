#!/usr/bin/env bash
# ===========================================================================
# Local PostgreSQL RLS / schema test runner
# Simulates Supabase (auth schema + roles), applies the REAL production
# migrations, then runs an extensive security & functionality test suite.
# ===========================================================================
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
PGDATA="/tmp/daloul-pgdata"
PGPORT=55432
PGUSER=postgres
export PGPORT

# --- start a throwaway postgres instance -------------------------------
sudo -n true 2>/dev/null || { echo "need sudo"; exit 1; }
sudo systemctl start postgresql 2>/dev/null || true
sudo -u postgres psql -p 5432 -c "select 1" >/dev/null 2>&1 || {
  sudo systemctl start postgresql@17-main 2>/dev/null || sudo service postgresql start
}

DB="daloul_test"

# postgres user may not read /home/user — stage SQL into /tmp for the run
STAGE=$(mktemp -d)
cp "$ROOT/tests/local-pg/00_supabase_stub.sql" "$STAGE/"
cp "$ROOT/tests/local-pg/10_tests.sql" "$STAGE/"
cp "$ROOT/supabase/migrations/0001_schema.sql" "$STAGE/"
cp "$ROOT/supabase/migrations/0002_rls.sql" "$STAGE/"
chmod 755 "$STAGE" && chmod 644 "$STAGE"/*.sql
trap 'rm -rf "$STAGE"' EXIT

reset_db() {
  sudo -u postgres psql -q -c "drop database if exists $DB;"
  sudo -u postgres psql -q -c "create database $DB;"
}
reset_db

run_sql() { sudo -u postgres psql -v ON_ERROR_STOP=1 -q -d "$DB" -f "$STAGE/$(basename "$1")"; }

echo "==> [1/4] Applying Supabase environment stub..."
run_sql "$ROOT/tests/local-pg/00_supabase_stub.sql"

echo "==> [2/4] Applying production migrations..."
run_sql "$ROOT/supabase/migrations/0001_schema.sql"
run_sql "$ROOT/supabase/migrations/0002_rls.sql"

echo "==> [3/4] Re-applying migrations (idempotency check)..."
run_sql "$ROOT/supabase/migrations/0001_schema.sql"
run_sql "$ROOT/supabase/migrations/0002_rls.sql"

echo "==> [4/4] Running test suite..."
run_sql "$ROOT/tests/local-pg/10_tests.sql"

echo ""
echo "✅ ALL LOCAL DATABASE TESTS PASSED"
