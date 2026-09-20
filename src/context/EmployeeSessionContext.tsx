import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { supabase, ensureSession } from "@/lib/supabaseClient";
import type { Employee, StaffRole } from "@/types/database";
import { changeLanguage, type SupportedLanguage } from "@/i18n";

interface EmployeeSessionState {
  status: "loading" | "anonymous" | "registered";
  employee: Employee | null;
  register: (name: string, phone: string, roles: StaffRole[]) => Promise<void>;
  refresh: () => Promise<void>;
}

const EmployeeSessionContext = createContext<EmployeeSessionState | null>(null);

async function fetchOwnEmployee(): Promise<Employee | null> {
  // No .eq(...) filter needed: RLS already restricts a non-admin session to
  // at most their own row, so whatever comes back IS "my employee record".
  const { data, error } = await supabase.from("employees").select("*").maybeSingle();
  if (error) throw error;
  return data as Employee | null;
}

export function EmployeeSessionProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<EmployeeSessionState["status"]>("loading");
  const [employee, setEmployee] = useState<Employee | null>(null);

  const refresh = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) {
      setEmployee(null);
      setStatus("anonymous");
      return;
    }
    const own = await fetchOwnEmployee();
    setEmployee(own);
    setStatus(own ? "registered" : "anonymous");
  }, []);

  useEffect(() => {
    void refresh();
    const { data: subscription } = supabase.auth.onAuthStateChange(() => {
      void refresh();
    });
    return () => subscription.subscription.unsubscribe();
  }, [refresh]);

  const register = useCallback(async (name: string, phone: string, roles: StaffRole[]) => {
    await ensureSession();
    const lang = (localStorage.getItem("restaurant-schedule.language") as SupportedLanguage) || "ru";
    const { data, error } = await supabase.rpc("register_or_relink_employee", {
      p_name: name,
      p_phone: phone,
      p_roles: roles,
      p_preferred_language: lang,
    });
    if (error) throw error;
    setEmployee(data as Employee);
    setStatus("registered");
    await changeLanguage((data as Employee).preferred_language);
  }, []);

  return (
    <EmployeeSessionContext.Provider value={{ status, employee, register, refresh }}>
      {children}
    </EmployeeSessionContext.Provider>
  );
}

export function useEmployeeSession(): EmployeeSessionState {
  const ctx = useContext(EmployeeSessionContext);
  if (!ctx) throw new Error("useEmployeeSession must be used within EmployeeSessionProvider");
  return ctx;
}
