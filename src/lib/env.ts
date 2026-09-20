// Deliberately does NOT throw on a missing value: an exception thrown while
// this module is being imported would abort the whole script before
// main.tsx ever calls createRoot(...).render(...), leaving <div id="root">
// empty — a blank white screen with no clue why. Instead we export whether
// config is present, and App.tsx shows ConfigMissingScreen when it's not.
function readEnv(name: string): string {
  return (import.meta.env[name] as string | undefined) ?? "";
}

export const SUPABASE_URL = readEnv("VITE_SUPABASE_URL");
export const SUPABASE_ANON_KEY = readEnv("VITE_SUPABASE_ANON_KEY");
// Optional: push notifications (added in Stage 4) degrade gracefully without it.
export const VAPID_PUBLIC_KEY = readEnv("VITE_VAPID_PUBLIC_KEY");

export const isSupabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
