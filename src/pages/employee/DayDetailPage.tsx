import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useEmployeeSession } from "@/context/EmployeeSessionContext";
import { useActiveWeek } from "@/hooks/useActiveWeek";
import { useWeekShifts } from "@/hooks/useWeekShifts";
import { supabase } from "@/lib/supabaseClient";
import { EMPLOYEE_SHIFT_MAX_TIME, EMPLOYEE_SHIFT_MIN_TIME, isWithinEmployeeShiftBounds, timeStringToMinutes } from "@/lib/time";
import { TimeRangeInput } from "@/components/TimeRangeInput";
import { Button } from "@/components/Button";
import type { DayOfWeek, StaffRole } from "@/types/database";

export function DayDetailPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { dow } = useParams<{ dow: string }>();
  const dayOfWeek = Number(dow) as DayOfWeek;

  const { employee, roles } = useEmployeeSession();
  const { week } = useActiveWeek();
  const { shifts, refetch } = useWeekShifts(week?.id ?? null);

  const myShift = useMemo(
    () => shifts.find((s) => s.employee_id === employee?.id && s.day_of_week === dayOfWeek && s.source === "self"),
    [shifts, employee, dayOfWeek],
  );
  const others = useMemo(
    () => shifts.filter((s) => s.employee_id !== employee?.id && s.day_of_week === dayOfWeek),
    [shifts, employee, dayOfWeek],
  );

  const [role, setRole] = useState<StaffRole>(myShift?.role ?? roles[0] ?? "waiter");
  const [start, setStart] = useState(myShift?.start_time?.slice(0, 5) ?? EMPLOYEE_SHIFT_MIN_TIME);
  const [end, setEnd] = useState(myShift?.end_time?.slice(0, 5) ?? EMPLOYEE_SHIFT_MAX_TIME);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const valid = isWithinEmployeeShiftBounds(timeStringToMinutes(start), timeStringToMinutes(end));

  async function handleSave() {
    setError(null);
    if (!valid) {
      setError(t("dayDetail.errorInvalidRange"));
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase.rpc("save_my_shift", {
        p_day_of_week: dayOfWeek,
        p_role: role,
        p_start_time: start,
        p_end_time: end,
      });
      if (error) throw error;
      await refetch();
      navigate("/");
    } catch {
      setError(t("common.unknownError"));
    } finally {
      setSaving(false);
    }
  }

  async function handleClear() {
    setSaving(true);
    setError(null);
    try {
      const { error } = await supabase.rpc("delete_my_shift", { p_day_of_week: dayOfWeek });
      if (error) throw error;
      await refetch();
      navigate("/");
    } catch {
      setError(t("common.unknownError"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <button onClick={() => navigate("/")} className="mb-4 text-sm font-medium text-slate-500">
        ← {t("common.back")}
      </button>
      <h1 className="text-xl font-bold text-slate-900">{t(`days.${dayOfWeek}`)}</h1>

      <div className="mt-5 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        {roles.length > 1 && (
          <div className="mb-4 flex gap-3">
            {roles.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setRole(r)}
                aria-pressed={role === r}
                className={`min-h-12 flex-1 rounded-xl border px-4 text-sm font-semibold ${
                  role === r ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 bg-white text-slate-700"
                }`}
              >
                {t(`roles.${r}`)}
              </button>
            ))}
          </div>
        )}

        <TimeRangeInput start={start} end={end} onChange={(s, e) => { setStart(s); setEnd(e); }} />

        {error && <p className="mt-3 text-sm font-medium text-red-600">{error}</p>}

        <div className="mt-5 flex gap-3">
          <Button onClick={() => void handleSave()} disabled={saving}>
            {t("common.save")}
          </Button>
        </div>
        {myShift && (
          <button
            onClick={() => void handleClear()}
            disabled={saving}
            className="mt-3 w-full text-center text-sm font-medium text-red-600"
          >
            {t("dayDetail.clearShift")}
          </button>
        )}
      </div>

      <div className="mt-6">
        <h2 className="mb-2 text-sm font-semibold text-slate-500">{t("home.whoElse")}</h2>
        {others.length === 0 ? (
          <p className="text-sm text-slate-400">{t("dayDetail.noOthers")}</p>
        ) : (
          <ul className="space-y-2">
            {others
              .sort((a, b) => a.start_time.localeCompare(b.start_time))
              .map((s) => (
                <li
                  key={s.id}
                  className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3"
                >
                  <span className="font-medium text-slate-900">{s.employee_name}</span>
                  <span className="text-sm text-slate-500">
                    {t(`roles.${s.role}`)} · {s.start_time.slice(0, 5)}–{s.end_time.slice(0, 5)}
                  </span>
                </li>
              ))}
          </ul>
        )}
      </div>
    </div>
  );
}
