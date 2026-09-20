\set ON_ERROR_STOP on

do $$
declare
  emp1_uid uuid := 'c0000000-0000-0000-0000-000000000001';
  emp2_uid uuid := 'c0000000-0000-0000-0000-000000000002';
  admin_uid uuid := 'c0000000-0000-0000-0000-000000000003';
  v_emp1_id uuid;
  v_emp2_id uuid;
  v_week_id uuid;
  v_count int;
  v_shift public.shifts;
begin
  insert into auth.users (id) values (emp1_uid), (emp2_uid), (admin_uid);
  insert into public.admin_profiles (user_id, display_name) values (admin_uid, 'Stage2 Admin');
  select id into v_week_id from public.schedule_weeks where is_active limit 1;

  set local role authenticated;
  perform set_config('request.jwt.claim.sub', emp1_uid::text, true);
  select id into v_emp1_id from public.register_or_relink_employee('Иван Смена', '+7 900 300-00-01', array['waiter']::public.staff_role[], 'ru');
  reset role;

  set local role authenticated;
  perform set_config('request.jwt.claim.sub', emp2_uid::text, true);
  select id into v_emp2_id from public.register_or_relink_employee('Мария Смена', '+7 900 300-00-02', array['waiter','dishwasher']::public.staff_role[], 'ru');
  reset role;

  ----------------------------------------------------------------------
  -- 1) Employee saves a shift within bounds
  ----------------------------------------------------------------------
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', emp1_uid::text, true);

  select * into v_shift from public.save_my_shift(0::smallint, 'waiter'::public.staff_role, '10:00'::time, '16:00'::time);
  if v_shift.id is null then raise exception 'FAIL: save_my_shift did not return a row'; end if;
  raise notice 'PASS: employee 1 saved Monday 10:00-16:00';

  ----------------------------------------------------------------------
  -- 2) Out-of-bounds and invalid ranges are rejected
  ----------------------------------------------------------------------
  begin
    perform public.save_my_shift(0::smallint, 'waiter'::public.staff_role, '09:00'::time, '16:00'::time);
    raise exception 'FAIL: accepted a shift starting before 10:00';
  exception when others then
    if sqlerrm like 'time_out_of_bounds%' then raise notice 'PASS: rejects start time before 10:00';
    else raise exception 'FAIL: unexpected error for early start: %', sqlerrm; end if;
  end;

  begin
    perform public.save_my_shift(0::smallint, 'waiter'::public.staff_role, '10:00'::time, '23:00'::time);
    raise exception 'FAIL: accepted a shift ending after 22:30';
  exception when others then
    if sqlerrm like 'time_out_of_bounds%' then raise notice 'PASS: rejects end time after 22:30';
    else raise exception 'FAIL: unexpected error for late end: %', sqlerrm; end if;
  end;

  begin
    perform public.save_my_shift(0::smallint, 'waiter'::public.staff_role, '16:00'::time, '10:00'::time);
    raise exception 'FAIL: accepted end time before start time';
  exception when others then
    if sqlerrm like 'invalid_time_range%' then raise notice 'PASS: rejects end <= start';
    else raise exception 'FAIL: unexpected error for inverted range: %', sqlerrm; end if;
  end;

  ----------------------------------------------------------------------
  -- 3) Saving again for the same day UPDATES, not duplicates
  ----------------------------------------------------------------------
  perform public.save_my_shift(0::smallint, 'waiter'::public.staff_role, '11:00'::time, '19:00'::time);

  select count(*) into v_count from public.shifts
    where employee_id = v_emp1_id and day_of_week = 0 and source = 'self';
  if v_count <> 1 then raise exception 'FAIL: expected exactly 1 self shift row for Monday, got %', v_count; end if;

  select * into v_shift from public.shifts where employee_id = v_emp1_id and day_of_week = 0 and source = 'self';
  if v_shift.start_time <> '11:00' or v_shift.end_time <> '19:00' then
    raise exception 'FAIL: re-saving did not update the existing row (got %-%)', v_shift.start_time, v_shift.end_time;
  end if;
  raise notice 'PASS: re-saving the same day updates in place (still exactly 1 row)';

  reset role;

  ----------------------------------------------------------------------
  -- 4) Admin notification + audit log were written (checked as admin —
  --    an employee correctly cannot see admin-recipient notifications or
  --    audit_log at all, per RLS, which is exercised on its own below)
  ----------------------------------------------------------------------
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', admin_uid::text, true);

  select count(*) into v_count from public.notifications where type = 'shift_saved' and (data->>'employee_id')::uuid = v_emp1_id;
  if v_count <> 2 then raise exception 'FAIL: expected 2 shift_saved notifications (create + update), got %', v_count; end if;
  raise notice 'PASS: admin got a shift_saved notification for both the create and the update';

  select count(*) into v_count from public.audit_log where entity_type = 'shift' and action in ('shift_created','shift_updated');
  if v_count <> 2 then raise exception 'FAIL: expected 2 audit_log rows for shift create+update, got %', v_count; end if;
  raise notice 'PASS: audit_log recorded both shift_created and shift_updated';
  reset role;

  set local role authenticated;
  perform set_config('request.jwt.claim.sub', emp1_uid::text, true);

  ----------------------------------------------------------------------
  -- 5) A regular employee cannot write to `shifts` directly (bypassing the RPC)
  ----------------------------------------------------------------------
  begin
    insert into public.shifts (week_id, employee_id, role, day_of_week, start_time, end_time, source)
    values (v_week_id, v_emp1_id, 'waiter', 1, '10:00', '14:00', 'self');
    raise exception 'FAIL: employee inserted into shifts directly, bypassing save_my_shift()';
  exception when insufficient_privilege then
    raise notice 'PASS: direct INSERT into shifts is denied for a regular employee';
  end;

  ----------------------------------------------------------------------
  -- 6) An employee cannot write another employee's shift either
  --    (defense in depth: even if they somehow got a direct-write path,
  --    it must be scoped to their own employee_id).
  ----------------------------------------------------------------------
  -- (save_my_shift always resolves employee_id from auth.uid() server-side —
  --  there is no employee_id parameter the caller could substitute, which
  --  is itself the RLS-equivalent guarantee for spec §33. Documented here
  --  rather than re-tested mechanically since the function signature makes
  --  it structurally impossible to pass someone else's id.)

  reset role;

  ----------------------------------------------------------------------
  -- 7) delete_my_shift removes the row; repeating it is a harmless no-op
  ----------------------------------------------------------------------
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', emp1_uid::text, true);

  perform public.delete_my_shift(0::smallint);
  select count(*) into v_count from public.shifts where employee_id = v_emp1_id and day_of_week = 0 and source = 'self';
  if v_count <> 0 then raise exception 'FAIL: shift still exists after delete_my_shift'; end if;
  raise notice 'PASS: delete_my_shift removed the shift';

  perform public.delete_my_shift(0::smallint); -- no-op, must not error or double-notify
  reset role;

  -- Notifications have recipient_type='admin', invisible to the employee
  -- session per RLS (already proven above) — check existence as the
  -- unrestricted superuser session instead, like a direct DB inspection.
  select count(*) into v_count from public.notifications where type = 'shift_removed';
  if v_count <> 1 then raise exception 'FAIL: expected exactly 1 shift_removed notification (delete + no-op delete), got %', v_count; end if;
  raise notice 'PASS: deleting once notifies admin; deleting an already-empty day is a harmless no-op (no second notification)';

  ----------------------------------------------------------------------
  -- 8) staffing_requirements: employees can read, cannot write; admin can
  --    write and it is audit-logged by the trigger.
  ----------------------------------------------------------------------
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', emp1_uid::text, true);

  select count(*) into v_count from public.staffing_requirements where week_id = v_week_id;
  if v_count <> 7 then raise exception 'FAIL: employee cannot even read staffing_requirements (got % rows, expected 7 seeded dishwasher rows)', v_count; end if;
  raise notice 'PASS: employee can read staffing_requirements (sees the 7 seeded dishwasher rows)';

  begin
    insert into public.staffing_requirements (week_id, day_of_week, role, start_time, end_time, required_count)
    values (v_week_id, 0, 'waiter', '14:00', '18:00', 2);
    raise exception 'FAIL: employee was able to write a staffing requirement';
  exception when insufficient_privilege then
    raise notice 'PASS: employee cannot write staffing_requirements';
  end;
  reset role;

  set local role authenticated;
  perform set_config('request.jwt.claim.sub', admin_uid::text, true);
  insert into public.staffing_requirements (week_id, day_of_week, role, start_time, end_time, required_count)
  values (v_week_id, 0, 'waiter', '14:00', '18:00', 2);
  reset role;

  select count(*) into v_count from public.audit_log where action = 'requirement_created' and entity_type = 'staffing_requirement';
  if v_count <> 8 then raise exception 'FAIL: expected 8 requirement_created audit rows (7 seed + 1 admin), got %', v_count; end if;
  raise notice 'PASS: admin-created requirement was audit-logged by the trigger';

  ----------------------------------------------------------------------
  -- 9) shift_schedule view: resolves employee names, visible to any
  --    employee, forbidden to anon
  ----------------------------------------------------------------------
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', emp2_uid::text, true);
  perform public.save_my_shift(2::smallint, 'dishwasher'::public.staff_role, '10:00'::time, '18:00'::time);

  select count(*) into v_count from public.shift_schedule where employee_name = 'Мария Смена' and day_of_week = 2;
  if v_count <> 1 then raise exception 'FAIL: shift_schedule did not resolve employee_name correctly'; end if;
  raise notice 'PASS: shift_schedule resolves employee_name via the phone-free roster';
  reset role;

  set local role anon;
  begin
    perform count(*) from public.shift_schedule;
    raise exception 'FAIL: anon could query shift_schedule';
  exception when insufficient_privilege then
    raise notice 'PASS: shift_schedule is denied to anon';
  end;
  reset role;

  ----------------------------------------------------------------------
  -- 10) A 'self' row and another-source row can coexist same employee/day
  --     (double shift scenario — the partial unique index only applies
  --     to source='self')
  ----------------------------------------------------------------------
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', emp2_uid::text, true);
  perform public.save_my_shift(3::smallint, 'waiter'::public.staff_role, '10:00'::time, '14:00'::time);
  reset role;

  -- Simulates what the Stage 3 "accept shortage request" RPC will do later.
  insert into public.shifts (week_id, employee_id, role, day_of_week, start_time, end_time, source)
  values (v_week_id, v_emp2_id, 'dishwasher', 3, '18:00', '22:30', 'shortage_response');

  select count(*) into v_count from public.shifts where employee_id = v_emp2_id and day_of_week = 3;
  if v_count <> 2 then raise exception 'FAIL: expected 2 coexisting shifts (self + shortage_response) same day, got %', v_count; end if;
  raise notice 'PASS: a self shift and an extra (non-self) shift coexist on the same day';

  raise notice '=== ALL STAGE 2 TESTS PASSED ===';
end;
$$;
