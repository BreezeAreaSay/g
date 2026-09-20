-- Stage 5: clock_in / clock_out — spec §21-22. Both are idempotent (a
-- second tap doesn't overwrite the first real timestamp) and validate
-- server-side that "today" (in the RESTAURANT's timezone, never the
-- visitor's device clock — spec §35) actually matches the shift's day,
-- so the button being shown at all is a UX nicety, not the real guard.

create or replace function public.clock_in(p_shift_id uuid)
returns public.attendance
language plpgsql
security definer
set search_path = public
as $$
declare
  v_employee public.employees;
  v_shift public.shifts;
  v_week public.schedule_weeks;
  v_today date;
  v_shift_date date;
  v_existing public.attendance;
  v_result public.attendance;
begin
  select * into v_employee from employees where auth_user_id = auth.uid();
  if v_employee.id is null then raise exception 'not_registered'; end if;

  select * into v_shift from shifts where id = p_shift_id;
  if v_shift.id is null or v_shift.employee_id <> v_employee.id then
    raise exception 'not_your_shift';
  end if;

  select * into v_week from schedule_weeks where id = v_shift.week_id;
  v_today := (now() at time zone v_week.timezone)::date;
  v_shift_date := v_week.start_date + v_shift.day_of_week;
  if v_today <> v_shift_date then
    raise exception 'not_shift_day';
  end if;

  select * into v_existing from attendance where shift_id = p_shift_id;
  -- A repeat tap must never overwrite the real first timestamp, and must
  -- not re-notify/re-log — spec §21 "fix the actual moment of the tap".
  if v_existing.id is not null and v_existing.clock_in_at is not null then
    return v_existing;
  end if;

  insert into attendance (shift_id, clock_in_at, clock_in_source)
  values (p_shift_id, now(), 'employee')
  on conflict (shift_id) do update set clock_in_at = excluded.clock_in_at, clock_in_source = excluded.clock_in_source
  returning * into v_result;

  insert into audit_log (actor_type, actor_employee_id, action, entity_type, entity_id, new_value)
  values ('employee', v_employee.id, 'attendance_clock_in', 'attendance', v_result.id,
    jsonb_build_object('shift_id', p_shift_id, 'clock_in_at', v_result.clock_in_at));

  insert into notifications (recipient_type, type, data)
  values ('admin', 'attendance_clock_in', jsonb_build_object(
    'employee_id', v_employee.id, 'employee_name', v_employee.name, 'shift_id', p_shift_id,
    'clock_in_at', v_result.clock_in_at,
    -- Pre-formatted in the RESTAURANT's timezone (spec §35) so the push
    -- message never has to redo timezone math from a bare instant.
    'clock_in_at_local', to_char(v_result.clock_in_at at time zone v_week.timezone, 'HH24:MI')
  ));

  return v_result;
end;
$$;

revoke execute on function public.clock_in(uuid) from public;
grant execute on function public.clock_in(uuid) to authenticated;


create or replace function public.clock_out(p_shift_id uuid)
returns public.attendance
language plpgsql
security definer
set search_path = public
as $$
declare
  v_employee public.employees;
  v_shift public.shifts;
  v_week public.schedule_weeks;
  v_existing public.attendance;
  v_result public.attendance;
  v_already_out boolean;
begin
  select * into v_employee from employees where auth_user_id = auth.uid();
  if v_employee.id is null then raise exception 'not_registered'; end if;

  select * into v_shift from shifts where id = p_shift_id;
  if v_shift.id is null or v_shift.employee_id <> v_employee.id then
    raise exception 'not_your_shift';
  end if;

  select * into v_week from schedule_weeks where id = v_shift.week_id;
  select * into v_existing from attendance where shift_id = p_shift_id;
  if v_existing.id is null or v_existing.clock_in_at is null then
    raise exception 'not_clocked_in';
  end if;

  v_already_out := v_existing.clock_out_at is not null;

  update attendance
    set clock_out_at = coalesce(clock_out_at, now()), clock_out_source = coalesce(clock_out_source, 'employee')
    where shift_id = p_shift_id
    returning * into v_result;

  if not v_already_out then
    insert into audit_log (actor_type, actor_employee_id, action, entity_type, entity_id, new_value)
    values ('employee', v_employee.id, 'attendance_clock_out', 'attendance', v_result.id,
      jsonb_build_object('shift_id', p_shift_id, 'clock_out_at', v_result.clock_out_at));

    insert into notifications (recipient_type, type, data)
    values ('admin', 'attendance_clock_out', jsonb_build_object(
      'employee_id', v_employee.id, 'employee_name', v_employee.name, 'shift_id', p_shift_id,
      'clock_out_at', v_result.clock_out_at,
      'clock_out_at_local', to_char(v_result.clock_out_at at time zone v_week.timezone, 'HH24:MI')
    ));
  end if;

  return v_result;
end;
$$;

revoke execute on function public.clock_out(uuid) from public;
grant execute on function public.clock_out(uuid) to authenticated;
