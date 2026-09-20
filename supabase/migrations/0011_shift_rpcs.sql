-- Stage 2: the only two ways a regular employee can change their own
-- schedule. Both are SECURITY DEFINER so they can write to `shifts`,
-- `audit_log` and `notifications` even though employees have no direct
-- grant on those tables — every write is funneled through here so
-- validation, audit logging and the admin notification always happen
-- together (spec §6, §33).

create or replace function public.save_my_shift(
  p_day_of_week smallint,
  p_role public.staff_role,
  p_start_time time,
  p_end_time time
)
returns public.shifts
language plpgsql
security definer
set search_path = public
as $$
declare
  v_employee public.employees;
  v_week public.schedule_weeks;
  v_existing public.shifts;
  v_result public.shifts;
begin
  select * into v_employee from public.employees where auth_user_id = auth.uid();
  if v_employee.id is null then
    raise exception 'not_registered';
  end if;

  select * into v_week from public.schedule_weeks where is_active limit 1;
  if v_week.id is null then
    raise exception 'no_active_week';
  end if;

  if p_day_of_week not between 0 and 6 then
    raise exception 'invalid_day';
  end if;
  if p_end_time <= p_start_time then
    raise exception 'invalid_time_range';
  end if;
  if p_start_time < time '10:00' or p_end_time > time '22:30' then
    raise exception 'time_out_of_bounds';
  end if;

  select * into v_existing
    from public.shifts
    where employee_id = v_employee.id and week_id = v_week.id and day_of_week = p_day_of_week and source = 'self';

  insert into public.shifts (week_id, employee_id, role, day_of_week, start_time, end_time, source)
  values (v_week.id, v_employee.id, p_role, p_day_of_week, p_start_time, p_end_time, 'self')
  on conflict (employee_id, week_id, day_of_week) where source = 'self'
  do update set role = excluded.role, start_time = excluded.start_time, end_time = excluded.end_time, updated_at = now()
  returning * into v_result;

  insert into audit_log (actor_type, actor_employee_id, action, entity_type, entity_id, old_value, new_value)
  values (
    'employee', v_employee.id,
    case when v_existing.id is null then 'shift_created' else 'shift_updated' end,
    'shift', v_result.id,
    case when v_existing.id is null then null else to_jsonb(v_existing) end,
    to_jsonb(v_result)
  );

  insert into notifications (recipient_type, type, data)
  values ('admin', 'shift_saved', jsonb_build_object(
    'employee_id', v_employee.id,
    'employee_name', v_employee.name,
    'day_of_week', p_day_of_week,
    'role', p_role,
    'start_time', p_start_time,
    'end_time', p_end_time,
    'is_new', v_existing.id is null
  ));

  return v_result;
end;
$$;

revoke execute on function public.save_my_shift(smallint, public.staff_role, time, time) from public;
grant execute on function public.save_my_shift(smallint, public.staff_role, time, time) to authenticated;


create or replace function public.delete_my_shift(p_day_of_week smallint)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_employee public.employees;
  v_week public.schedule_weeks;
  v_existing public.shifts;
begin
  select * into v_employee from public.employees where auth_user_id = auth.uid();
  if v_employee.id is null then
    raise exception 'not_registered';
  end if;

  select * into v_week from public.schedule_weeks where is_active limit 1;
  if v_week.id is null then
    raise exception 'no_active_week';
  end if;

  delete from public.shifts
    where employee_id = v_employee.id and week_id = v_week.id and day_of_week = p_day_of_week and source = 'self'
    returning * into v_existing;

  if v_existing.id is null then
    return; -- nothing to clear — not an error
  end if;

  insert into audit_log (actor_type, actor_employee_id, action, entity_type, entity_id, old_value)
  values ('employee', v_employee.id, 'shift_deleted', 'shift', v_existing.id, to_jsonb(v_existing));

  insert into notifications (recipient_type, type, data)
  values ('admin', 'shift_removed', jsonb_build_object(
    'employee_id', v_employee.id,
    'employee_name', v_employee.name,
    'day_of_week', p_day_of_week,
    'role', v_existing.role,
    'start_time', v_existing.start_time,
    'end_time', v_existing.end_time
  ));
end;
$$;

revoke execute on function public.delete_my_shift(smallint) from public;
grant execute on function public.delete_my_shift(smallint) to authenticated;
