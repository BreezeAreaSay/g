import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { supabase } from "@/lib/supabaseClient";

interface AdminSessionState {
  status: "loading" | "signed-out" | "not-admin" | "admin";
  userId: string | null;
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
  const [userId, setUserId] = useState<string | null>(null);

  // See the identical guard in EmployeeSessionContext: onAuthStateChange's
  // own INITIAL_SESSION firing plus the direct call below can overlap, and
  // an older refresh() resolving after a newer one (or after signOut) would
  // otherwise clobber the correct status. Only the latest call may apply.
  const refreshSeq = useRef(0);

  const refresh = useCallback(async () => {
    const seq = ++refreshSeq.current;
    const { data } = await supabase.auth.getSession();
    // An admin session must be a REAL (non-anonymous) Supabase Auth user —
    // an anonymous employee session must never pass this check.
    if (!data.session || data.session.user.is_anonymous) {
      if (seq === refreshSeq.current) {
        setStatus("signed-out");
        setUserId(null);
      }
      return;
    }
    const admin = await checkIsAdmin();
    if (seq === refreshSeq.current) {
      setStatus(admin ? "admin" : "not-admin");
      setUserId(data.session.user.id);
    }
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
    refreshSeq.current += 1;
    setStatus("signed-out");
    setUserId(null);
  }, []);

  return (
    <AdminSessionContext.Provider value={{ status, userId, signIn, signOut }}>{children}</AdminSessionContext.Provider>
  );
}

export function useAdminSession(): AdminSessionState {
  const ctx = useContext(AdminSessionContext);
  if (!ctx) throw new Error("useAdminSession must be used within AdminSessionProvider");
  return ctx;
}
