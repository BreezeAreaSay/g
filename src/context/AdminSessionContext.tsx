import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { supabase } from "@/lib/supabaseClient";

interface AdminSessionState {
  status: "loading" | "signed-out" | "not-admin" | "admin";
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AdminSessionContext = createContext<AdminSessionState | null>(null);

async function checkIsAdmin(): Promise<boolean> {
  const { data, error } = await supabase.rpc("is_admin");
  if (error) throw error;
  return Boolean(data);
}

export function AdminSessionProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AdminSessionState["status"]>("loading");

  const refresh = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    // An admin session must be a REAL (non-anonymous) Supabase Auth user —
    // an anonymous employee session must never pass this check.
    if (!data.session || data.session.user.is_anonymous) {
      setStatus("signed-out");
      return;
    }
    const admin = await checkIsAdmin();
    setStatus(admin ? "admin" : "not-admin");
  }, []);

  useEffect(() => {
    void refresh();
    const { data: subscription } = supabase.auth.onAuthStateChange(() => {
      void refresh();
    });
    return () => subscription.subscription.unsubscribe();
  }, [refresh]);

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    await refresh();
  }, [refresh]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setStatus("signed-out");
  }, []);

  return (
    <AdminSessionContext.Provider value={{ status, signIn, signOut }}>{children}</AdminSessionContext.Provider>
  );
}

export function useAdminSession(): AdminSessionState {
  const ctx = useContext(AdminSessionContext);
  if (!ctx) throw new Error("useAdminSession must be used within AdminSessionProvider");
  return ctx;
}
