import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useActiveWeek } from "@/hooks/useActiveWeek";
import { useShortageRequests } from "@/hooks/useShortageRequests";
import { supabase } from "@/lib/supabaseClient";
import type { ShortageRequest, ShortageResponse, ShortageRequestStatus } from "@/types/database";

const STATUS_ORDER: ShortageRequestStatus[] = ["open", "queued", "filled", "all_declined", "cancelled"];

export function AdminRequestsPage() {
  const { t } = useTranslation();
  const { week } = useActiveWeek();
  const { requests } = useShortageRequests(week?.id ?? null);
  const [responsesByRequest, setResponsesByRequest] = useState<Record<string, (ShortageResponse & { employee_name: string })[]>>({});

  useEffect(() => {
    if (requests.length === 0) return;
    let cancelled = false;
    async function load() {
      // Admin RLS allows reading every response; join to names for display.
      const { data } = await supabase
        .from("shortage_responses")
        .select("*, employees(name)")
        .in(
          "request_id",
          requests.map((r) => r.id),
        );
      if (cancelled || !data) return;
      const grouped: Record<string, (ShortageResponse & { employee_name: string })[]> = {};
      for (const row of data as (ShortageResponse & { employees: { name: string } | null })[]) {
        const entry = { ...row, employee_name: row.employees?.name ?? "?" };
        (grouped[row.request_id] ??= []).push(entry);
      }
      setResponsesByRequest(grouped);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [requests]);

  const sorted = [...requests].sort((a, b) => {
    const byStatus = STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status);
    return byStatus !== 0 ? byStatus : a.created_at.localeCompare(b.created_at);
  });

  return (
    <div>
      <h1 className="text-xl font-bold text-slate-900">{t("admin.nav.requests")}</h1>
      {sorted.length === 0 ? (
        <p className="mt-4 text-sm text-slate-400">{t("home.noOpenRequests")}</p>
      ) : (
        <ul className="mt-4 space-y-3">
          {sorted.map((r) => (
            <RequestRow key={r.id} request={r} responses={responsesByRequest[r.id] ?? []} />
          ))}
        </ul>
      )}
    </div>
  );
}

const STATUS_STYLE: Record<ShortageRequestStatus, string> = {
  open: "bg-amber-100 text-amber-800",
  queued: "bg-slate-100 text-slate-600",
  filled: "bg-emerald-100 text-emerald-800",
  all_declined: "bg-red-100 text-red-700",
  cancelled: "bg-slate-100 text-slate-500",
};

function RequestRow({ request, responses }: { request: ShortageRequest; responses: (ShortageResponse & { employee_name: string })[] }) {
  const { t } = useTranslation();
  return (
    <li className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <span className="font-semibold text-slate-900">
          {t(`roles.${request.role}`)} · {t(`days.${request.day_of_week}`)}
        </span>
        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_STYLE[request.status]}`}>
          {t(`admin.requestStatus.${request.status}`)}
        </span>
      </div>
      <p className="mt-1 text-sm text-slate-500">
        {request.start_time.slice(0, 5)}–{request.end_time.slice(0, 5)} · {t("admin.day.people")}: {request.needed_count}
      </p>
      {responses.length > 0 && (
        <ul className="mt-2 space-y-0.5 text-sm">
          {responses.map((resp) => (
            <li key={resp.id} className={resp.led_to_shift ? "text-emerald-700" : resp.response === "declined" ? "text-red-600" : "text-slate-500"}>
              {resp.employee_name} — {resp.led_to_shift ? t("admin.requestStatus.accepted") : t(`admin.requestStatus.${resp.response}`)}
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}
