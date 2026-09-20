\set ON_ERROR_STOP on

do $$
declare
  admin_uid uuid := 'e9000000-0000-0000-0000-000000000001';
  emp1_uid uuid := 'e9000000-0000-0000-0000-000000000011';
  emp2_uid uuid := 'e9000000-0000-0000-0000-000000000012';
  v_emp1_id uuid;
  v_emp2_id uuid;
  v_test_today_dow smallint := 2;
  v_test_week_id uuid;
  v_shift_today uuid;
  v_shift_wrong_day uuid;
  v_att public.attendance;
  v_count int;
  v_shift public.shifts;
  v_conflict_id uuid;
  v_today date;
begin
  insert into auth.users (id) values (admin_uid), (emp1_uid), (emp2_uid);
  insert into admin_profiles (user_id, display_name) values (admin_uid, 'Stage5 Admin');

  -- A dedicated test week whose date range actually includes "today",
  -- independent of whatever the seeded active week's real calendar dates
  -- are (this test must pass regardless of what day it's run on). "Today"
  -- must be computed in the week's own timezone (Europe/Moscow), the same
  -- way clock_in()/clock_out() compute it (see 0020_attendance_rpcs.sql) —
  -- using the session's plain current_date here would go wrong for part of
  -- every day, whenever UTC and Moscow (UTC+3) currently disagree about
  -- what today's date is.
  v_today := (now() at time zone 'Europe/Moscow')::date;
  insert into schedule_weeks (start_date, end_date, timezone, is_active)
  values (v_today - v_test_today_dow, v_today - v_test_today_dow + 6, 'Europe/Moscow', false)
  returning id into v_test_week_id;

  set local role authenticated;
  perform set_config('request.jwt.claim.sub', emp1_uid::text, true);
  select id into v_emp1_id from register_or_relink_employee('Stage5 Emp1', '+7 900 700-00-01', array['waiter']::staff_role[], 'ru');
  reset role;
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', emp2_uid::text, true);
  select id into v_emp2_id from register_or_relink_employee('Stage5 Emp2', '+7 900 700-00-02', array['dishwasher']::staff_role[], 'ru');
  reset role;

  insert into shifts (week_id, employee_id, role, day_of_week, start_time, end_time, source)
  values (v_test_week_id, v_emp1_id, 'waiter', v_test_today_dow, '10:00', '18:00', 'self')
  returning id into v_shift_today;

  insert into shifts (week_id, employee_id, role, day_of_week, start_time, end_time, source)
  values (v_test_week_id, v_emp1_id, 'waiter', (v_test_today_dow + 1) % 7, '10:00', '18:00', 'admin')
  returning id into v_shift_wrong_day;

  ----------------------------------------------------------------------
  -- 1) Clock in on the right day succeeds and records the real moment
  ----------------------------------------------------------------------
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', emp1_uid::text, true);
  select * into v_att from clock_in(v_shift_today);
  if v_att.clock_in_at is null then raise exception 'FAIL: clock_in did not record a time'; end if;
  raise notice 'PASS: clock_in on the scheduled day succeeds and records the exact time';

  ----------------------------------------------------------------------
  -- 2) Clock in on the wrong day is rejected
  ----------------------------------------------------------------------
  begin
    perform clock_in(v_shift_wrong_day);
    raise exception 'FAIL: clock_in succeeded for a shift not scheduled today';
  exception when others then
    if sqlerrm like 'not_shift_day%' then raise notice 'PASS: clock_in rejects a shift not scheduled for today';
    else raise exception 'FAIL: unexpected error: %', sqlerrm; end if;
  end;

  ----------------------------------------------------------------------
  -- 3) A repeat clock_in is idempotent — does not overwrite the time or re-notify
  ----------------------------------------------------------------------
  perform pg_sleep(0.05);
  declare
    v_att2 public.attendance;
  begin
    select * into v_att2 from clock_in(v_shift_today);
    if v_att2.clock_in_at <> v_att.clock_in_at then
      raise exception 'FAIL: a repeat clock_in changed the recorded time';
    end if;
  end;
  reset role;

  set local role authenticated;
  perform set_config('request.jwt.claim.sub', admin_uid::text, true);
  select count(*) into v_count from notifications where type = 'attendance_clock_in';
  if v_count <> 1 then raise exception 'FAIL: expected exactly 1 clock_in notification despite 2 taps, got %', v_count; end if;
  reset role;
  raise notice 'PASS: repeat clock_in taps are silent no-ops (one real event, one notification)';

  ----------------------------------------------------------------------
  -- 4) Cannot clock out before clocking in
  ----------------------------------------------------------------------
  -- Employees have no direct INSERT grant on `shifts` at all (Stage 2);
  -- seed this row as the unrestricted session, exactly like the Stage 2
  -- test's "double shift" simulation.
  insert into shifts (week_id, employee_id, role, day_of_week, start_time, end_time, source)
  values (v_test_week_id, v_emp2_id, 'dishwasher', v_test_today_dow, '10:00', '18:00', 'admin')
  returning id into v_shift;

  set local role authenticated;
  perform set_config('request.jwt.claim.sub', emp2_uid::text, true);
  begin
    perform clock_out(v_shift.id);
    raise exception 'FAIL: clocked out without clocking in first';
  exception when others then
    if sqlerrm like 'not_clocked_in%' then raise notice 'PASS: cannot clock out before clocking in';
    else raise exception 'FAIL: unexpected error: %', sqlerrm; end if;
  end;
  reset role;

  ----------------------------------------------------------------------
  -- 5) Clock out records the real time; a repeat tap is a no-op
  ----------------------------------------------------------------------
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', emp1_uid::text, true);
  select * into v_att from clock_out(v_shift_today);
  if v_att.clock_out_at is null then raise exception 'FAIL: clock_out did not record a time'; end if;
  declare
    v_att3 public.attendance;
  begin
    perform pg_sleep(0.05);
    select * into v_att3 from clock_out(v_shift_today);
    if v_att3.clock_out_at <> v_att.clock_out_at then raise exception 'FAIL: repeat clock_out changed the time'; end if;
  end;
  reset role;
  raise notice 'PASS: clock_out records the moment and is idempotent on repeat taps';

  ----------------------------------------------------------------------
  -- 6) Admin can manually correct attendance; it's audit-logged
  ----------------------------------------------------------------------
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', admin_uid::text, true);
  perform admin_correct_attendance(
    (select id from attendance where shift_id = v_shift_today),
    (v_att.clock_out_at - interval '8 hours'), v_att.clock_out_at
  );
  reset role;

  select count(*) into v_count from audit_log where action = 'attendance_corrected';
  if v_count <> 1 then raise exception 'FAIL: attendance correction was not audit-logged'; end if;
  raise notice 'PASS: admin attendance correction is audit-logged';

  -- A regular employee cannot correct attendance.
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', emp1_uid::text, true);
  begin
    perform admin_correct_attendance((select id from attendance where shift_id = v_shift_today), now(), now());
    raise exception 'FAIL: a regular employee corrected attendance';
  exception when others then
    if sqlerrm like 'not_admin%' then raise notice 'PASS: only admin can correct attendance';
    else raise exception 'FAIL: unexpected error: %', sqlerrm; end if;
  end;
  reset role;

  ----------------------------------------------------------------------
  -- 7) admin_update_shift notifies the employee with old + new times
  ----------------------------------------------------------------------
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', admin_uid::text, true);
  perform admin_update_shift(v_shift_today, '10:00'::time, '16:00'::time, null);
  reset role;

  set local role authenticated;
  perform set_config('request.jwt.claim.sub', emp1_uid::text, true);
  select count(*) into v_count from notifications
    where type = 'shift_changed_by_admin' and recipient_type = 'employee'
      and (data->>'old_end_time')::text like '18:00%' and (data->>'new_end_time')::text like '16:00%';
  if v_count <> 1 then raise exception 'FAIL: employee did not get a shift_changed_by_admin notification with old/new times'; end if;
  reset role;
  raise notice 'PASS: admin_update_shift notifies the employee with both the old and new time';

  ----------------------------------------------------------------------
  -- 8) Overlap conflict detection
  ----------------------------------------------------------------------
  -- emp2 already has 10:00-18:00 dishwasher on v_test_today_dow (v_shift);
  -- an overlapping second shift should be flagged (seeded the same way
  -- the real respond_to_shortage_request() RPC would, as an unrestricted
  -- security-definer write, not a direct employee insert).
  insert into shifts (week_id, employee_id, role, day_of_week, start_time, end_time, source)
  values (v_test_week_id, v_emp2_id, 'waiter', v_test_today_dow, '16:00', '20:00', 'shortage_response');

  select count(*) into v_count from schedule_conflicts where employee_id = v_emp2_id and day_of_week = v_test_today_dow;
  if v_count <> 1 then raise exception 'FAIL: expected 1 conflict record for overlapping shifts, got %', v_count; end if;
  select id into v_conflict_id from schedule_conflicts where employee_id = v_emp2_id and day_of_week = v_test_today_dow;
  raise notice 'PASS: an overlapping second shift for the same employee/day is flagged as a conflict';

  set local role authenticated;
  perform set_config('request.jwt.claim.sub', admin_uid::text, true);
  select count(*) into v_count from notifications where type = 'conflict_detected';
  if v_count <> 1 then raise exception 'FAIL: admin was not notified of the conflict'; end if;

  perform admin_confirm_conflict(v_conflict_id);
  reset role;
  if (select status from schedule_conflicts where id = v_conflict_id) <> 'confirmed' then
    raise exception 'FAIL: admin_confirm_conflict did not mark it confirmed';
  end if;
  raise notice 'PASS: admin can confirm a conflict; admin was notified when it was first detected';

  -- Non-overlapping shifts must NOT be flagged.
  insert into shifts (week_id, employee_id, role, day_of_week, start_time, end_time, source)
  values (v_test_week_id, v_emp1_id, 'waiter', (v_test_today_dow + 2) % 7, '10:00', '14:00', 'admin');
  insert into shifts (week_id, employee_id, role, day_of_week, start_time, end_time, source)
  values (v_test_week_id, v_emp1_id, 'waiter', (v_test_today_dow + 2) % 7, '14:00', '18:00', 'admin');
  select count(*) into v_count from schedule_conflicts where employee_id = v_emp1_id and day_of_week = (v_test_today_dow + 2) % 7;
  if v_count <> 0 then raise exception 'FAIL: back-to-back (non-overlapping) shifts were incorrectly flagged as a conflict'; end if;
  raise notice 'PASS: back-to-back shifts that only touch at the boundary are not flagged as overlapping';

  raise notice '=== ALL STAGE 5 ATTENDANCE + ADMIN EDITING + CONFLICT TESTS PASSED ===';
end;
$$;
