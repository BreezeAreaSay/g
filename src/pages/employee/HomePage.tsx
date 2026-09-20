import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useEmployeeSession } from "@/context/EmployeeSessionContext";
import { DAYS_OF_WEEK } from "@/types/database";
import { useActiveWeek } from "@/hooks/useActiveWeek";
import { useWeekShifts } from "@/hooks/useWeekShifts";
import { formatWeekRange } from "@/lib/time";

export function HomePage() {
  const { t, i18n } = useTranslation();
  const { employee } = useEmployeeSession();
  const { week } = useActiveWeek();
  const { shifts } = useWeekShifts(week?.id ?? null);

  return (
    <div className="min-h-dvh bg-slate-50 px-4 pb-10 pt-8">
      <div className="mx-auto max-w-md">
        <h1 className="text-xl font-bold text-slate-900">
          {t("home.greeting", { name: employee?.name ?? "" })}
        </h1>
        {week && (
          <p className="mt-1 text-sm text-slate-500">
            {t("home.weekLabel")}: {formatWeekRange(week, i18n.language)}
          </p>
        )}

        <div className="mt-6 grid grid-cols-1 gap-3">
          {DAYS_OF_WEEK.map((dow) => {
            const mine = shifts.filter((s) => s.employee_id === employee?.id && s.day_of_week === dow);
            const othersCount = shifts.filter((s) => s.employee_id !== employee?.id && s.day_of_week === dow).length;

            return (
              <Link
                key={dow}
                to={`/day/${dow}`}
                className="flex min-h-20 flex-col justify-center rounded-2xl border border-slate-200 bg-white px-5 py-3 shadow-sm active:bg-slate-50"
              >
                <span className="text-base font-semibold text-slate-900">{t(`days.${dow}`)}</span>
                {mine.length === 0 ? (
                  <span className="mt-0.5 text-sm text-slate-400">{t("home.tapToSet")}</span>
                ) : (
                  <span className="mt-0.5 text-sm text-slate-600">
                    {mine
                      .map((s) => `${s.start_time.slice(0, 5)}–${s.end_time.slice(0, 5)} (${t(`roles.${s.role}`)})`)
                      .join(", ")}
                  </span>
                )}
                {othersCount > 0 && (
                  <span className="mt-0.5 text-xs text-slate-400">
                    {t("home.othersCount", { count: othersCount })}
                  </span>
                )}
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
