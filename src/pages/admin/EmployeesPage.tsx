import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { supabase } from "@/lib/supabaseClient";
import type { Employee, StaffRole } from "@/types/database";

type EmployeeWithRoles = Employee & { employee_roles: { role: StaffRole }[] };

export function AdminEmployeesPage() {
  const { t, i18n } = useTranslation();
  const [employees, setEmployees] = useState<EmployeeWithRoles[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      // Admin RLS allows reading every employee row (phone included) plus
      // their roles in one query via the FK relationship.
      const { data, error } = await supabase
        .from("employees")
        .select("*, employee_roles(role)")
        .order("created_at", { ascending: false });
      if (cancelled) return;
      if (!error) setEmployees((data as EmployeeWithRoles[]) ?? []);
      setLoading(false);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) return <p className="text-sm text-slate-500">{t("common.loading")}</p>;

  if (employees.length === 0) {
    return <p className="text-sm text-slate-500">{t("admin.employees.noEmployees")}</p>;
  }

  return (
    <div>
      <h1 className="mb-4 text-xl font-bold text-slate-900">{t("admin.employees.title")}</h1>
      <ul className="space-y-3">
        {employees.map((emp) => (
          <li key={emp.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-base font-semibold text-slate-900">{emp.name}</span>
              {!emp.is_active && (
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">inactive</span>
              )}
            </div>
            <dl className="mt-2 space-y-1 text-sm text-slate-600">
              <div className="flex justify-between">
                <dt className="text-slate-400">{t("admin.employees.phone")}</dt>
                <dd className="font-medium">{emp.phone}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-400">{t("admin.employees.roles")}</dt>
                <dd className="font-medium">
                  {emp.employee_roles.map((r) => t(`roles.${r.role}`)).join(", ") || "—"}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-400">{t("admin.employees.registeredAt")}</dt>
                <dd className="font-medium">
                  {new Date(emp.created_at).toLocaleString(i18n.language, {
                    dateStyle: "short",
                    timeStyle: "short",
                  })}
                </dd>
              </div>
            </dl>
          </li>
        ))}
      </ul>
    </div>
  );
}
