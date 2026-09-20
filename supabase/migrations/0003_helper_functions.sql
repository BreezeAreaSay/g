-- Stage 1: helper functions used throughout RLS policies and RPCs.
-- Both are SECURITY DEFINER so they can read admin_profiles / employees
-- without being blocked by THOSE tables' own RLS policies (which would
-- otherwise recurse into these same functions).

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.admin_profiles where user_id = auth.uid());
$$;

create or replace function public.current_employee_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from public.employees where auth_user_id = auth.uid();
$$;

revoke execute on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;

revoke execute on function public.current_employee_id() from public;
grant execute on function public.current_employee_id() to authenticated;
