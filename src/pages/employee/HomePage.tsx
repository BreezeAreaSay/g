import { useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useEmployeeSession } from "@/context/EmployeeSessionContext";
import { DAYS_OF_WEEK } from "@/types/database";
import { useActiveWeek } from "@/hooks/useActiveWeek";
import { useWeekShifts } from "@/hooks/useWeekShifts";
import { useShortageRequests } from "@/hooks/useShortageRequests";
import { formatWeekRange, todayDayOfWeek } from "@/lib/time";
import { supabase } from "@/lib/supabaseClient";
import { enablePushForEmployee } from "@/lib/push";
import { NotificationPermissionBanner } from "@/components/NotificationPermissionBanner";
import { AttendanceCard } from "@/components/AttendanceCard";

export function HomePage() {
  const { t, i18n } = useTranslation();
  const { employee } = useEmployeeSession();
  const { week } = useActiveWeek();
  const { shifts, refetch: refetchShifts } = useWeekShifts(week?.id ?? null);
  const { requests, myResponses, refetch: refetchRequests } = useShortageRequests(week?.id ?? null);

  const todayDow = week ? todayDayOfWeek(week) : null;
  const todaysShifts = shifts.filter((s) => s.employee_id === employee?.id && s.day_of_week === todayDow);

  const openRequests = requests.filter((r) => r.status === "open" && !myResponses.some((resp) => resp.request_id === r.id));

  async function respond(requestId: string, response: "accepted" | "declined") {
    const { data } = await supabase.rpc("respond_to_shortage_request", { p_request_id: requestId, p_response: response });
    await Promise.all([refetchRequests(), refetchShifts()]);
    return data as { status: string } | null;
  }

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

        {employee && (
          <div className="mt-4">
            <NotificationPermissionBanner onEnable={() => enablePushForEmployee(employee.id)} />
          </div>
        )}

        {todaysShifts.length > 0 && (
          <div className="mt-5 space-y-3">
            {todaysShifts.map((s) => (
              <AttendanceCard key={s.id} shift={s} />
            ))}
          </div>
        )}

        {openRequests.length > 0 && (
          <div className="mt-5 space-y-3">
            {openRequests.map((r) => (
              <ShortageRequestCard key={r.id} request={r} onRespond={respond} />
            ))}
          </div>
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

function ShortageRequestCard({
  request,
  onRespond,
}: {
  request: { id: string; day_of_week: number; role: string; start_time: string; end_time: string };
  onRespond: (id: string, response: "accepted" | "declined") => Promise<{ status: string } | null>;
}) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<"already_closed" | null>(null);

  async function handle(response: "accepted" | "declined") {
    setBusy(true);
    try {
      const outcome = await onRespond(request.id, response);
      if (outcome?.status === "already_closed") {
        setResult("already_closed");
      }
    } finally {
      setBusy(false);
    }
  }

  if (result === "already_closed") {
    return (
      <div className="rounded-2xl border border-slate-200 bg-slate-100 p-4 text-sm text-slate-500">
        {t("home.requestTaken")}
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4">
      <p className="text-sm font-semibold text-amber-900">
        {t("home.urgentNeed", {
          role: t(`roles.${request.role}`),
          day: t(`days.${request.day_of_week}`),
          start: request.start_time.slice(0, 5),
          end: request.end_time.slice(0, 5),
        })}
      </p>
      <div className="mt-3 flex gap-3">
        <button
          disabled={busy}
          onClick={() => void handle("accepted")}
          className="min-h-12 flex-1 rounded-xl bg-emerald-600 text-sm font-semibold text-white active:bg-emerald-700"
        >
          {t("home.iWillCome")}
        </button>
        <button
          disabled={busy}
          onClick={() => void handle("declined")}
          className="min-h-12 flex-1 rounded-xl border border-slate-300 bg-white text-sm font-semibold text-slate-700"
        >
          {t("home.iCannot")}
        </button>
      </div>
    </div>
  );
}
