\set ON_ERROR_STOP on

do $$
declare
  admin_uid uuid := 'f6000000-0000-0000-0000-000000000001';
  emp_uid uuid := 'f6000000-0000-0000-0000-000000000002';
  v_emp_id uuid;
  v_week_id uuid;
  v_shift_id uuid;
  v_att_id uuid;
begin
  insert into auth.users (id) values (admin_uid), (emp_uid);
  insert into admin_profiles (user_id, display_name) values (admin_uid, 'A');
  select id into v_week_id from schedule_weeks where is_active limit 1;

  set local role authenticated;
  perform set_config('request.jwt.claim.sub', emp_uid::text, true);
  select id into v_emp_id from register_or_relink_employee('Att Test', '+7 900 800-00-01', array['waiter']::staff_role[], 'ru');
  perform save_my_shift(0::smallint, 'waiter'::staff_role, '10:00'::time, '18:00'::time);
  reset role;

  select id into v_shift_id from shifts where employee_id = v_emp_id and day_of_week = 0 and source = 'self';

  -- The admin UI's "no attendance row yet" path: a direct client insert
  -- (not through an RPC) — this exercises the RLS policy directly.
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', admin_uid::text, true);
  insert into attendance (shift_id) values (v_shift_id) returning id into v_att_id;
  if v_att_id is null then raise exception 'FAIL: admin direct insert into attendance did not return an id'; end if;
  reset role;
  raise notice 'PASS: admin can directly insert an attendance row (RLS admin_write policy) for the "forgot to tap in" correction flow';

  -- And a regular employee cannot do the same for someone else's shift.
  declare
    v_other_uid uuid := 'f6000000-0000-0000-0000-000000000003';
    v_other_emp_id uuid;
  begin
    insert into auth.users (id) values (v_other_uid);
    set local role authenticated;
    perform set_config('request.jwt.claim.sub', v_other_uid::text, true);
    perform register_or_relink_employee('Other', '+7 900 800-00-02', array['waiter']::staff_role[], 'ru');
    begin
      insert into attendance (shift_id) values (v_shift_id);
      raise exception 'FAIL: a different employee inserted an attendance row for someone else''s shift';
    exception when insufficient_privilege then
      raise notice 'PASS: a regular employee cannot insert attendance for another employee''s shift';
    end;
    reset role;
  end;

  raise notice '=== ALL STAGE 6 ATTENDANCE-INSERT RLS TESTS PASSED ===';
end;
$$;
