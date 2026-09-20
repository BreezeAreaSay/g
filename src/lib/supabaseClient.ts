import { createClient } from "@supabase/supabase-js";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "./env";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    // Employees never see a login form — see getOrCreateSession() in
    // src/context/SessionContext.tsx for how anonymous sessions are created.
  },
});

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
