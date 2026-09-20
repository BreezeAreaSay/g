import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { supabase } from "@/lib/supabaseClient";
import type { Attendance, ShiftScheduleEntry } from "@/types/database";
import { Button } from "@/components/Button";

/** Spec §21-22: shown only for a shift scheduled TODAY, in the restaurant's timezone. */
export function AttendanceCard({ shift }: { shift: ShiftScheduleEntry }) {
  const { t, i18n } = useTranslation();
  const [attendance, setAttendance] = useState<Attendance | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const { data } = await supabase.from("attendance").select("*").eq("shift_id", shift.id).maybeSingle();
      if (!cancelled) setAttendance(data as Attendance | null);
    }
    void load();

    const channel = supabase
      .channel(`attendance-${shift.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "attendance", filter: `shift_id=eq.${shift.id}` }, () => void load())
      .subscribe();

    return () => {
      cancelled = true;
      void supabase.removeChannel(channel);
    };
  }, [shift.id]);

  async function handleClockIn() {
    setBusy(true);
    try {
      const { data } = await supabase.rpc("clock_in", { p_shift_id: shift.id });
      if (data) setAttendance(data as Attendance);
    } finally {
      setBusy(false);
    }
  }

  async function handleClockOut() {
    setBusy(true);
    try {
      const { data } = await supabase.rpc("clock_out", { p_shift_id: shift.id });
      if (data) setAttendance(data as Attendance);
    } finally {
      setBusy(false);
    }
  }

  const fmt = (iso: string) => new Date(iso).toLocaleTimeString(i18n.language, { hour: "2-digit", minute: "2-digit" });

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-sm font-semibold text-slate-900">
        {t("attendance.todayShift", { role: t(`roles.${shift.role}`), start: shift.start_time.slice(0, 5), end: shift.end_time.slice(0, 5) })}
      </p>

      {!attendance?.clock_in_at && (
        <Button className="mt-3" disabled={busy} onClick={() => void handleClockIn()}>
          {t("attendance.iArrived")}
        </Button>
      )}

      {attendance?.clock_in_at && !attendance.clock_out_at && (
        <>
          <p className="mt-2 text-xs text-slate-500">{t("attendance.arrivedAt", { time: fmt(attendance.clock_in_at) })}</p>
          <Button className="mt-2" variant="secondary" disabled={busy} onClick={() => void handleClockOut()}>
            {t("attendance.iFinished")}
          </Button>
        </>
      )}

      {attendance?.clock_in_at && attendance.clock_out_at && (
        <p className="mt-2 text-xs font-medium text-emerald-600">
          {t("attendance.summary", { start: fmt(attendance.clock_in_at), end: fmt(attendance.clock_out_at) })}
        </p>
      )}
    </div>
  );
}
