-- Stage 1: employee self-registration.
--
-- The client first calls supabase.auth.signInAnonymously() to get an
-- auth.uid() (no password, no SMS code — matches spec §3 "no accounts").
-- It then calls this function, which either creates a brand new employee
-- row, or — if that phone number already exists — re-links the existing
-- employee to this browser's auth id (covers "I cleared my browser data /
-- got a new phone and registered again with the same number"). Everything
-- happens in one transaction, so a half-created employee can never exist.
create or replace function public.register_or_relink_employee(
  p_name text,
  p_phone text,
  p_roles public.staff_role[],
  p_preferred_language text default 'ru'
)
returns public.employees
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_phone_normalized text := public.normalize_phone(p_phone);
  v_employee public.employees;
  v_is_new boolean;
  v_role public.staff_role;
  v_lang text := p_preferred_language;
begin
  if v_uid is null then
    raise exception 'must_be_authenticated';
  end if;
  if char_length(btrim(coalesce(p_name, ''))) = 0 then
    raise exception 'name_required';
  end if;
  if char_length(v_phone_normalized) < 5 then
    raise exception 'phone_required';
  end if;
  if p_roles is null or array_length(p_roles, 1) is null then
    raise exception 'role_required';
  end if;
  if v_lang not in ('ru', 'en', 'pt') then
    v_lang := 'ru';
  end if;

  select * into v_employee from public.employees where phone_normalized = v_phone_normalized;

  if v_employee.id is null then
    v_is_new := true;
    insert into public.employees (auth_user_id, name, phone, preferred_language)
    values (v_uid, btrim(p_name), p_phone, v_lang)
    returning * into v_employee;
  else
    v_is_new := false;
    update public.employees
      set auth_user_id = v_uid,
          name = btrim(p_name),
          preferred_language = v_lang,
          is_active = true,
          updated_at = now()
      where id = v_employee.id
      returning * into v_employee;

    delete from public.employee_roles where employee_id = v_employee.id;
  end if;

  foreach v_role in array p_roles loop
    insert into public.employee_roles (employee_id, role)
    values (v_employee.id, v_role)
    on conflict do nothing;
  end loop;

  insert into public.audit_log (actor_type, actor_employee_id, action, entity_type, entity_id, new_value)
  values (
    'employee',
    v_employee.id,
    case when v_is_new then 'employee_registered' else 'employee_relinked' end,
    'employee',
    v_employee.id,
    jsonb_build_object('name', v_employee.name, 'phone', v_employee.phone, 'roles', p_roles)
  );

  if v_is_new then
    insert into public.notifications (recipient_type, type, data)
    values (
      'admin',
      'employee_registered',
      jsonb_build_object('employee_id', v_employee.id, 'name', v_employee.name, 'phone', v_employee.phone)
    );
  end if;

  return v_employee;
end;
$$;

revoke execute on function public.register_or_relink_employee(text, text, public.staff_role[], text) from public;
grant execute on function public.register_or_relink_employee(text, text, public.staff_role[], text) to authenticated;
