-- Stage 4: fire the send-push Edge Function every time a row is inserted
-- into `notifications`. This keeps "decide a notification is needed"
-- (plain SQL, already covered by the Stage 1-3 tests) completely separate
-- from "actually deliver a push" (the Edge Function) — any future code
-- path that INSERTs into notifications automatically gets push for free.
--
-- supabase_functions.http_request is the same helper the Dashboard's
-- Database Webhooks UI uses under the hood, so this is equivalent to
-- creating the webhook by hand there (see README "Push-уведомления" for
-- that point-and-click alternative, e.g. if you'd rather not run this
-- migration or need to change the URL later without a new migration).
--
-- NOTE: replace YOUR_PROJECT_REF below (or set it up via the Dashboard
-- instead) — a local/CI migration run has no real project ref, so this
-- statement is wrapped to skip cleanly when supabase_functions isn't
-- present (e.g. a bare Postgres database, only a full Supabase project).
do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'supabase_functions') then
    execute $trigger$
      create trigger trg_notifications_send_push
        after insert on public.notifications
        for each row execute function supabase_functions.http_request(
          'https://YOUR_PROJECT_REF.functions.supabase.co/send-push',
          'POST',
          '{"Content-Type":"application/json"}',
          '{}',
          '5000'
        )
    $trigger$;
  end if;
end $$;
