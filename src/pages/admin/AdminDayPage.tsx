import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useActiveWeek } from "@/hooks/useActiveWeek";
import { useWeekRequirements } from "@/hooks/useWeekRequirements";
import { useWeekShifts } from "@/hooks/useWeekShifts";
import { useShortageRecords } from "@/hooks/useShortageRecords";
import { useShortageRequests } from "@/hooks/useShortageRequests";
import { supabase } from "@/lib/supabaseClient";
import { minutesToTimeString, timeStringToMinutes } from "@/lib/time";
import { computeCoverage } from "@/lib/coverage";
import {
  STAFF_ROLES,
  type DayOfWeek,
  type ScheduleConflict,
  type ShiftScheduleEntry,
  type ShortageRecord,
  type ShortageRequest,
  type StaffRole,
  type StaffingRequirement,
} from "@/types/database";
import { Button } from "@/components/Button";

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
  const { records: shortageRecords, refetch: refetchShortages } = useShortageRecords(week?.id ?? null);
  const { requests: shortageRequests, refetch: refetchRequests } = useShortageRequests(week?.id ?? null);

  const dayShifts = shifts.filter((s) => s.day_of_week === dayOfWeek);

  const [conflicts, setConflicts] = useState<ScheduleConflict[]>([]);
  useEffect(() => {
    if (!week) return;
    let cancelled = false;
    async function loadConflicts() {
      const { data } = await supabase
        .from("schedule_conflicts")
        .select("*")
        .eq("week_id", week!.id)
        .eq("day_of_week", dayOfWeek)
        .eq("status", "pending");
      if (!cancelled) setConflicts((data as ScheduleConflict[]) ?? []);
    }
    void loadConflicts();
    const channel = supabase
      .channel(`conflicts-${week.id}-${dayOfWeek}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "schedule_conflicts" }, () => void loadConflicts())
      .subscribe();
    return () => {
      cancelled = true;
      void supabase.removeChannel(channel);
    };
  }, [week, dayOfWeek]);

  async function confirmConflict(id: string) {
    await supabase.rpc("admin_confirm_conflict", { p_conflict_id: id });
    setConflicts((prev) => prev.filter((c) => c.id !== id));
  }

  async function updateShiftTime(shiftId: string, startTime: string, endTime: string) {
    await supabase.rpc("admin_update_shift", { p_shift_id: shiftId, p_start_time: startTime, p_end_time: endTime });
  }

  async function deleteShift(shiftId: string) {
    await supabase.rpc("admin_delete_shift", { p_shift_id: shiftId });
  }

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

  async function skipShortage(shortageRecordId: string) {
    await supabase.rpc("admin_skip_shortage", { p_shortage_record_id: shortageRecordId });
    await refetchShortages();
  }

  async function createRequest(record: ShortageRecord, startTime: string, endTime: string, neededCount: number) {
    await supabase.rpc("admin_create_shortage_request", {
      p_day_of_week: record.day_of_week,
      p_role: record.role,
      p_start_time: startTime,
      p_end_time: endTime,
      p_needed_count: neededCount,
      p_shortage_record_id: record.id,
    });
    await Promise.all([refetchRequests(), refetchShortages()]);
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
          requirements={requirements.filter((r) => r.day_of_week === dayOfWeek && r.role === role)}
          shifts={dayShifts.filter((s) => s.role === role)}
          shortageRecords={shortageRecords.filter((r) => r.day_of_week === dayOfWeek && r.role === role)}
          shortageRequests={shortageRequests.filter((r) => r.day_of_week === dayOfWeek && r.role === role)}
          onAdd={() => void addRequirement(role)}
          onUpdate={updateRequirement}
          onDelete={deleteRequirement}
          onSkip={skipShortage}
          onCreateRequest={createRequest}
        />
      ))}

      {conflicts.length > 0 && (
        <div className="mt-6 space-y-2">
          {conflicts.map((c) => (
            <div key={c.id} className="rounded-2xl border border-amber-300 bg-amber-50 p-3">
              <p className="text-sm font-semibold text-amber-900">🟡 {t("admin.day.conflictDetected")}</p>
              <button onClick={() => void confirmConflict(c.id)} className="mt-2 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white">
                {t("common.confirm")}
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="mt-8">
        <h2 className="mb-2 text-sm font-semibold text-slate-500">{t("admin.day.whoWorks")}</h2>
        {dayShifts.length === 0 ? (
          <p className="text-sm text-slate-400">{t("dayDetail.noOthers")}</p>
        ) : (
          <ul className="space-y-2">
            {[...dayShifts]
              .sort((a, b) => a.start_time.localeCompare(b.start_time))
              .map((s) => (
                <RosterRow key={s.id} shift={s} onUpdate={updateShiftTime} onDelete={deleteShift} />
              ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function RosterRow({
  shift,
  onUpdate,
  onDelete,
}: {
  shift: ShiftScheduleEntry;
  onUpdate: (shiftId: string, start: string, end: string) => void;
  onDelete: (shiftId: string) => void;
}) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState(false);
  const [start, setStart] = useState(shift.start_time.slice(0, 5));
  const [end, setEnd] = useState(shift.end_time.slice(0, 5));

  if (editing) {
    return (
      <li className="rounded-xl border border-slate-200 bg-white p-3">
        <p className="text-sm font-medium text-slate-900">{shift.employee_name}</p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <input type="time" value={start} onChange={(e) => setStart(e.target.value)} className="min-h-10 rounded-lg border border-slate-300 px-2 text-sm" />
          <span className="text-slate-400">–</span>
          <input type="time" value={end} onChange={(e) => setEnd(e.target.value)} className="min-h-10 rounded-lg border border-slate-300 px-2 text-sm" />
          <button
            onClick={() => {
              onUpdate(shift.id, start, end);
              setEditing(false);
            }}
            className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white"
          >
            {t("common.save")}
          </button>
          <button onClick={() => setEditing(false)} className="text-xs text-slate-500">
            {t("common.cancel")}
          </button>
          <button
            onClick={() => onDelete(shift.id)}
            className="ml-auto text-xs font-semibold text-red-600"
          >
            {t("common.delete")}
          </button>
        </div>
      </li>
    );
  }

  return (
    <li className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3">
      <span className="font-medium text-slate-900">{shift.employee_name}</span>
      <button onClick={() => setEditing(true)} className="text-sm text-slate-500 underline decoration-dotted">
        {t(`roles.${shift.role}`)} · {shift.start_time.slice(0, 5)}–{shift.end_time.slice(0, 5)}
        {shift.source === "shortage_response" && ` · ${t("admin.day.fromRequest")}`}
      </button>
    </li>
  );
}

function RoleSection({
  role,
  requirements,
  shifts,
  shortageRecords,
  shortageRequests,
  onAdd,
  onUpdate,
  onDelete,
  onSkip,
  onCreateRequest,
}: {
  role: StaffRole;
  requirements: StaffingRequirement[];
  shifts: ShiftScheduleEntry[];
  shortageRecords: ShortageRecord[];
  shortageRequests: ShortageRequest[];
  onAdd: () => void;
  onUpdate: (id: string, patch: Partial<Pick<StaffingRequirement, "start_time" | "end_time" | "required_count">>) => void;
  onDelete: (id: string) => void;
  onSkip: (shortageRecordId: string) => void;
  onCreateRequest: (record: ShortageRecord, startTime: string, endTime: string, neededCount: number) => void;
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
            .map((r) => {
              const record = shortageRecords.find((sr) => sr.requirement_id === r.id);
              const activeRequest = shortageRequests.find(
                (req) => req.shortage_record_id === record?.id && (req.status === "queued" || req.status === "open"),
              );
              return (
                <li key={r.id} className="rounded-xl border border-slate-100 bg-slate-50 p-2.5">
                  <div className="flex flex-wrap items-center gap-2">
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
                  </div>

                  {record && record.status === "detected" && !activeRequest && (
                    <ShortageActions record={record} onSkip={onSkip} onCreateRequest={onCreateRequest} />
                  )}
                  {record && record.status === "skipped" && (
                    <p className="mt-2 text-xs font-medium text-slate-400">{t("admin.day.skipped")}</p>
                  )}
                  {activeRequest && (
                    <p className="mt-2 text-xs font-medium text-amber-600">
                      {activeRequest.status === "open" ? t("admin.day.requestOpen") : t("admin.day.requestQueued")}
                    </p>
                  )}
                </li>
              );
            })}
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

function ShortageActions({
  record,
  onSkip,
  onCreateRequest,
}: {
  record: ShortageRecord;
  onSkip: (id: string) => void;
  onCreateRequest: (record: ShortageRecord, start: string, end: string, needed: number) => void;
}) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const [start, setStart] = useState(record.start_time.slice(0, 5));
  const [end, setEnd] = useState(record.end_time.slice(0, 5));
  const [needed, setNeeded] = useState(record.required_count - record.scheduled_count);

  if (!expanded) {
    return (
      <div className="mt-2 flex items-center gap-2">
        <span className="text-xs font-semibold text-red-600">
          {t("admin.day.shortBy", { count: record.required_count - record.scheduled_count })}
        </span>
        <button onClick={() => setExpanded(true)} className="ml-auto rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white">
          {t("admin.day.requestStaff")}
        </button>
        <button onClick={() => onSkip(record.id)} className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-600">
          {t("common.skip")}
        </button>
      </div>
    );
  }

  return (
    <div className="mt-2 space-y-2 rounded-lg bg-white p-2">
      <p className="text-xs text-slate-500">{t("admin.day.requestHint")}</p>
      <div className="flex flex-wrap items-center gap-2">
        <input type="time" value={start} onChange={(e) => setStart(e.target.value)} className="min-h-10 rounded-lg border border-slate-300 px-2 text-sm" />
        <span className="text-slate-400">–</span>
        <input type="time" value={end} onChange={(e) => setEnd(e.target.value)} className="min-h-10 rounded-lg border border-slate-300 px-2 text-sm" />
        <input
          type="number"
          min={1}
          value={needed}
          onChange={(e) => setNeeded(Number(e.target.value))}
          className="min-h-10 w-16 rounded-lg border border-slate-300 px-2 text-sm"
        />
        <span className="text-xs text-slate-500">{t("admin.day.people")}</span>
      </div>
      <div className="flex gap-2">
        <Button
          className="min-h-10 text-sm"
          onClick={() => {
            onCreateRequest(record, start, end, needed);
            setExpanded(false);
          }}
        >
          {t("admin.day.sendRequest")}
        </Button>
        <button onClick={() => setExpanded(false)} className="px-3 text-sm text-slate-500">
          {t("common.cancel")}
        </button>
      </div>
    </div>
  );
}
