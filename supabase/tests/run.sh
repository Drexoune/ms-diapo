#!/usr/bin/env bash
# Vérifie le schéma et ses règles de sécurité sur un Postgres local jetable.
# Usage : supabase/tests/run.sh   (nécessite initdb/pg_ctl/psql, PostgreSQL 15+)
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
bin="${PG_BIN:-$(dirname "$(command -v initdb 2>/dev/null || ls /usr/lib/postgresql/*/bin/initdb | tail -1)")}"
work="$(mktemp -d)"
port="${PG_TEST_PORT:-54329}"
# initdb refuse de tourner en root : on passe alors par l'utilisateur postgres.
run() { if [ "$(id -u)" = 0 ]; then su postgres -s /bin/bash -c "$*"; else bash -c "$*"; fi; }
[ "$(id -u)" = 0 ] && chown postgres "$work"

cleanup() { run "'$bin/pg_ctl' -D '$work/data' -m immediate stop >/dev/null 2>&1" || true; rm -rf "$work"; }
trap cleanup EXIT

run "'$bin/initdb' -D '$work/data' -A trust -U postgres >/dev/null"
run "'$bin/pg_ctl' -D '$work/data' -o '-p $port -c listen_addresses= -k $work' -w start >/dev/null"

psql_() { psql -X -q -v ON_ERROR_STOP=1 -h "$work" -p "$port" -U postgres -d postgres "$@"; }
psql_ -f "$here/00_stub_supabase.sql"
for f in "$here"/../migrations/*.sql; do psql_ -f "$f"; done
psql_ -f "$here/10_rls.sql"
