-- Stage 1: core tables — the single schedule week, employees, roles, admins,
-- audit log and notifications. Kept as separate tables (not one big table)
-- so each concern can evolve independently.

-- v1 works with exactly one active week, but the table already supports many
-- rows so a later version can add automatic week rollover without a schema
-- change (see README "что легко расширить").
create table public.schedule_weeks (
  id uuid primary key default gen_random_uuid(),
  start_date date not null,
  end_date date not null,
  timezone text not null default 'Europe/Moscow',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint schedule_weeks_dates_chk check (end_date > start_date)
);
comment on table public.schedule_weeks is
  'v1 holds exactly one active row. All shift/requirement times are wall-clock times in this row''s timezone, not the visitor''s device timezone.';

-- Only one week can be "active" (the one the whole app currently shows).
create unique index schedule_weeks_one_active on public.schedule_weeks (is_active) where is_active;

create table public.employees (
  id uuid primary key default gen_random_uuid(),
  -- Linked to a Supabase Auth user created via anonymous sign-in (no
  -- password). This is how the server recognizes "which employee is making
  -- this request" for RLS, without a login form for staff.
  auth_user_id uuid unique references auth.users (id) on delete set null,
  name text not null check (char_length(btrim(name)) between 1 and 100),
  phone text not null,
  -- Digits-only form of the phone number, used as the real uniqueness key
  -- so "+7 900 111-11-11" and "8 900 111-11-11" are recognized as the same person.
  phone_normalized text generated always as (public.normalize_phone(phone)) stored,
  is_active boolean not null default true,
  preferred_language text not null default 'ru' check (preferred_language in ('ru', 'en', 'pt')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index employees_phone_unique on public.employees (phone_normalized);

create table public.employee_roles (
  employee_id uuid not null references public.employees (id) on delete cascade,
  role public.staff_role not null,
  primary key (employee_id, role)
);

-- Marks which Supabase Auth users are administrators. Rows here are created
-- manually (SQL editor) as a one-time setup step — see README — never
-- through the app's own API, so nobody can grant themselves admin access.
create table public.admin_profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default 'Admin',
  created_at timestamptz not null default now()
);

create table public.audit_log (
  id uuid primary key default gen_random_uuid(),
  occurred_at timestamptz not null default now(),
  actor_type text not null check (actor_type in ('employee', 'admin', 'system')),
  actor_employee_id uuid references public.employees (id) on delete set null,
  actor_admin_id uuid references auth.users (id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  old_value jsonb,
  new_value jsonb
);
create index audit_log_occurred_at_idx on public.audit_log (occurred_at desc);
create index audit_log_entity_idx on public.audit_log (entity_type, entity_id);
comment on table public.audit_log is
  'Append-only. Every mutating RPC writes one row here. Never updated or deleted by the app.';

-- In-app notification feed. We store a `type` key + structured `data`
-- (not pre-rendered text), so the SAME row can be displayed correctly in
-- Russian, English or Portuguese depending on who is looking at it.
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  recipient_type text not null check (recipient_type in ('admin', 'employee')),
  employee_id uuid references public.employees (id) on delete cascade,
  type text not null,
  data jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  constraint notifications_employee_chk check (
    (recipient_type = 'employee' and employee_id is not null) or
    (recipient_type = 'admin' and employee_id is null)
  )
);
create index notifications_recipient_idx on public.notifications (recipient_type, employee_id, created_at desc);
