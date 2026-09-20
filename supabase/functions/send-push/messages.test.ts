import { assert, assertEquals } from "jsr:@std/assert@1";
import { buildPushMessage, type Lang } from "./messages.ts";

const LANGS: Lang[] = ["ru", "en", "pt"];
const ALL_TYPES = [
  "employee_registered",
  "shift_saved",
  "shift_removed",
  "shortage_detected",
  "shortage_accepted",
  "shortage_declined",
  "shortage_all_declined",
  "shortage_request_opened",
  "shortage_request_closed",
  "attendance_clock_in",
  "attendance_clock_out",
  "shift_changed_by_admin",
  "shift_removed_by_admin",
  "conflict_detected",
];

const SAMPLE_DATA: Record<string, Record<string, unknown>> = {
  employee_registered: { name: "Иван", phone: "+7 900 111-11-11" },
  shift_saved: { employee_name: "Иван", day_of_week: 0, role: "waiter", start_time: "10:00", end_time: "16:00" },
  shift_removed: { employee_name: "Иван", day_of_week: 0 },
  shortage_detected: { day_of_week: 3, role: "dishwasher", start_time: "14:00", end_time: "18:00", required: 2, scheduled: 1 },
  shortage_accepted: { employee_name: "Мария", day_of_week: 3, role: "dishwasher", start_time: "14:00", end_time: "18:00" },
  shortage_declined: { employee_name: "Пётр" },
  shortage_all_declined: { day_of_week: 3, role: "dishwasher", start_time: "14:00", end_time: "18:00" },
  shortage_request_opened: { day_of_week: 3, role: "dishwasher", start_time: "14:00", end_time: "18:00", needed_count: 1 },
  shortage_request_closed: { reason: "filled" },
  attendance_clock_in: { employee_name: "Иван", clock_in_at_local: "10:07" },
  attendance_clock_out: { employee_name: "Иван", clock_out_at_local: "18:03" },
  shift_changed_by_admin: { day_of_week: 0, old_start_time: "10:00", old_end_time: "18:00", new_start_time: "10:00", new_end_time: "16:00" },
  shift_removed_by_admin: { day_of_week: 0 },
  conflict_detected: { employee_id: "x", day_of_week: 2 },
};

Deno.test("every notification type produces a non-empty title and body in every language", () => {
  for (const type of ALL_TYPES) {
    for (const lang of LANGS) {
      const msg = buildPushMessage({ type, data: SAMPLE_DATA[type] }, lang);
      assert(msg.title.length > 0, `${type}/${lang} has an empty title`);
      assert(msg.body.length > 0, `${type}/${lang} has an empty body`);
    }
  }
});

Deno.test("the exact spec §10 shortage example renders correctly in Russian", () => {
  const msg = buildPushMessage(
    { type: "shortage_detected", data: { day_of_week: 0, role: "waiter", start_time: "14:00", end_time: "18:00", required: 2, scheduled: 1 } },
    "ru",
  );
  assertEquals(msg.body, "официант, понедельник 14:00–18:00. Нужно 2, запланировано 1.");
});

Deno.test("an unknown notification type still returns something displayable, never throws", () => {
  const msg = buildPushMessage({ type: "some_future_type", data: {} }, "en");
  assert(msg.title.length > 0);
});

Deno.test("day-of-week and role are localized per language", () => {
  const ru = buildPushMessage({ type: "shortage_request_opened", data: { day_of_week: 1, role: "dishwasher", start_time: "10:00", end_time: "14:00", needed_count: 1 } }, "ru");
  const en = buildPushMessage({ type: "shortage_request_opened", data: { day_of_week: 1, role: "dishwasher", start_time: "10:00", end_time: "14:00", needed_count: 1 } }, "en");
  const pt = buildPushMessage({ type: "shortage_request_opened", data: { day_of_week: 1, role: "dishwasher", start_time: "10:00", end_time: "14:00", needed_count: 1 } }, "pt");

  assert(ru.body.includes("посудомойщик") && ru.body.includes("вторник"));
  assert(en.body.includes("dishwasher") && en.body.includes("Tuesday"));
  assert(pt.body.includes("louceiro") && pt.body.includes("terça-feira"));
});
