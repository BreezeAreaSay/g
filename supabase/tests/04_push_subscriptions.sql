\set ON_ERROR_STOP on

do $$
declare
  emp1_uid uuid := 'd9000000-0000-0000-0000-000000000001';
  emp2_uid uuid := 'd9000000-0000-0000-0000-000000000002';
  admin_uid uuid := 'd9000000-0000-0000-0000-000000000003';
  v_count int;
begin
  insert into auth.users (id) values (emp1_uid), (emp2_uid), (admin_uid);
  insert into admin_profiles (user_id, display_name) values (admin_uid, 'Push Admin');

  set local role authenticated;
  perform set_config('request.jwt.claim.sub', emp1_uid::text, true);
  perform register_or_relink_employee('Push Emp 1', '+7 900 600-00-01', array['waiter']::staff_role[], 'ru');
  reset role;
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', emp2_uid::text, true);
  perform register_or_relink_employee('Push Emp 2', '+7 900 600-00-02', array['waiter']::staff_role[], 'ru');
  reset role;

  -- Employee 1 saves their own push subscription.
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', emp1_uid::text, true);
  insert into push_subscriptions (owner_type, employee_id, endpoint, p256dh, auth_key)
  values ('employee', current_employee_id(), 'https://push.example/emp1', 'p256dh-1', 'auth-1');
  reset role;

  -- Employee 2 cannot see employee 1's subscription.
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', emp2_uid::text, true);
  select count(*) into v_count from push_subscriptions;
  if v_count <> 0 then raise exception 'FAIL: employee 2 can see employee 1''s push subscription (% rows)', v_count; end if;
  reset role;
  raise notice 'PASS: an employee cannot see another employee''s push subscription';

  -- Employee 2 cannot forge a subscription claiming to be for employee 1.
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', emp2_uid::text, true);
  begin
    insert into push_subscriptions (owner_type, employee_id, endpoint, p256dh, auth_key)
    values ('employee', (select id from employees where phone_normalized = '79006000001'), 'https://push.example/forged', 'x', 'y');
    raise exception 'FAIL: employee 2 inserted a push subscription owned by employee 1';
  exception when insufficient_privilege then
    raise notice 'PASS: an employee cannot register a push subscription under someone else''s employee_id';
  end;
  reset role;

  -- Admin manages their own subscription too, independent of employees'.
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', admin_uid::text, true);
  insert into push_subscriptions (owner_type, admin_user_id, endpoint, p256dh, auth_key)
  values ('admin', admin_uid, 'https://push.example/admin', 'p256dh-a', 'auth-a');
  select count(*) into v_count from push_subscriptions;
  if v_count <> 1 then raise exception 'FAIL: admin should see only their own subscription via RLS (got %)', v_count; end if;
  reset role;
  raise notice 'PASS: admin push subscriptions are isolated the same way';

  -- The owner/id combination check constraint rejects a mismatched pair.
  begin
    insert into push_subscriptions (owner_type, employee_id, admin_user_id, endpoint, p256dh, auth_key)
    values ('employee', null, admin_uid, 'https://push.example/bad', 'x', 'y');
    raise exception 'FAIL: inserted an employee-owned row with no employee_id';
  exception when check_violation then
    raise notice 'PASS: the owner_type/employee_id/admin_user_id check constraint holds';
  end;

  raise notice '=== ALL STAGE 4 PUSH SUBSCRIPTION TESTS PASSED ===';
end;
$$;
