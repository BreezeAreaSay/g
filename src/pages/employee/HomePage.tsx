import { useTranslation } from "react-i18next";
import { useEmployeeSession } from "@/context/EmployeeSessionContext";
import { DAYS_OF_WEEK } from "@/types/database";
import { useActiveWeek } from "@/hooks/useActiveWeek";
import { formatWeekRange } from "@/lib/time";

export function HomePage() {
  const { t, i18n } = useTranslation();
  const { employee } = useEmployeeSession();
  const { week } = useActiveWeek();

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
          {DAYS_OF_WEEK.map((dow) => (
            <div
              key={dow}
              className="flex min-h-20 flex-col justify-center rounded-2xl border border-slate-200 bg-white px-5 py-3 shadow-sm"
            >
              <span className="text-base font-semibold text-slate-900">{t(`days.${dow}`)}</span>
              <span className="mt-0.5 text-sm text-slate-400">{t("home.tapToSet")}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
