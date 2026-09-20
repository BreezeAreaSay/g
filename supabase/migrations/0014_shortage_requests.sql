-- Stage 3: broadcast requests for extra staff (spec §12) and each
-- employee's response to one (spec §14-15).
create table public.shortage_requests (
  id uuid primary key default gen_random_uuid(),
  week_id uuid not null references public.schedule_weeks (id) on delete cascade,
  -- Nullable: spec §16 lets an admin request only PART of a shortage's
  -- range, independent of the requirement/record it originated from.
  shortage_record_id uuid references public.shortage_records (id) on delete set null,
  day_of_week smallint not null check (day_of_week between 0 and 6),
  role public.staff_role not null,
  start_time time not null,
  end_time time not null,
  needed_count smallint not null check (needed_count > 0),
  -- queued: waiting behind a higher-priority request (spec §13).
  -- open: currently broadcast to all employees.
  -- filled / all_declined / cancelled: closed, with closed_reason set.
  status text not null check (status in ('queued', 'open', 'filled', 'all_declined', 'cancelled')) default 'queued',
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now(),
  opened_at timestamptz,
  closed_at timestamptz,
  closed_reason text,
  constraint shortage_requests_time_chk check (end_time > start_time)
);
create index shortage_requests_week_status_idx on public.shortage_requests (week_id, status);

alter table public.shortage_requests enable row level security;
-- Everyone signed in can see requests (an employee needs to see open ones
-- to respond, and past ones for context) — none of this data is sensitive.
create policy shortage_requests_select_all on public.shortage_requests
  for select to authenticated using (true);
create policy shortage_requests_admin_write on public.shortage_requests
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
-- No direct write policy for employees: responding happens only through
-- respond_to_shortage_request() (Stage 3 RPC), which is the only thing
-- allowed to flip status/close a request as a side effect of a response.

create table public.shortage_responses (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.shortage_requests (id) on delete cascade,
  employee_id uuid not null references public.employees (id) on delete cascade,
  response text not null check (response in ('accepted', 'declined')),
  -- True only if this "accepted" response actually won the slot and
  -- created a shift — spec §34's race between two simultaneous accepts.
  led_to_shift boolean not null default false,
  responded_at timestamptz not null default now(),
  unique (request_id, employee_id)
);
create index shortage_responses_request_idx on public.shortage_responses (request_id);

alter table public.shortage_responses enable row level security;
-- An employee sees their own response to any request; admin sees all
-- responses (spec §15 "Иван — не может, Мария — не может…").
create policy shortage_responses_select on public.shortage_responses
  for select to authenticated using (
    public.is_admin() or employee_id = public.current_employee_id()
  );
-- No direct write policy: only respond_to_shortage_request() writes here.
