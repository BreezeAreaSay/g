import type { DayOfWeek, ScheduleWeek } from "@/types/database";

/** Spec §6: the widest range an employee may self-declare. */
export const EMPLOYEE_SHIFT_MIN_TIME = "10:00";
export const EMPLOYEE_SHIFT_MAX_TIME = "22:30";
export const EMPLOYEE_SHIFT_MIN_MINUTES = timeStringToMinutes(EMPLOYEE_SHIFT_MIN_TIME);
export const EMPLOYEE_SHIFT_MAX_MINUTES = timeStringToMinutes(EMPLOYEE_SHIFT_MAX_TIME);

/** "14:05" -> 845. Accepts the "HH:MM" or "HH:MM:SS" forms Postgres `time` values come back as. */
export function timeStringToMinutes(value: string): number {
  const [h, m] = value.split(":");
  return Number(h) * 60 + Number(m);
}

/** 845 -> "14:05". */
export function minutesToTimeString(minutes: number): string {
  const h = Math.floor(minutes / 60)
    .toString()
    .padStart(2, "0");
  const m = (minutes % 60).toString().padStart(2, "0");
  return `${h}:${m}`;
}

/**
 * Which day_of_week (0=Mon..6=Sun) "today" is within this week, in the
 * RESTAURANT's own timezone (spec §35) — never the visitor's device
 * clock. Returns null if today falls outside the week's date range.
 * Mirrors the same calculation the clock_in()/clock_out() RPCs do
 * server-side (the real guard); this is only for deciding when to show
 * the button.
 */
export function todayDayOfWeek(week: ScheduleWeek): DayOfWeek | null {
  const todayInTz = new Intl.DateTimeFormat("en-CA", {
    timeZone: week.timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date()); // "en-CA" formats as YYYY-MM-DD

  const start = new Date(`${week.start_date}T00:00:00`);
  const today = new Date(`${todayInTz}T00:00:00`);
  const diffDays = Math.round((today.getTime() - start.getTime()) / 86_400_000);
  return diffDays >= 0 && diffDays <= 6 ? (diffDays as DayOfWeek) : null;
}

export function isWithinEmployeeShiftBounds(startMinutes: number, endMinutes: number): boolean {
  return (
    startMinutes >= EMPLOYEE_SHIFT_MIN_MINUTES &&
    endMinutes <= EMPLOYEE_SHIFT_MAX_MINUTES &&
    endMinutes > startMinutes
  );
}

/** Formats a week's date range for display, e.g. "21–27 сентября 2026". */
export function formatWeekRange(week: ScheduleWeek, locale: string): string {
  const start = new Date(`${week.start_date}T00:00:00`);
  const end = new Date(`${week.end_date}T00:00:00`);
  const sameMonth = start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear();

  const dayFormatter = new Intl.DateTimeFormat(locale, { day: "numeric" });
  const endFormatter = new Intl.DateTimeFormat(locale, { day: "numeric", month: "long", year: "numeric" });

  if (sameMonth) {
    return `${dayFormatter.format(start)}–${endFormatter.format(end)}`;
  }
  const startFormatter = new Intl.DateTimeFormat(locale, { day: "numeric", month: "long" });
  return `${startFormatter.format(start)} – ${endFormatter.format(end)}`;
}
