-- Admin needs a way to remove a stray/test/unwanted registration without
-- losing history: anyone with the registration link can sign up (spec §3),
-- so junk entries are expected, not a bug. Deactivating (not hard-deleting)
-- keeps their shift/attendance/audit history intact and drops them out of
-- is_active-filtered things like the shortage-request broadcast list —
-- same flag the rest of the app already treats as "real staff".
create or replace function public.admin_set_employee_active(
  p_employee_id uuid,
  p_is_active boolean
)
returns public.employees
language plpgsql
security definer
set search_path = public
as $$
declare
  v_before public.employees;
  v_after public.employees;
begin
  if not public.is_admin() then raise exception 'not_admin'; end if;

  select * into v_before from employees where id = p_employee_id;
  if v_before.id is null then raise exception 'not_found'; end if;

  update employees
    set is_active = p_is_active, updated_at = now()
    where id = p_employee_id
    returning * into v_after;

  insert into audit_log (actor_type, actor_admin_id, action, entity_type, entity_id, old_value, new_value)
  values (
    'admin',
    auth.uid(),
    case when p_is_active then 'employee_activated' else 'employee_deactivated' end,
    'employee',
    p_employee_id,
    jsonb_build_object('is_active', v_before.is_active),
    jsonb_build_object('is_active', v_after.is_active)
  );

  return v_after;
end;
$$;

revoke execute on function public.admin_set_employee_active(uuid, boolean) from public;
grant execute on function public.admin_set_employee_active(uuid, boolean) to authenticated;
