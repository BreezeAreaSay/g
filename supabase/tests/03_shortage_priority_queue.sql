\set ON_ERROR_STOP on

do $$
declare
  admin_uid uuid := 'f0000000-0000-0000-0000-000000000001';
  emp_uids uuid[] := array[
    'f0000000-0000-0000-0000-000000000011', 'f0000000-0000-0000-0000-000000000012',
    'f0000000-0000-0000-0000-000000000013', 'f0000000-0000-0000-0000-000000000014'
  ];
  emp_ids uuid[] := array[]::uuid[];
  v_week_id uuid;
  v_count int;
  v_req_id uuid;
  v_record public.shortage_records%rowtype;
  v_waiter_req_id uuid;
  v_dw_req_id uuid;
  v_dw_req2_id uuid;
  v_blocker_req_id uuid;
  v_status text;
  v_response jsonb;
  i int;
begin
  select id into v_week_id from schedule_weeks where is_active limit 1;

  insert into auth.users (id) values (admin_uid);
  insert into admin_profiles (user_id, display_name) values (admin_uid, 'Stage3 Admin');

  foreach i in array array[1,2,3,4] loop
    insert into auth.users (id) values (emp_uids[i]);
  end loop;

  set local role authenticated;
  for i in 1..4 loop
    perform set_config('request.jwt.claim.sub', emp_uids[i]::text, true);
    emp_ids := emp_ids || (select id from register_or_relink_employee(
      'Stage3 Emp ' || i, '+7 900 400-00-0' || i, array['waiter','dishwasher']::staff_role[], 'ru'
    ));
  end loop;
  reset role;

  ----------------------------------------------------------------------
  -- 1) Auto-detection: a requirement with nobody scheduled -> shortage_records
  ----------------------------------------------------------------------
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', admin_uid::text, true);
  insert into staffing_requirements (week_id, day_of_week, role, start_time, end_time, required_count)
  values (v_week_id, 4, 'waiter', '14:00', '18:00', 2)
  returning id into v_req_id;
  reset role;

  select * into v_record from shortage_records where requirement_id = v_req_id;
  if v_record.id is null or v_record.status <> 'detected' then
    raise exception 'FAIL: shortage was not auto-detected for an empty requirement';
  end if;
  raise notice 'PASS: shortage auto-detected the instant a requirement has nobody scheduled';

  select count(*) into v_count from notifications where type = 'shortage_detected' and (data->>'shortage_record_id')::uuid = v_record.id;
  if v_count <> 1 then raise exception 'FAIL: expected 1 shortage_detected admin notification, got %', v_count; end if;
  raise notice 'PASS: admin notified immediately on detection';

  ----------------------------------------------------------------------
  -- 2) Resolution: covering shifts make it disappear
  ----------------------------------------------------------------------
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', emp_uids[1]::text, true);
  perform save_my_shift(4::smallint, 'waiter'::staff_role, '14:00'::time, '18:00'::time);
  reset role;
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', emp_uids[2]::text, true);
  perform save_my_shift(4::smallint, 'waiter'::staff_role, '14:00'::time, '18:00'::time);
  reset role;

  select status into v_status from shortage_records where requirement_id = v_req_id;
  if v_status <> 'resolved' then raise exception 'FAIL: shortage did not auto-resolve once fully staffed (status=%)', v_status; end if;
  raise notice 'PASS: shortage auto-resolves once coverage is fully staffed';

  ----------------------------------------------------------------------
  -- 3) Re-detection: someone leaves again -> re-flags as a fresh detection
  ----------------------------------------------------------------------
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', emp_uids[1]::text, true);
  perform delete_my_shift(4::smallint);
  reset role;

  select status into v_status from shortage_records where requirement_id = v_req_id;
  if v_status <> 'detected' then raise exception 'FAIL: shortage did not re-detect after being resolved (status=%)', v_status; end if;
  select count(*) into v_count from notifications where type = 'shortage_detected' and (data->>'shortage_record_id')::uuid = (select id from shortage_records where requirement_id = v_req_id);
  if v_count <> 2 then raise exception 'FAIL: expected 2 shortage_detected notifications total (initial + re-detect), got %', v_count; end if;
  raise notice 'PASS: re-detects and re-notifies after a resolved shortage breaks again';

  ----------------------------------------------------------------------
  -- 4) Skip: must not re-notify even as the situation gets worse
  ----------------------------------------------------------------------
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', admin_uid::text, true);
  perform admin_skip_shortage((select id from shortage_records where requirement_id = v_req_id));
  reset role;

  select status into v_status from shortage_records where requirement_id = v_req_id;
  if v_status <> 'skipped' then raise exception 'FAIL: admin_skip_shortage did not set status to skipped'; end if;

  set local role authenticated;
  perform set_config('request.jwt.claim.sub', emp_uids[2]::text, true);
  perform delete_my_shift(4::smallint); -- makes the deficit worse (0 scheduled instead of 1)
  reset role;

  select status into v_status from shortage_records where requirement_id = v_req_id;
  if v_status <> 'skipped' then raise exception 'FAIL: a skipped shortage changed status on its own (got %)', v_status; end if;
  select count(*) into v_count from notifications where type = 'shortage_detected' and (data->>'shortage_record_id')::uuid = (select id from shortage_records where requirement_id = v_req_id);
  if v_count <> 2 then raise exception 'FAIL: a skipped shortage sent another notification (spec §11 violation)'; end if;
  raise notice 'PASS: a skipped shortage never re-notifies, even as coverage gets worse';

  ----------------------------------------------------------------------
  -- 5) Simultaneous waiter + dishwasher shortages both get their own records
  ----------------------------------------------------------------------
  declare
    v_waiter_req_5 uuid;
    v_dw_req_5 uuid;
  begin
    set local role authenticated;
    perform set_config('request.jwt.claim.sub', admin_uid::text, true);
    insert into staffing_requirements (week_id, day_of_week, role, start_time, end_time, required_count)
    values (v_week_id, 5, 'waiter', '14:00', '18:00', 1) returning id into v_waiter_req_5;
    insert into staffing_requirements (week_id, day_of_week, role, start_time, end_time, required_count)
    values (v_week_id, 5, 'dishwasher', '14:00', '18:00', 1) returning id into v_dw_req_5;
    reset role;

    select count(*) into v_count from shortage_records
      where requirement_id in (v_waiter_req_5, v_dw_req_5) and status = 'detected';
    if v_count <> 2 then raise exception 'FAIL: expected 2 independent shortage records (waiter+dishwasher) for day 5, got %', v_count; end if;
    raise notice 'PASS: simultaneous waiter and dishwasher shortages are both detected independently';
  end;

  ----------------------------------------------------------------------
  -- 6) Priority queue: dishwasher jumps ahead of an earlier-queued waiter
  --    request, but never preempts something already OPEN (spec §13).
  ----------------------------------------------------------------------
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', admin_uid::text, true);

  -- Blocker occupies the one "open" slot so the next two both start queued.
  select id into v_blocker_req_id from admin_create_shortage_request(0::smallint, 'waiter'::staff_role, '10:00'::time, '14:00'::time, 1::smallint, null);
  select status into v_status from shortage_requests where id = v_blocker_req_id;
  if v_status <> 'open' then raise exception 'FAIL: the first request created should open immediately (got %)', v_status; end if;

  select id into v_waiter_req_id from admin_create_shortage_request(6::smallint, 'waiter'::staff_role, '10:00'::time, '14:00'::time, 1::smallint, null);
  select id into v_dw_req_id from admin_create_shortage_request(6::smallint, 'dishwasher'::staff_role, '10:00'::time, '14:00'::time, 1::smallint, null);
  select id into v_dw_req2_id from admin_create_shortage_request(6::smallint, 'dishwasher'::staff_role, '14:00'::time, '18:00'::time, 1::smallint, null);

  select status into v_status from shortage_requests where id = v_waiter_req_id;
  if v_status <> 'queued' then raise exception 'FAIL: waiter request should stay queued while the blocker is open (got %)', v_status; end if;
  select status into v_status from shortage_requests where id = v_dw_req_id;
  if v_status <> 'queued' then raise exception 'FAIL: dishwasher request should stay queued while the blocker is open (got %)', v_status; end if;
  raise notice 'PASS: new requests queue behind an already-open one, regardless of role';
  reset role;

  -- Close the blocker (employee 1 accepts it).
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', emp_uids[1]::text, true);
  v_response := respond_to_shortage_request(v_blocker_req_id, 'accepted');
  reset role;
  if v_response->>'status' <> 'accepted' then raise exception 'FAIL: blocker accept failed: %', v_response; end if;

  select status into v_status from shortage_requests where id = v_dw_req_id;
  if v_status <> 'open' then raise exception 'FAIL: dishwasher request should now be open (got %)', v_status; end if;
  select status into v_status from shortage_requests where id = v_waiter_req_id;
  if v_status <> 'queued' then raise exception 'FAIL: waiter request must still wait — dishwasher has priority (got %)', v_status; end if;
  select status into v_status from shortage_requests where id = v_dw_req2_id;
  if v_status <> 'queued' then raise exception 'FAIL: the second (later) dishwasher request must still wait behind the first one (got %)', v_status; end if;
  raise notice 'PASS: dishwasher dispatches before an earlier-queued waiter request (spec §13 priority)';

  -- Close the first dishwasher request -> the SECOND dishwasher request
  -- (created later, but same role) must come next, still ahead of waiter.
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', emp_uids[2]::text, true);
  perform respond_to_shortage_request(v_dw_req_id, 'accepted');
  reset role;

  select status into v_status from shortage_requests where id = v_dw_req2_id;
  if v_status <> 'open' then raise exception 'FAIL: the second dishwasher request should dispatch next (got %)', v_status; end if;
  select status into v_status from shortage_requests where id = v_waiter_req_id;
  if v_status <> 'queued' then raise exception 'FAIL: waiter must still wait behind the second dishwasher request (got %)', v_status; end if;
  raise notice 'PASS: among same-priority requests, the chronologically earlier one dispatches first (spec §13)';

  -- Close the second dishwasher request -> only now does the waiter request open.
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', emp_uids[3]::text, true);
  perform respond_to_shortage_request(v_dw_req2_id, 'accepted');
  reset role;

  select status into v_status from shortage_requests where id = v_waiter_req_id;
  if v_status <> 'open' then raise exception 'FAIL: waiter request should finally open once all dishwasher requests are closed (got %)', v_status; end if;
  raise notice 'PASS: waiter request opens only after every dishwasher request ahead of it has closed';

  -- Close it out so the queue is empty again before the next scenarios.
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', emp_uids[4]::text, true);
  perform respond_to_shortage_request(v_waiter_req_id, 'accepted');
  reset role;

  ----------------------------------------------------------------------
  -- 7) Accept flow details: shift created with the right source/time/role
  ----------------------------------------------------------------------
  if not exists (
    select 1 from shifts where employee_id = emp_ids[1] and day_of_week = 0 and role = 'waiter'
      and start_time = '10:00' and end_time = '14:00' and source = 'shortage_response'
  ) then
    raise exception 'FAIL: accepting a shortage request did not create the expected shift';
  end if;
  raise notice 'PASS: accepting creates a shift with source=shortage_response and the request''s exact time range';

  set local role authenticated;
  perform set_config('request.jwt.claim.sub', admin_uid::text, true);
  select count(*) into v_count from notifications where type = 'shortage_accepted' and (data->>'request_id')::uuid = v_blocker_req_id;
  if v_count <> 1 then raise exception 'FAIL: admin was not notified of the acceptance'; end if;
  reset role;
  raise notice 'PASS: admin is notified when an employee accepts';

  ----------------------------------------------------------------------
  -- 8) Decline is recorded without creating a shift or closing the request
  ----------------------------------------------------------------------
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', admin_uid::text, true);
  select id into v_req_id from admin_create_shortage_request(1::smallint, 'waiter'::staff_role, '10:00'::time, '14:00'::time, 2::smallint, null);
  reset role;

  set local role authenticated;
  perform set_config('request.jwt.claim.sub', emp_uids[1]::text, true);
  v_response := respond_to_shortage_request(v_req_id, 'declined');
  reset role;
  if v_response->>'status' <> 'declined' then raise exception 'FAIL: decline response was %', v_response; end if;

  select status into v_status from shortage_requests where id = v_req_id;
  if v_status <> 'open' then raise exception 'FAIL: one decline out of several employees must not close the request (got %)', v_status; end if;
  if exists (select 1 from shifts where employee_id = emp_ids[1] and day_of_week = 1 and source = 'shortage_response') then
    raise exception 'FAIL: a decline must never create a shift';
  end if;
  raise notice 'PASS: a decline is recorded but does not close the request or create a shift';

  ----------------------------------------------------------------------
  -- 9) All active employees decline -> request closes as all_declined,
  --    admin is notified, and the next queued request (if any) dispatches.
  --    Loops over WHATEVER employees are currently active (this test file
  --    may run standalone or chained after Stage 1/2's own test data, so
  --    "all 4 of my employees" would be wrong when others already exist)
  --    rather than assuming it's only the 4 created earlier in this file.
  ----------------------------------------------------------------------
  declare
    v_other_auth_id uuid;
  begin
    for v_other_auth_id in
      select auth_user_id from employees where is_active and auth_user_id is not null and auth_user_id <> emp_uids[1]
    loop
      set local role authenticated;
      perform set_config('request.jwt.claim.sub', v_other_auth_id::text, true);
      v_response := respond_to_shortage_request(v_req_id, 'declined');
      reset role;
    end loop;
  end;

  select status, closed_reason into v_status, v_status from shortage_requests where id = v_req_id;
  if v_status <> 'all_declined' then raise exception 'FAIL: expected status all_declined once every employee declined, got %', v_status; end if;

  set local role authenticated;
  perform set_config('request.jwt.claim.sub', admin_uid::text, true);
  select count(*) into v_count from notifications where type = 'shortage_all_declined' and (data->>'request_id')::uuid = v_req_id;
  if v_count <> 1 then raise exception 'FAIL: admin was not notified that everyone declined'; end if;
  reset role;
  raise notice 'PASS: once every active employee has declined, the request closes as all_declined and admin is notified';

  raise notice '=== ALL STAGE 3 DETECTION + PRIORITY + RESPONSE TESTS PASSED ===';
end;
$$;
