import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { supabase, ensureSession } from "@/lib/supabaseClient";
import type { Employee, StaffRole } from "@/types/database";
import { changeLanguage, type SupportedLanguage } from "@/i18n";

interface EmployeeSessionState {
  status: "loading" | "anonymous" | "registered";
  employee: Employee | null;
  roles: StaffRole[];
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

async function fetchOwnRoles(employeeId: string): Promise<StaffRole[]> {
  const { data, error } = await supabase.from("employee_roles").select("role").eq("employee_id", employeeId);
  if (error) throw error;
  return (data ?? []).map((r) => r.role as StaffRole);
}

export function EmployeeSessionProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<EmployeeSessionState["status"]>("loading");
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [roles, setRoles] = useState<StaffRole[]>([]);

  // onAuthStateChange fires its own INITIAL_SESSION event right after the
  // effect below subscribes, on top of the direct call — and can fire again
  // mid-flight (e.g. a token refresh). Two overlapping refreshes can resolve
  // out of order, so a stale one applying last could flip a registered
  // employee back to "anonymous" (bounced to the welcome screen) for no
  // real reason. This sequence guard drops every response but the latest.
  const refreshSeq = useRef(0);

  const refresh = useCallback(async () => {
    const seq = ++refreshSeq.current;
    const { data } = await supabase.auth.getSession();
    if (!data.session) {
      if (seq === refreshSeq.current) {
        setEmployee(null);
        setRoles([]);
        setStatus("anonymous");
      }
      return;
    }
    const own = await fetchOwnEmployee();
    const ownRoles = own ? await fetchOwnRoles(own.id) : [];
    if (seq === refreshSeq.current) {
      setEmployee(own);
      setRoles(ownRoles);
      setStatus(own ? "registered" : "anonymous");
    }
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
    // Bump the sequence so a refresh() already in flight from the SIGNED_IN
    // event ensureSession() just triggered — which may have started before
    // this RPC's insert was visible and so resolved with "no employee yet"
    // — can't land after us and flip status back to "anonymous".
    refreshSeq.current += 1;
    setEmployee(data as Employee);
    setRoles(roles);
    setStatus("registered");
    await changeLanguage((data as Employee).preferred_language);
  }, []);

  return (
    <EmployeeSessionContext.Provider value={{ status, employee, roles, register, refresh }}>
      {children}
    </EmployeeSessionContext.Provider>
  );
}

export function useEmployeeSession(): EmployeeSessionState {
  const ctx = useContext(EmployeeSessionContext);
  if (!ctx) throw new Error("useEmployeeSession must be used within EmployeeSessionProvider");
  return ctx;
}
