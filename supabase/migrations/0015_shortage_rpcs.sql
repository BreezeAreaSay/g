-- Stage 3: dispatch, skip, create-request and respond-to-request.

-- Opens the single highest-priority queued request for a week, if none is
-- already open. Priority (spec §13): dishwasher before waiter; within the
-- same role, earliest-created first. Only ONE request is ever "open" (i.e.
-- actively broadcast) per week at a time — this is what makes "process
-- dishwasher shortages before moving to the next one" literal: a second
-- dishwasher shortage stays queued behind the first, and every waiter
-- request stays queued behind ALL dishwasher requests.
create or replace function public.dispatch_next_shortage_request(p_week_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_next public.shortage_requests%rowtype;
begin
  if exists (select 1 from shortage_requests where week_id = p_week_id and status = 'open') then
    return;
  end if;

  select * into v_next from shortage_requests
    where week_id = p_week_id and status = 'queued'
    order by (role = 'dishwasher') desc, created_at asc
    limit 1
    for update;

  if v_next.id is null then
    return;
  end if;

  update shortage_requests set status = 'open', opened_at = now() where id = v_next.id;

  insert into audit_log (actor_type, action, entity_type, entity_id, new_value)
  values ('system', 'shortage_request_opened', 'shortage_request', v_next.id, to_jsonb(v_next));

  -- Broadcast to every active employee regardless of their own registered
  -- role (spec §12: closing a dishwasher slot may need a waiter's help
  -- too, so nobody is filtered out here).
  insert into notifications (recipient_type, employee_id, type, data)
  select 'employee', e.id, 'shortage_request_opened', jsonb_build_object(
    'request_id', v_next.id, 'day_of_week', v_next.day_of_week, 'role', v_next.role,
    'start_time', v_next.start_time, 'end_time', v_next.end_time, 'needed_count', v_next.needed_count
  )
  from employees e where e.is_active;
end;
$$;

revoke execute on function public.dispatch_next_shortage_request(uuid) from public;
grant execute on function public.dispatch_next_shortage_request(uuid) to authenticated;


-- spec §11: admin dismisses a detected shortage; it must never auto-request again.
create or replace function public.admin_skip_shortage(p_shortage_record_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_record public.shortage_records%rowtype;
begin
  if not public.is_admin() then
    raise exception 'not_admin';
  end if;

  select * into v_record from shortage_records where id = p_shortage_record_id;
  if v_record.id is null then
    raise exception 'not_found';
  end if;

  update shortage_records
    set status = 'skipped', skipped_by = auth.uid(), skipped_at = now(), updated_at = now()
    where id = p_shortage_record_id;

  insert into audit_log (actor_type, actor_admin_id, action, entity_type, entity_id, old_value)
  values ('admin', auth.uid(), 'shortage_skipped', 'shortage_record', p_shortage_record_id, to_jsonb(v_record));
end;
$$;

revoke execute on function public.admin_skip_shortage(uuid) from public;
grant execute on function public.admin_skip_shortage(uuid) to authenticated;


-- spec §12/§16: admin asks for extra staff, optionally for only part of a
-- shortage's range. Always starts 'queued' — dispatch_next_shortage_request
-- decides whether it can open immediately.
create or replace function public.admin_create_shortage_request(
  p_day_of_week smallint,
  p_role public.staff_role,
  p_start_time time,
  p_end_time time,
  p_needed_count smallint,
  p_shortage_record_id uuid default null
)
returns public.shortage_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  v_week public.schedule_weeks;
  v_request public.shortage_requests;
begin
  if not public.is_admin() then
    raise exception 'not_admin';
  end if;
  if p_end_time <= p_start_time then
    raise exception 'invalid_time_range';
  end if;
  if p_needed_count <= 0 then
    raise exception 'invalid_needed_count';
  end if;

  select * into v_week from schedule_weeks where is_active limit 1;
  if v_week.id is null then
    raise exception 'no_active_week';
  end if;

  insert into shortage_requests (week_id, shortage_record_id, day_of_week, role, start_time, end_time, needed_count, status, created_by)
  values (v_week.id, p_shortage_record_id, p_day_of_week, p_role, p_start_time, p_end_time, p_needed_count, 'queued', auth.uid())
  returning * into v_request;

  insert into audit_log (actor_type, actor_admin_id, action, entity_type, entity_id, new_value)
  values ('admin', auth.uid(), 'shortage_request_created', 'shortage_request', v_request.id, to_jsonb(v_request));

  perform dispatch_next_shortage_request(v_week.id);

  select * into v_request from shortage_requests where id = v_request.id;
  return v_request;
end;
$$;

revoke execute on function public.admin_create_shortage_request(smallint, public.staff_role, time, time, smallint, uuid) from public;
grant execute on function public.admin_create_shortage_request(smallint, public.staff_role, time, time, smallint, uuid) to authenticated;


-- spec §14/§15/§34: the one function employees call from either button.
-- SELECT ... FOR UPDATE on the request row serializes concurrent accepts
-- so a second "Я выйду" click on an already-filled slot can never create
-- a second shift for it.
create or replace function public.respond_to_shortage_request(p_request_id uuid, p_response text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_employee public.employees;
  v_request public.shortage_requests%rowtype;
  v_accepted_count int;
  v_declined_count int;
  v_active_count int;
  v_new_shift public.shifts;
begin
  if p_response not in ('accepted', 'declined') then
    raise exception 'invalid_response';
  end if;

  select * into v_employee from employees where auth_user_id = auth.uid();
  if v_employee.id is null then
    raise exception 'not_registered';
  end if;

  select * into v_request from shortage_requests where id = p_request_id for update;
  if v_request.id is null then
    raise exception 'not_found';
  end if;

  insert into shortage_responses (request_id, employee_id, response)
  values (p_request_id, v_employee.id, p_response)
  on conflict (request_id, employee_id) do update set response = excluded.response, responded_at = now(), led_to_shift = false;

  if p_response = 'declined' then
    insert into audit_log (actor_type, actor_employee_id, action, entity_type, entity_id, new_value)
    values ('employee', v_employee.id, 'shortage_declined', 'shortage_request', p_request_id, jsonb_build_object('employee_name', v_employee.name));

    insert into notifications (recipient_type, type, data)
    values ('admin', 'shortage_declined', jsonb_build_object('request_id', p_request_id, 'employee_id', v_employee.id, 'employee_name', v_employee.name));

    if v_request.status = 'open' then
      select count(*) into v_declined_count from shortage_responses where request_id = p_request_id and response = 'declined';
      select count(*) into v_active_count from employees where is_active;

      if v_declined_count >= v_active_count then
        update shortage_requests set status = 'all_declined', closed_at = now(), closed_reason = 'all_declined' where id = p_request_id;

        insert into audit_log (actor_type, action, entity_type, entity_id, new_value)
        values ('system', 'shortage_all_declined', 'shortage_request', p_request_id, to_jsonb(v_request));

        insert into notifications (recipient_type, type, data)
        values ('admin', 'shortage_all_declined', jsonb_build_object(
          'request_id', p_request_id, 'day_of_week', v_request.day_of_week, 'role', v_request.role,
          'start_time', v_request.start_time, 'end_time', v_request.end_time
        ));

        perform dispatch_next_shortage_request(v_request.week_id);
      end if;
    end if;

    return jsonb_build_object('status', 'declined');
  end if;

  -- p_response = 'accepted'
  if v_request.status <> 'open' then
    return jsonb_build_object('status', 'already_closed');
  end if;

  select count(*) into v_accepted_count from shortage_responses where request_id = p_request_id and led_to_shift = true;
  if v_accepted_count >= v_request.needed_count then
    return jsonb_build_object('status', 'already_closed');
  end if;

  insert into shifts (week_id, employee_id, role, day_of_week, start_time, end_time, source)
  values (v_request.week_id, v_employee.id, v_request.role, v_request.day_of_week, v_request.start_time, v_request.end_time, 'shortage_response')
  returning * into v_new_shift;

  update shortage_responses set led_to_shift = true where request_id = p_request_id and employee_id = v_employee.id;
  v_accepted_count := v_accepted_count + 1;

  insert into audit_log (actor_type, actor_employee_id, action, entity_type, entity_id, new_value)
  values ('employee', v_employee.id, 'shortage_accepted', 'shortage_request', p_request_id, jsonb_build_object('employee_name', v_employee.name, 'shift_id', v_new_shift.id));

  insert into notifications (recipient_type, type, data)
  values ('admin', 'shortage_accepted', jsonb_build_object(
    'request_id', p_request_id, 'employee_id', v_employee.id, 'employee_name', v_employee.name,
    'day_of_week', v_request.day_of_week, 'role', v_request.role, 'start_time', v_request.start_time, 'end_time', v_request.end_time
  ));

  if v_accepted_count >= v_request.needed_count then
    update shortage_requests set status = 'filled', closed_at = now(), closed_reason = 'filled' where id = p_request_id;

    insert into audit_log (actor_type, action, entity_type, entity_id, new_value)
    values ('system', 'shortage_request_closed', 'shortage_request', p_request_id, jsonb_build_object('reason', 'filled'));

    -- Everyone else who was asked and hasn't responded yet gets a
    -- "closed, filled" notification (spec §14 "Запрос закрыт. Сотрудник найден.").
    insert into notifications (recipient_type, employee_id, type, data)
    select 'employee', e.id, 'shortage_request_closed', jsonb_build_object('request_id', p_request_id, 'reason', 'filled')
    from employees e
    where e.is_active and e.id <> v_employee.id
      and not exists (select 1 from shortage_responses r where r.request_id = p_request_id and r.employee_id = e.id and r.led_to_shift);

    perform dispatch_next_shortage_request(v_request.week_id);
  end if;

  return jsonb_build_object('status', 'accepted');
end;
$$;

revoke execute on function public.respond_to_shortage_request(uuid, text) from public;
grant execute on function public.respond_to_shortage_request(uuid, text) to authenticated;
