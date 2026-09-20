import { createClient } from "@supabase/supabase-js";
import { isSupabaseConfigured, SUPABASE_ANON_KEY, SUPABASE_URL } from "./env";

// createClient() validates its URL argument immediately and throws on an
// empty string — which, at module-import time, would blank the whole app
// the same way the old env.ts throw did (see the comment there). When not
// configured, App.tsx shows ConfigMissingScreen before anything ever calls
// `supabase`, so this placeholder is constructed but never actually used.
export const supabase = createClient(
  isSupabaseConfigured ? SUPABASE_URL : "https://placeholder.invalid",
  isSupabaseConfigured ? SUPABASE_ANON_KEY : "placeholder-anon-key",
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      // Employees never see a login form — see getOrCreateSession() in
      // src/context/SessionContext.tsx for how anonymous sessions are created.
    },
  },
);

/**
 * Ensures the browser has SOME Supabase Auth session (anonymous is fine)
 * before any RLS-protected call. Anonymous sign-ins must be enabled on the
 * Supabase project — see README "Настройка Supabase" — otherwise this
 * throws and the UI shows register.errorAuthUnavailable.
 */
export async function ensureSession() {
  const { data } = await supabase.auth.getSession();
  if (data.session) return data.session;

  const { data: signInData, error } = await supabase.auth.signInAnonymously();
  if (error) throw error;
  return signInData.session;
}
