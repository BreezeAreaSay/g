-- Stage 4: browser push subscriptions (spec §26). One row per
-- browser/device that granted notification permission.
alter table public.admin_profiles add column preferred_language text not null default 'ru' check (preferred_language in ('ru', 'en', 'pt'));

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  owner_type text not null check (owner_type in ('admin', 'employee')),
  employee_id uuid references public.employees (id) on delete cascade,
  admin_user_id uuid references auth.users (id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth_key text not null,
  created_at timestamptz not null default now(),
  constraint push_subscriptions_owner_chk check (
    (owner_type = 'employee' and employee_id is not null and admin_user_id is null) or
    (owner_type = 'admin' and admin_user_id is not null and employee_id is null)
  )
);
create index push_subscriptions_employee_idx on public.push_subscriptions (employee_id);
create index push_subscriptions_admin_idx on public.push_subscriptions (admin_user_id);

alter table public.push_subscriptions enable row level security;

create policy push_subscriptions_employee_own on public.push_subscriptions
  for all to authenticated
  using (owner_type = 'employee' and employee_id = public.current_employee_id())
  with check (owner_type = 'employee' and employee_id = public.current_employee_id());

create policy push_subscriptions_admin_own on public.push_subscriptions
  for all to authenticated
  using (owner_type = 'admin' and admin_user_id = auth.uid())
  with check (owner_type = 'admin' and admin_user_id = auth.uid());
-- No one can read another person's subscription (keys are secret to that
-- browser); the send-push edge function reads everything using the
-- service_role key, which bypasses RLS entirely, by design.
