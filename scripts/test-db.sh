#!/usr/bin/env bash
# Spins up a throwaway local PostgreSQL, applies a Supabase stub + all migrations, and runs the SQL test suite.
# Requires PostgreSQL 14+ binaries (initdb, pg_ctl, psql). Does not touch any real database.
set -euo pipefail
cd "$(dirname "$0")/.."

PGBIN="${PGBIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)}"
[ -x "$PGBIN/initdb" ] || { echo "PostgreSQL binaries not found. Set PGBIN=/path/to/bin"; exit 2; }

DATA="$(mktemp -d)"; PORT="${PGPORT_TEST:-54329}"
RUNAS=""
if [ "$(id -u)" = "0" ]; then   # postgres refuses to run as root
  chown "$(id -u postgres)" "$DATA"; chmod 755 "$(pwd)" ; RUNAS="su postgres -c"
fi
run() { if [ -n "$RUNAS" ]; then $RUNAS "$*"; else bash -c "$*"; fi; }

cleanup() { run "$PGBIN/pg_ctl -D $DATA stop -m immediate" >/dev/null 2>&1 || true; rm -rf "$DATA"; }
trap cleanup EXIT

run "$PGBIN/initdb -D $DATA -A trust -U postgres" >/dev/null
run "$PGBIN/pg_ctl -D $DATA -o '-p $PORT -k /tmp -c listen_addresses=' -w start" >/dev/null
PSQL="$PGBIN/psql -h /tmp -p $PORT -U postgres -v ON_ERROR_STOP=1 -q -X"

run "$PSQL -d postgres -c 'create database app'"
APP="$PSQL -d app"
run "$APP -f tests/db/00_supabase_stub.sql"
for f in supabase/migrations/*.sql; do echo "applying $f"; run "$APP -f $f"; done
for f in tests/db/1*.sql tests/db/2*.sql tests/db/30_race_setup.sql; do echo "running $f"; run "$APP -f $f"; done

# ---------- The single-file setup (what users paste into the SQL Editor) must work on a FRESH database ----------
echo "verifying supabase/setup_all.sql on a fresh database"
run "$PSQL -d postgres -c 'create database app_bundle'"
run "$PSQL -d app_bundle -f tests/db/00_supabase_stub.sql"
run "$PSQL -d app_bundle -f supabase/setup_all.sql"
run "$PSQL -d app_bundle -At -c \"select count(*) from pg_tables where schemaname='public' and not rowsecurity\"" | grep -qx 0 || { echo "FAIL: setup_all.sql left a table without RLS"; exit 1; }

# ---------- True concurrency tests (separate sessions, committed data) ----------
echo "running concurrency tests (8 simultaneous reservations, 6 simultaneous payment submissions)"
WORK="$(mktemp -d)"; chmod 777 "$WORK"
TARGET="$(date -u -d '+3 seconds' '+%Y-%m-%d %H:%M:%S+00')"
REQA="$(run "$APP -At -c \"select v from race.ctx where k='reqA'\"")"
REQB="$(run "$APP -At -c \"select v from race.ctx where k='reqB'\"")"
RESB="$(run "$APP -At -c \"select v from race.ctx where k='resB'\"")"
for i in 1 2 3 4 5 6 7 8; do
  UID_="00000000-0000-0000-0000-0000000000$(printf '%02d' $i)"
  cat > "$WORK/a$i.sql" <<SQL
set role authenticated;
select set_config('request.jwt.claims', '{"sub":"$UID_","role":"authenticated","aal":"aal1"}', false);
do \$\$ begin perform pg_sleep(greatest(0, extract(epoch from ('$TARGET'::timestamptz - clock_timestamp())))); end \$\$;
select 'RESERVED' from (select public.reserve_request('$REQA')) t;
SQL
  chmod 644 "$WORK/a$i.sql"
done
for i in 1 2 3 4 5 6; do
  cat > "$WORK/b$i.sql" <<SQL
set role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated","aal":"aal1"}', false);
do \$\$ begin perform pg_sleep(greatest(0, extract(epoch from ('$TARGET'::timestamptz - clock_timestamp())))); end \$\$;
select 'PAID' from (select public.submit_payment('$RESB', 1000, 'easypaisa', 'RACE-TX-$i', now(), (select id from public.documents where storage_path='race/r$i.jpg'))) t;
SQL
  chmod 644 "$WORK/b$i.sql"
done
for i in 1 2 3 4 5 6 7 8; do ( run "$PSQL -d app -At -f $WORK/a$i.sql" > "$WORK/a$i.out" 2>&1 || true ) & done
for i in 1 2 3 4 5 6; do ( run "$PSQL -d app -At -f $WORK/b$i.sql" > "$WORK/b$i.out" 2>&1 || true ) & done
wait
WON="$(cat $WORK/a*.out | grep -c '^RESERVED' || true)"
PAID="$(cat $WORK/b*.out | grep -c '^PAID' || true)"
ACTIVE="$(run "$APP -At -c \"select count(*) from public.reservations where request_id='$REQA' and status='active'\"")"
PAYROWS="$(run "$APP -At -c \"select count(*) from public.payments where request_id='$REQB'\"")"
echo "  reservation race: $WON winner(s) of 8, active reservations in DB: $ACTIVE"
echo "  payment race:     $PAID accepted of 6, payment rows in DB: $PAYROWS"
echo "  sample loser errors: $(cat $WORK/a*.out | grep -i 'error' | sed 's/.*ERROR: *//' | sort | uniq -c | tr '\n' ';')"
[ "$WON" = "1" ] && [ "$ACTIVE" = "1" ] || { echo "FAIL: expected exactly 1 reservation winner"; exit 1; }
[ "$PAID" = "1" ] && [ "$PAYROWS" = "1" ] || { echo "FAIL: expected exactly 1 accepted payment"; exit 1; }
rm -rf "$WORK"
echo "DB TESTS PASSED"
