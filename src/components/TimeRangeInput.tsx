import { useTranslation } from "react-i18next";
import { EMPLOYEE_SHIFT_MAX_TIME, EMPLOYEE_SHIFT_MIN_TIME } from "@/lib/time";

interface Props {
  start: string;
  end: string;
  onChange: (start: string, end: string) => void;
}

/** Two native <input type="time"> fields — iOS/Android both render a fast, familiar wheel picker for these. */
export function TimeRangeInput({ start, end, onChange }: Props) {
  const { t } = useTranslation();
  return (
    <div className="flex items-center gap-3">
      <label className="flex-1">
        <span className="mb-1.5 block text-sm font-medium text-slate-700">{t("dayDetail.from")}</span>
        <input
          type="time"
          value={start}
          min={EMPLOYEE_SHIFT_MIN_TIME}
          max={EMPLOYEE_SHIFT_MAX_TIME}
          step={300}
          onChange={(e) => onChange(e.target.value, end)}
          className="min-h-14 w-full rounded-2xl border border-slate-300 bg-white px-4 text-base"
        />
      </label>
      <span className="mt-6 text-slate-400">–</span>
      <label className="flex-1">
        <span className="mb-1.5 block text-sm font-medium text-slate-700">{t("dayDetail.to")}</span>
        <input
          type="time"
          value={end}
          min={EMPLOYEE_SHIFT_MIN_TIME}
          max={EMPLOYEE_SHIFT_MAX_TIME}
          step={300}
          onChange={(e) => onChange(start, e.target.value)}
          className="min-h-14 w-full rounded-2xl border border-slate-300 bg-white px-4 text-base"
        />
      </label>
    </div>
  );
}
