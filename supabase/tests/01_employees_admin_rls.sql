-- Behavioral test of Stage 1 RLS + RPC logic against the real (stubbed) auth model.
\set ON_ERROR_STOP on

do $$
declare
  emp1_uid uuid := 'a0000000-0000-0000-0000-000000000001';
  emp1_new_uid uuid := 'a0000000-0000-0000-0000-000000000009';
  emp2_uid uuid := 'a0000000-0000-0000-0000-000000000002';
  admin_uid uuid := 'a0000000-0000-0000-0000-000000000003';
  anon_probe_uid uuid := 'a0000000-0000-0000-0000-000000000099';
  v_count int;
  v_bool boolean;
  v_emp1_id uuid;
  v_emp2_id uuid;
begin
  insert into auth.users (id) values (emp1_uid), (emp2_uid), (admin_uid);

  ----------------------------------------------------------------------
  -- 1) Employee self-registration
  ----------------------------------------------------------------------
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', emp1_uid::text, true);
  select id into v_emp1_id from public.register_or_relink_employee('Иван', '+7 900 111-11-11', array['waiter']::public.staff_role[], 'ru');
  if v_emp1_id is null then raise exception 'FAIL: employee 1 registration returned no id'; end if;
  raise notice 'PASS: employee 1 registered (id=%)', v_emp1_id;

  perform set_config('request.jwt.claim.sub', emp2_uid::text, true);
  select id into v_emp2_id from public.register_or_relink_employee('Мария', '+7 900 222-22-22', array['dishwasher','waiter']::public.staff_role[], 'en');
  raise notice 'PASS: employee 2 registered (id=%)', v_emp2_id;

  reset role;

  ----------------------------------------------------------------------
  -- 2) An employee can only see their OWN row in `employees` (phone included)
  ----------------------------------------------------------------------
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', emp1_uid::text, true);

  select count(*) into v_count from public.employees;
  if v_count <> 1 then raise exception 'FAIL: employee 1 sees % rows in employees, expected 1', v_count; end if;
  raise notice 'PASS: employee 1 sees exactly their own row via employees table';

  select count(*) into v_count from public.employees where id = v_emp2_id;
  if v_count <> 0 then raise exception 'FAIL: employee 1 could read employee 2''s row (phone leak risk)'; end if;
  raise notice 'PASS: employee 1 cannot read employee 2''s row (phone protected)';

  ----------------------------------------------------------------------
  -- 3) Everyone can see the phone-free roster (name + roles) for everyone
  ----------------------------------------------------------------------
  select count(*) into v_count from public.employee_roster;
  if v_count <> 2 then raise exception 'FAIL: employee_roster shows % rows, expected 2', v_count; end if;
  raise notice 'PASS: employee_roster shows all % employees to a regular employee', v_count;

  reset role;

  ----------------------------------------------------------------------
  -- 4) Bootstrap an admin (the one manual step real setup also requires)
  ----------------------------------------------------------------------
  insert into public.admin_profiles (user_id, display_name) values (admin_uid, 'Test Admin');

  set local role authenticated;
  perform set_config('request.jwt.claim.sub', admin_uid::text, true);

  select public.is_admin() into v_bool;
  if not v_bool then raise exception 'FAIL: admin user is_admin() returned false'; end if;
  raise notice 'PASS: is_admin() true for admin user';

  select count(*) into v_count from public.employees;
  if v_count <> 2 then raise exception 'FAIL: admin sees % employees, expected 2', v_count; end if;
  raise notice 'PASS: admin sees all employees (including phones)';

  select count(*) into v_count from public.employees where phone is not null;
  if v_count <> 2 then raise exception 'FAIL: admin cannot read phone numbers'; end if;
  raise notice 'PASS: admin can read phone numbers';

  reset role;

  ----------------------------------------------------------------------
  -- 5) A regular employee is NOT an admin
  ----------------------------------------------------------------------
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', emp1_uid::text, true);
  select public.is_admin() into v_bool;
  if v_bool then raise exception 'FAIL: employee 1 incorrectly resolved as admin'; end if;
  raise notice 'PASS: is_admin() false for a regular employee';
  reset role;

  ----------------------------------------------------------------------
  -- 6) Re-registering with the SAME phone (different formatting, new
  --    browser/auth id) re-links to the existing employee instead of
  --    creating a duplicate.
  ----------------------------------------------------------------------
  insert into auth.users (id) values (emp1_new_uid);
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', emp1_new_uid::text, true);

  declare
    v_relinked_id uuid;
  begin
    select id into v_relinked_id from public.register_or_relink_employee('Иван', '89001111111', array['waiter']::public.staff_role[], 'ru');
    if v_relinked_id <> v_emp1_id then
      raise exception 'FAIL: re-registering with same phone (different formatting) created a NEW employee instead of relinking';
    end if;
    raise notice 'PASS: same phone number (different formatting) relinks to the same employee';
  end;

  select public.current_employee_id() into v_emp1_id;
  if v_emp1_id is null then raise exception 'FAIL: relinked auth user does not resolve to the employee'; end if;
  reset role;

  set local role authenticated;
  perform set_config('request.jwt.claim.sub', emp1_uid::text, true);
  select public.current_employee_id() into v_emp1_id;
  if v_emp1_id is not null then
    raise exception 'FAIL: OLD auth id still resolves to an employee after relink (should have been replaced)';
  end if;
  raise notice 'PASS: old device/browser auth id no longer resolves to the employee after relink';
  reset role;

  ----------------------------------------------------------------------
  -- 7) Total employee count is still 2 (no duplicate was created)
  ----------------------------------------------------------------------
  select count(*) into v_count from public.employees;
  if v_count <> 2 then raise exception 'FAIL: employees table has % rows, expected 2 (duplicate created?)', v_count; end if;
  raise notice 'PASS: no duplicate employee row was created';

  ----------------------------------------------------------------------
  -- 8) Notifications: exactly one "employee_registered" per NEW employee
  --    (the relink must NOT create a second one)
  ----------------------------------------------------------------------
  select count(*) into v_count from public.notifications where type = 'employee_registered';
  if v_count <> 2 then raise exception 'FAIL: expected 2 employee_registered notifications, got %', v_count; end if;
  raise notice 'PASS: exactly one employee_registered notification per new employee (relink did not spam another)';

  ----------------------------------------------------------------------
  -- 9) audit_log is admin-only
  ----------------------------------------------------------------------
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', emp1_new_uid::text, true);
  select count(*) into v_count from public.audit_log;
  if v_count <> 0 then raise exception 'FAIL: a regular employee can read audit_log (% rows)', v_count; end if;
  raise notice 'PASS: audit_log invisible to a regular employee';
  reset role;

  set local role authenticated;
  perform set_config('request.jwt.claim.sub', admin_uid::text, true);
  select count(*) into v_count from public.audit_log;
  if v_count = 0 then raise exception 'FAIL: admin cannot read audit_log'; end if;
  raise notice 'PASS: admin can read audit_log (% rows)', v_count;
  reset role;

  ----------------------------------------------------------------------
  -- 10) Anonymous (not-yet-signed-in) role sees nothing at all
  ----------------------------------------------------------------------
  set local role anon;
  select count(*) into v_count from public.employees;
  if v_count <> 0 then raise exception 'FAIL: anon role can read % employee rows', v_count; end if;
  raise notice 'PASS: anon role reads zero rows from employees (RLS has no policy for anon)';

  begin
    select count(*) into v_count from public.employee_roster;
    raise exception 'FAIL: anon role could query employee_roster at all (% rows) before signing in', v_count;
  exception when insufficient_privilege then
    raise notice 'PASS: anon role is flatly denied SELECT on employee_roster (no grant at all)';
  end;
  reset role;

  ----------------------------------------------------------------------
  -- 11) An authenticated-but-unregistered session cannot call the RPC
  ----------------------------------------------------------------------
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', '', true);
  begin
    perform public.register_or_relink_employee('Ghost', '000', array['waiter']::public.staff_role[], 'ru');
    raise exception 'FAIL: RPC succeeded without an authenticated auth.uid()';
  exception when others then
    if sqlerrm like 'must_be_authenticated%' then
      raise notice 'PASS: RPC rejects calls with no auth.uid()';
    else
      raise exception 'FAIL: unexpected error from RPC: %', sqlerrm;
    end if;
  end;
  reset role;

  raise notice '=== ALL STAGE 1 RLS/RPC TESTS PASSED ===';
end;
$$;
