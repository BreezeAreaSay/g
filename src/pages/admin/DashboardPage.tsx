import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { DAYS_OF_WEEK, STAFF_ROLES, type DayOfWeek } from "@/types/database";
import { useActiveWeek } from "@/hooks/useActiveWeek";
import { useWeekRequirements } from "@/hooks/useWeekRequirements";
import { useWeekShifts } from "@/hooks/useWeekShifts";
import { formatWeekRange, timeStringToMinutes } from "@/lib/time";
import { computeCoverage, summarizeCoverage, type DayCoverageState } from "@/lib/coverage";

const BADGE: Record<DayCoverageState, string> = { full: "🟢", shortage: "🔴", empty: "⚪" };

export function AdminDashboardPage() {
  const { t, i18n } = useTranslation();
  const { week } = useActiveWeek();
  const { requirements } = useWeekRequirements(week?.id ?? null);
  const { shifts } = useWeekShifts(week?.id ?? null);

  function coverageStateForDay(dow: DayOfWeek): DayCoverageState {
    const allSegments = STAFF_ROLES.flatMap((role) =>
      computeCoverage(
        requirements
          .filter((r) => r.day_of_week === dow && r.role === role)
          .map((r) => ({
            startMinutes: timeStringToMinutes(r.start_time),
            endMinutes: timeStringToMinutes(r.end_time),
            requiredCount: r.required_count,
          })),
        shifts
          .filter((s) => s.day_of_week === dow && s.role === role)
          .map((s) => ({
            employeeId: s.employee_id,
            startMinutes: timeStringToMinutes(s.start_time),
            endMinutes: timeStringToMinutes(s.end_time),
          })),
      ),
    );
    return summarizeCoverage(allSegments);
  }

  return (
    <div>
      <h1 className="text-xl font-bold text-slate-900">{t("admin.nav.dashboard")}</h1>
      {week && <p className="mt-1 text-sm text-slate-500">{formatWeekRange(week, i18n.language)}</p>}

      <div className="mt-6 grid grid-cols-1 gap-3">
        {DAYS_OF_WEEK.map((dow) => {
          const peopleToday = new Set(
            shifts.filter((s) => s.day_of_week === dow).map((s) => s.employee_id),
          ).size;
          return (
            <Link
              key={dow}
              to={`/admin/day/${dow}`}
              className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm active:bg-slate-50"
            >
              <div>
                <span className="text-base font-semibold text-slate-900">{t(`days.${dow}`)}</span>
                <p className="mt-0.5 text-sm text-slate-500">{t("admin.day.peopleScheduled", { count: peopleToday })}</p>
              </div>
              <span className="text-2xl">{BADGE[coverageStateForDay(dow)]}</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
