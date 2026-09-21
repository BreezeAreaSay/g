\set ON_ERROR_STOP on

-- admin_set_employee_active: an admin can deactivate/reactivate an
-- employee (audit-logged, history-preserving), a regular employee cannot.
do $$
declare
  admin_uid uuid := 'e8000000-0000-0000-0000-000000000001';
  emp_uid uuid := 'e8000000-0000-0000-0000-000000000002';
  other_emp_uid uuid := 'e8000000-0000-0000-0000-000000000003';
  v_emp_id uuid;
  v_result public.employees;
  v_count int;
begin
  insert into auth.users (id) values (admin_uid), (emp_uid), (other_emp_uid);
  insert into admin_profiles (user_id, display_name) values (admin_uid, 'Stage-extra Admin');

  set local role authenticated;
  perform set_config('request.jwt.claim.sub', emp_uid::text, true);
  select id into v_emp_id from register_or_relink_employee('Junk Test', '+7 900 800-00-01', array['waiter']::staff_role[], 'ru');
  reset role;

  -- Admin deactivates.
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', admin_uid::text, true);
  select * into v_result from admin_set_employee_active(v_emp_id, false);
  reset role;

  if v_result.is_active <> false then
    raise exception 'FAIL: employee should be inactive after admin_set_employee_active(false)';
  end if;
  raise notice 'PASS: admin can deactivate an employee';

  select count(*) into v_count from audit_log
    where action = 'employee_deactivated' and entity_type = 'employee' and entity_id = v_emp_id;
  if v_count <> 1 then
    raise exception 'FAIL: deactivation was not audit-logged (found % rows)', v_count;
  end if;
  raise notice 'PASS: deactivation is audit-logged exactly once';

  select is_active into strict v_result.is_active from employees where id = v_emp_id;
  if v_result.is_active <> false then
    raise exception 'FAIL: is_active did not actually persist as false in the table';
  end if;
  raise notice 'PASS: is_active persisted correctly (history/row not deleted)';

  -- Admin reactivates.
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', admin_uid::text, true);
  select * into v_result from admin_set_employee_active(v_emp_id, true);
  reset role;
  if v_result.is_active <> true then
    raise exception 'FAIL: employee should be active again after admin_set_employee_active(true)';
  end if;
  raise notice 'PASS: admin can reactivate an employee';

  -- A regular (non-admin) employee must be rejected.
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', other_emp_uid::text, true);
  begin
    perform admin_set_employee_active(v_emp_id, false);
    raise exception 'FAIL: a non-admin was able to deactivate an employee';
  exception when others then
    if sqlerrm !~ 'not_admin' then
      raise exception 'FAIL: expected not_admin, got: %', sqlerrm;
    end if;
    raise notice 'PASS: a non-admin cannot call admin_set_employee_active';
  end;
  reset role;

  raise notice '=== ALL ADMIN EMPLOYEE-ACTIVE TESTS PASSED ===';
end;
$$;
