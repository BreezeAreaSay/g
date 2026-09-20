-- Stage 5: admin's manual-correction powers (spec §17, §23).

create or replace function public.admin_correct_attendance(
  p_attendance_id uuid,
  p_clock_in_at timestamptz,
  p_clock_out_at timestamptz
)
returns public.attendance
language plpgsql
security definer
set search_path = public
as $$
declare
  v_before public.attendance;
  v_after public.attendance;
begin
  if not public.is_admin() then raise exception 'not_admin'; end if;

  select * into v_before from attendance where id = p_attendance_id;
  if v_before.id is null then raise exception 'not_found'; end if;

  update attendance
    set clock_in_at = p_clock_in_at,
        clock_out_at = p_clock_out_at,
        corrected_by = auth.uid(),
        corrected_at = now(),
        updated_at = now()
    where id = p_attendance_id
    returning * into v_after;

  insert into audit_log (actor_type, actor_admin_id, action, entity_type, entity_id, old_value, new_value)
  values ('admin', auth.uid(), 'attendance_corrected', 'attendance', p_attendance_id, to_jsonb(v_before), to_jsonb(v_after));

  return v_after;
end;
$$;

revoke execute on function public.admin_correct_attendance(uuid, timestamptz, timestamptz) from public;
grant execute on function public.admin_correct_attendance(uuid, timestamptz, timestamptz) to authenticated;


-- spec §17: admin can change anyone's shift; the employee is notified
-- with both the old and new time so there's no confusion about what
-- changed under them.
create or replace function public.admin_update_shift(
  p_shift_id uuid,
  p_start_time time,
  p_end_time time,
  p_role public.staff_role default null
)
returns public.shifts
language plpgsql
security definer
set search_path = public
as $$
declare
  v_before public.shifts;
  v_after public.shifts;
begin
  if not public.is_admin() then raise exception 'not_admin'; end if;
  if p_end_time <= p_start_time then raise exception 'invalid_time_range'; end if;

  select * into v_before from shifts where id = p_shift_id;
  if v_before.id is null then raise exception 'not_found'; end if;

  update shifts
    set start_time = p_start_time,
        end_time = p_end_time,
        role = coalesce(p_role, role),
        updated_at = now()
    where id = p_shift_id
    returning * into v_after;

  insert into audit_log (actor_type, actor_admin_id, action, entity_type, entity_id, old_value, new_value)
  values ('admin', auth.uid(), 'shift_updated_by_admin', 'shift', p_shift_id, to_jsonb(v_before), to_jsonb(v_after));

  insert into notifications (recipient_type, employee_id, type, data)
  values (
    'employee', v_after.employee_id, 'shift_changed_by_admin',
    jsonb_build_object(
      'day_of_week', v_after.day_of_week,
      'old_start_time', v_before.start_time, 'old_end_time', v_before.end_time,
      'new_start_time', v_after.start_time, 'new_end_time', v_after.end_time
    )
  );

  return v_after;
end;
$$;

revoke execute on function public.admin_update_shift(uuid, time, time, public.staff_role) from public;
grant execute on function public.admin_update_shift(uuid, time, time, public.staff_role) to authenticated;


create or replace function public.admin_delete_shift(p_shift_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_before public.shifts;
begin
  if not public.is_admin() then raise exception 'not_admin'; end if;

  select * into v_before from shifts where id = p_shift_id;
  if v_before.id is null then raise exception 'not_found'; end if;

  delete from shifts where id = p_shift_id;

  insert into audit_log (actor_type, actor_admin_id, action, entity_type, entity_id, old_value)
  values ('admin', auth.uid(), 'shift_deleted_by_admin', 'shift', p_shift_id, to_jsonb(v_before));

  insert into notifications (recipient_type, employee_id, type, data)
  values ('employee', v_before.employee_id, 'shift_removed_by_admin', jsonb_build_object(
    'day_of_week', v_before.day_of_week, 'start_time', v_before.start_time, 'end_time', v_before.end_time
  ));
end;
$$;

revoke execute on function public.admin_delete_shift(uuid) from public;
grant execute on function public.admin_delete_shift(uuid) to authenticated;
