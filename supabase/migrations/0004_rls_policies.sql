-- Stage 1: Row Level Security. This is enforced by Postgres itself, so it
-- holds even if a bug in the frontend forgets to check a permission —
-- "server logic must check access, never trust the UI alone" (spec §33).

alter table public.schedule_weeks enable row level security;
alter table public.employees enable row level security;
alter table public.employee_roles enable row level security;
alter table public.admin_profiles enable row level security;
alter table public.audit_log enable row level security;
alter table public.notifications enable row level security;

-- schedule_weeks: everyone signed in can read it (needed to know which week
-- to show); only admins can change it.
create policy schedule_weeks_select on public.schedule_weeks
  for select to authenticated using (true);
create policy schedule_weeks_admin_write on public.schedule_weeks
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- employees: a person can see/update their OWN row (including their own
-- phone number — that's expected), admins can see/update everyone's.
-- Nobody else can see another employee's row through this table — the
-- phone-free public roster is exposed separately via the employee_roster
-- view (0005_views.sql). There is no insert/delete policy for regular
-- clients: rows are only created/updated through the
-- register_or_relink_employee() RPC (security definer) or by an admin.
create policy employees_select_own_or_admin on public.employees
  for select to authenticated using (auth_user_id = auth.uid() or public.is_admin());
create policy employees_update_own_or_admin on public.employees
  for update to authenticated
  using (auth_user_id = auth.uid() or public.is_admin())
  with check (auth_user_id = auth.uid() or public.is_admin());
create policy employees_admin_insert on public.employees
  for insert to authenticated with check (public.is_admin());
create policy employees_admin_delete on public.employees
  for delete to authenticated using (public.is_admin());

-- employee_roles: visible to everyone (it's not sensitive — "Ivan is a
-- waiter" is shown on the shared schedule), but only the employee
-- themselves or an admin can change it.
create policy employee_roles_select_all on public.employee_roles
  for select to authenticated using (true);
create policy employee_roles_write_own_or_admin on public.employee_roles
  for insert to authenticated with check (
    public.is_admin() or exists (
      select 1 from public.employees e where e.id = employee_id and e.auth_user_id = auth.uid()
    )
  );
create policy employee_roles_delete_own_or_admin on public.employee_roles
  for delete to authenticated using (
    public.is_admin() or exists (
      select 1 from public.employees e where e.id = employee_id and e.auth_user_id = auth.uid()
    )
  );

-- admin_profiles: only admins can even see who the admins are. Rows are
-- never inserted through the API (see comment on the table).
create policy admin_profiles_select on public.admin_profiles
  for select to authenticated using (public.is_admin());

-- audit_log: admin-only, read-only from the client. All writes happen
-- inside SECURITY DEFINER RPCs, which (as the table owner) bypass RLS —
-- no insert/update/delete policy is granted to regular clients at all.
create policy audit_log_select_admin on public.audit_log
  for select to authenticated using (public.is_admin());

-- notifications: admins see admin notifications, an employee sees only
-- their own. Marking read_at is allowed directly since it carries no risk.
create policy notifications_select on public.notifications
  for select to authenticated using (
    (recipient_type = 'admin' and public.is_admin())
    or (recipient_type = 'employee' and employee_id = public.current_employee_id())
  );
create policy notifications_update_read_state on public.notifications
  for update to authenticated
  using (
    (recipient_type = 'admin' and public.is_admin())
    or (recipient_type = 'employee' and employee_id = public.current_employee_id())
  )
  with check (
    (recipient_type = 'admin' and public.is_admin())
    or (recipient_type = 'employee' and employee_id = public.current_employee_id())
  );
