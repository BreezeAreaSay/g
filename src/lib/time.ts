import type { ScheduleWeek } from "@/types/database";

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
