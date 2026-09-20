import { useTranslation } from "react-i18next";
import { DAYS_OF_WEEK } from "@/types/database";
import { useActiveWeek } from "@/hooks/useActiveWeek";
import { formatWeekRange } from "@/lib/time";

export function AdminDashboardPage() {
  const { t, i18n } = useTranslation();
  const { week } = useActiveWeek();

  return (
    <div>
      <h1 className="text-xl font-bold text-slate-900">{t("admin.nav.dashboard")}</h1>
      {week && <p className="mt-1 text-sm text-slate-500">{formatWeekRange(week, i18n.language)}</p>}

      <div className="mt-6 grid grid-cols-1 gap-3">
        {DAYS_OF_WEEK.map((dow) => (
          <div key={dow} className="rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
            <span className="text-base font-semibold text-slate-900">{t(`days.${dow}`)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
