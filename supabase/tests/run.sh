#!/bin/bash
# Runs the whole migration chain + this test suite against a throwaway
# local Postgres database — NOT your Supabase project. This is how every
# migration in this repo was actually verified while being written (see
# README.md "Тесты" for what it caught).
#
# Requires a local PostgreSQL server (NOT the full Supabase stack — just
# plain Postgres 15+). Adjust TEST_DB / PSQL_RUN below if your setup
# differs from "connect as the postgres OS user via `su`".
#
# Usage:
#   ./supabase/tests/run.sh
#
# What this does NOT cover: PostgREST-over-HTTP wire-format quirks (JSON
# array -> Postgres enum[] RPC params, etc.) and the send-push Edge
# Function (see supabase/functions/send-push — run `deno test` there
# separately). Those were checked by hand during development; this
# script covers the SQL/RLS/RPC layer, which is the part most likely to
# break silently as the schema evolves.
set -e
cd "$(dirname "$0")/../.."

DB="${TEST_DB:-restaurant_test}"
PSQL_RUN="${PSQL_RUN:-su - postgres -c}" # override e.g. to "psql -U postgres -h localhost -c" if not running as the postgres OS user
TESTS_DIR="supabase/tests"

echo "=== (re)creating database $DB ==="
$PSQL_RUN "dropdb --if-exists $DB"
$PSQL_RUN "createdb $DB"
$PSQL_RUN "psql -d $DB -v ON_ERROR_STOP=1 -f -" < "$TESTS_DIR/setup_test_env.sql"

echo "=== applying migrations ==="
for f in supabase/migrations/*.sql; do
  echo "--- $f ---"
  $PSQL_RUN "psql -d $DB -v ON_ERROR_STOP=1 -f -" < "$f"
done

echo "=== running test files ==="
for f in "$TESTS_DIR"/*.sql; do
  [ "$(basename "$f")" = "setup_test_env.sql" ] && continue
  echo "--- $f ---"
  $PSQL_RUN "psql -d $DB -v ON_ERROR_STOP=1 -f -" < "$f"
done

echo "=== ALL MIGRATIONS + SQL TESTS PASSED ==="
echo "(run supabase/tests/race_condition_concurrent_accept.sh separately — it needs real parallel OS processes)"
