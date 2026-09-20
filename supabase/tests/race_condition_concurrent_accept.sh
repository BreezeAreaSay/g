#!/bin/bash
# Real concurrency test for spec §34: several employees clicking "Я выйду"
# on the same shortage request at (as close to) the same instant, using
# separate OS processes / separate DB connections — not just sequential
# calls in one session, which wouldn't exercise the FOR UPDATE lock at all.
#
# Run this AFTER run.sh has applied migrations + setup_test_env.sql to the
# target database (run.sh does this automatically).
set -e
DB="${TEST_DB:-restaurant_test}"
PSQL_RUN="${PSQL_RUN:-su - postgres -c}" # override e.g. to "psql -U postgres -h localhost -c" if not running as the postgres OS user
TMP_DIR=$(mktemp -d)
trap 'rm -rf "$TMP_DIR"' EXIT

setup_out=$($PSQL_RUN "psql -d $DB -v ON_ERROR_STOP=1 -f -" <<'EOSQL' 2>&1
do $$
declare
  admin_uid uuid := 'a9000000-0000-0000-0000-000000000001';
  v_week_id uuid;
  v_req_id uuid;
  i int;
  uid uuid;
begin
  select id into v_week_id from schedule_weeks where is_active limit 1;
  insert into auth.users (id) values (admin_uid) on conflict do nothing;
  insert into admin_profiles (user_id, display_name) values (admin_uid, 'Race Admin') on conflict do nothing;

  for i in 1..6 loop
    uid := ('a9000000-0000-0000-0000-00000000001' || i)::uuid;
    insert into auth.users (id) values (uid) on conflict do nothing;
  end loop;

  set local role authenticated;
  for i in 1..6 loop
    uid := ('a9000000-0000-0000-0000-00000000001' || i)::uuid;
    perform set_config('request.jwt.claim.sub', uid::text, true);
    perform register_or_relink_employee('Race Emp ' || i, '+7 900 500-00-0' || i, array['waiter']::staff_role[], 'ru');
  end loop;
  reset role;

  set local role authenticated;
  perform set_config('request.jwt.claim.sub', admin_uid::text, true);
  select id into v_req_id from admin_create_shortage_request(2::smallint, 'waiter'::staff_role, '10:00'::time, '14:00'::time, 2::smallint, null);
  reset role;

  raise notice 'REQUEST_ID=%', v_req_id;
end;
$$;
EOSQL
)
echo "$setup_out"
REQUEST_ID=$(echo "$setup_out" | grep -oP 'REQUEST_ID=\K[0-9a-f-]+')
if [ -z "$REQUEST_ID" ]; then
  echo "FAIL: could not capture REQUEST_ID from setup output"
  exit 1
fi
echo "Testing concurrent accepts against request $REQUEST_ID (needed_count=2, 6 employees attempting at once)"

for i in 1 2 3 4 5 6; do
  UID_STR="a9000000-0000-0000-0000-00000000001${i}"
  cat > "$TMP_DIR/call_$i.sql" <<EOSQL
select set_config('request.jwt.claim.sub', '$UID_STR', false);
set role authenticated;
select respond_to_shortage_request('$REQUEST_ID', 'accepted');
EOSQL
  ( $PSQL_RUN "psql -d $DB -v ON_ERROR_STOP=1 -t -A -f -" < "$TMP_DIR/call_$i.sql" > "$TMP_DIR/result_$i.txt" 2>&1 ) &
done
wait

echo "--- individual results ---"
for i in 1 2 3 4 5 6; do
  echo "emp$i: $(tail -1 "$TMP_DIR/result_$i.txt")"
done

echo "--- server-side truth (expect: 2 shifts, 2 led_to_shift responses, status=filled) ---"
$PSQL_RUN "psql -d $DB -v ON_ERROR_STOP=1" <<EOSQL
select 'shifts created for this slot' as check, count(*) as n
  from shifts where day_of_week = 2 and role = 'waiter' and start_time = '10:00' and end_time = '14:00' and source = 'shortage_response';
select 'responses with led_to_shift=true' as check, count(*) as n
  from shortage_responses where request_id = '$REQUEST_ID' and led_to_shift = true;
select 'request status' as check, status from shortage_requests where id = '$REQUEST_ID';
EOSQL
