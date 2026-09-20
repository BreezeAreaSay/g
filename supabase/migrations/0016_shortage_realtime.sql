-- Stage 3: live updates for the shortage/request flow and the
-- notification feed (badge counts, incoming requests) — RLS still applies.
alter publication supabase_realtime add table public.shortage_records;
alter publication supabase_realtime add table public.shortage_requests;
alter publication supabase_realtime add table public.shortage_responses;
alter publication supabase_realtime add table public.notifications;
