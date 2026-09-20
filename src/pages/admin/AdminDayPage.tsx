import { useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useActiveWeek } from "@/hooks/useActiveWeek";
import { useWeekRequirements } from "@/hooks/useWeekRequirements";
import { useWeekShifts } from "@/hooks/useWeekShifts";
import { supabase } from "@/lib/supabaseClient";
import { minutesToTimeString, timeStringToMinutes } from "@/lib/time";
import { computeCoverage } from "@/lib/coverage";
import { STAFF_ROLES, type DayOfWeek, type ShiftScheduleEntry, type StaffRole, type StaffingRequirement } from "@/types/database";

function CoverageBadgeIcon({ deficit }: { deficit: number }) {
  return <span>{deficit > 0 ? "🔴" : "🟢"}</span>;
}

export function AdminDayPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { dow } = useParams<{ dow: string }>();
  const dayOfWeek = Number(dow) as DayOfWeek;

  const { week } = useActiveWeek();
  const { requirements, refetch: refetchRequirements } = useWeekRequirements(week?.id ?? null);
  const { shifts } = useWeekShifts(week?.id ?? null);

  const dayShifts = shifts.filter((s) => s.day_of_week === dayOfWeek);

  async function addRequirement(role: StaffRole) {
    if (!week) return;
    await supabase.from("staffing_requirements").insert({
      week_id: week.id,
      day_of_week: dayOfWeek,
      role,
      start_time: "10:00",
      end_time: "14:00",
      required_count: 1,
    });
    await refetchRequirements();
  }

  async function updateRequirement(id: string, patch: Partial<Pick<StaffingRequirement, "start_time" | "end_time" | "required_count">>) {
    await supabase.from("staffing_requirements").update(patch).eq("id", id);
    await refetchRequirements();
  }

  async function deleteRequirement(id: string) {
    await supabase.from("staffing_requirements").delete().eq("id", id);
    await refetchRequirements();
  }

  return (
    <div>
      <button onClick={() => navigate("/admin")} className="mb-4 text-sm font-medium text-slate-500">
        ← {t("common.back")}
      </button>
      <h1 className="text-xl font-bold text-slate-900">{t(`days.${dayOfWeek}`)}</h1>

      {STAFF_ROLES.map((role) => (
        <RoleSection
          key={role}
          role={role}
          dayOfWeek={dayOfWeek}
          requirements={requirements.filter((r) => r.day_of_week === dayOfWeek && r.role === role)}
          shifts={dayShifts.filter((s) => s.role === role)}
          onAdd={() => void addRequirement(role)}
          onUpdate={updateRequirement}
          onDelete={deleteRequirement}
        />
      ))}

      <div className="mt-8">
        <h2 className="mb-2 text-sm font-semibold text-slate-500">{t("admin.day.whoWorks")}</h2>
        {dayShifts.length === 0 ? (
          <p className="text-sm text-slate-400">{t("dayDetail.noOthers")}</p>
        ) : (
          <ul className="space-y-2">
            {[...dayShifts]
              .sort((a, b) => a.start_time.localeCompare(b.start_time))
              .map((s) => (
                <li key={s.id} className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3">
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

function RoleSection({
  role,
  requirements,
  shifts,
  onAdd,
  onUpdate,
  onDelete,
}: {
  role: StaffRole;
  dayOfWeek: DayOfWeek;
  requirements: StaffingRequirement[];
  shifts: ShiftScheduleEntry[];
  onAdd: () => void;
  onUpdate: (id: string, patch: Partial<Pick<StaffingRequirement, "start_time" | "end_time" | "required_count">>) => void;
  onDelete: (id: string) => void;
}) {
  const { t } = useTranslation();

  const segments = useMemo(
    () =>
      computeCoverage(
        requirements.map((r) => ({
          startMinutes: timeStringToMinutes(r.start_time),
          endMinutes: timeStringToMinutes(r.end_time),
          requiredCount: r.required_count,
        })),
        shifts.map((s) => ({
          employeeId: s.employee_id,
          startMinutes: timeStringToMinutes(s.start_time),
          endMinutes: timeStringToMinutes(s.end_time),
        })),
      ),
    [requirements, shifts],
  );

  return (
    <section className="mt-5 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-slate-900">{t(`roles.${role}`)}</h2>
        <button onClick={onAdd} className="text-sm font-medium text-slate-900">
          + {t("admin.day.addInterval")}
        </button>
      </div>

      {requirements.length === 0 ? (
        <p className="mt-2 text-sm text-slate-400">{t("admin.day.noRequirement")}</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {requirements
            .sort((a, b) => a.start_time.localeCompare(b.start_time))
            .map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-100 bg-slate-50 p-2.5">
                <input
                  type="time"
                  defaultValue={r.start_time.slice(0, 5)}
                  onBlur={(e) => e.target.value && onUpdate(r.id, { start_time: e.target.value })}
                  className="min-h-10 rounded-lg border border-slate-300 bg-white px-2 text-sm"
                />
                <span className="text-slate-400">–</span>
                <input
                  type="time"
                  defaultValue={r.end_time.slice(0, 5)}
                  onBlur={(e) => e.target.value && onUpdate(r.id, { end_time: e.target.value })}
                  className="min-h-10 rounded-lg border border-slate-300 bg-white px-2 text-sm"
                />
                <input
                  type="number"
                  min={0}
                  defaultValue={r.required_count}
                  onBlur={(e) => onUpdate(r.id, { required_count: Number(e.target.value) })}
                  className="min-h-10 w-16 rounded-lg border border-slate-300 bg-white px-2 text-sm"
                />
                <span className="text-xs text-slate-500">{t("admin.day.people")}</span>
                <button onClick={() => onDelete(r.id)} className="ml-auto text-sm text-red-600">
                  {t("common.delete")}
                </button>
              </li>
            ))}
        </ul>
      )}

      {segments.length > 0 && (
        <div className="mt-3 space-y-1 border-t border-slate-100 pt-3">
          {segments.map((s, i) => (
            <div key={i} className="flex items-center justify-between text-sm">
              <span className="text-slate-600">
                {minutesToTimeString(s.startMinutes)}–{minutesToTimeString(s.endMinutes)}
              </span>
              <span className="flex items-center gap-1.5 font-medium">
                {s.scheduled}/{s.required} <CoverageBadgeIcon deficit={s.deficit} />
              </span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
