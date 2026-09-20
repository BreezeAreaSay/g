// Builds the short title/body shown in the OS push notification, in the
// recipient's own language. Deliberately separate from src/i18n/* (which
// renders the SAME notification types for the in-app list) because this
// runs in Deno at send time for one specific recipient, not in the
// browser for whoever currently has the app open — the underlying
// `type` + `data` keys are kept the same across both so they're easy to
// keep in sync by hand.

export type Lang = "ru" | "en" | "pt";

const DAYS: Record<Lang, string[]> = {
  ru: ["понедельник", "вторник", "среду", "четверг", "пятницу", "субботу", "воскресенье"],
  en: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"],
  pt: ["segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado", "domingo"],
};

const ROLES: Record<Lang, Record<string, string>> = {
  ru: { waiter: "официант", dishwasher: "посудомойщик" },
  en: { waiter: "waiter", dishwasher: "dishwasher" },
  pt: { waiter: "garçom", dishwasher: "louceiro" },
};

function day(lang: Lang, dow: number): string {
  return DAYS[lang][dow] ?? "";
}
function role(lang: Lang, r: string): string {
  return ROLES[lang][r] ?? r;
}
function hhmm(t: string | undefined): string {
  return (t ?? "").slice(0, 5);
}

export interface PushNotificationInput {
  type: string;
  data: Record<string, unknown>;
}

export interface PushMessage {
  title: string;
  body: string;
}

const APP_NAME: Record<Lang, string> = { ru: "Расписание", en: "Schedule", pt: "Escala" };

export function buildPushMessage(n: PushNotificationInput, lang: Lang): PushMessage {
  const d = n.data ?? {};
  const dow = typeof d.day_of_week === "number" ? d.day_of_week : Number(d.day_of_week ?? 0);
  const r = String(d.role ?? "");
  const start = hhmm(d.start_time as string | undefined);
  const end = hhmm(d.end_time as string | undefined);

  switch (n.type) {
    case "employee_registered":
      return {
        title: { ru: "Новый сотрудник", en: "New employee", pt: "Novo funcionário" }[lang],
        body: { ru: `${d.name} зарегистрировался(-ась)`, en: `${d.name} just registered`, pt: `${d.name} acabou de se cadastrar` }[lang],
      };

    case "shift_saved":
      return {
        title: { ru: "Сотрудник изменил смену", en: "Employee updated a shift", pt: "Funcionário atualizou um turno" }[lang],
        body: {
          ru: `${d.employee_name}: ${day(lang, dow)}, ${start}–${end}`,
          en: `${d.employee_name}: ${day(lang, dow)}, ${start}–${end}`,
          pt: `${d.employee_name}: ${day(lang, dow)}, ${start}–${end}`,
        }[lang],
      };

    case "shift_removed":
      return {
        title: { ru: "Сотрудник убрал смену", en: "Employee removed a shift", pt: "Funcionário removeu um turno" }[lang],
        body: { ru: `${d.employee_name}: ${day(lang, dow)}`, en: `${d.employee_name}: ${day(lang, dow)}`, pt: `${d.employee_name}: ${day(lang, dow)}` }[lang],
      };

    case "shortage_detected":
      return {
        title: { ru: "Не хватает сотрудников", en: "Staff shortage", pt: "Falta de pessoal" }[lang],
        body: {
          ru: `${role(lang, r)}, ${day(lang, dow)} ${start}–${end}. Нужно ${d.required}, запланировано ${d.scheduled}.`,
          en: `${role(lang, r)}, ${day(lang, dow)} ${start}–${end}. Need ${d.required}, scheduled ${d.scheduled}.`,
          pt: `${role(lang, r)}, ${day(lang, dow)} ${start}–${end}. Necessário ${d.required}, escalado ${d.scheduled}.`,
        }[lang],
      };

    case "shortage_accepted":
      return {
        title: { ru: "Сотрудник согласился выйти", en: "Employee accepted a shift", pt: "Funcionário aceitou um turno" }[lang],
        body: {
          ru: `${d.employee_name}: ${day(lang, dow)}, ${start}–${end}`,
          en: `${d.employee_name}: ${day(lang, dow)}, ${start}–${end}`,
          pt: `${d.employee_name}: ${day(lang, dow)}, ${start}–${end}`,
        }[lang],
      };

    case "shortage_declined":
      return {
        title: { ru: "Сотрудник отказался", en: "Employee declined", pt: "Funcionário recusou" }[lang],
        body: { ru: `${d.employee_name} не может выйти`, en: `${d.employee_name} can't make it`, pt: `${d.employee_name} não pode vir` }[lang],
      };

    case "shortage_all_declined":
      return {
        title: { ru: "Все отказались", en: "Everyone declined", pt: "Todos recusaram" }[lang],
        body: {
          ru: `${day(lang, dow)}, ${start}–${end}. Никто не может выйти.`,
          en: `${day(lang, dow)}, ${start}–${end}. Nobody is available.`,
          pt: `${day(lang, dow)}, ${start}–${end}. Ninguém está disponível.`,
        }[lang],
      };

    case "shortage_request_opened":
      return {
        title: { ru: "Нужен сотрудник", en: "Staff needed", pt: "Precisa-se de funcionário" }[lang],
        body: {
          ru: `${role(lang, r)}, ${day(lang, dow)} ${start}–${end}. Не хватает ${d.needed_count}.`,
          en: `${role(lang, r)}, ${day(lang, dow)} ${start}–${end}. Short by ${d.needed_count}.`,
          pt: `${role(lang, r)}, ${day(lang, dow)} ${start}–${end}. Faltam ${d.needed_count}.`,
        }[lang],
      };

    case "shortage_request_closed":
      return {
        title: { ru: "Запрос закрыт", en: "Request closed", pt: "Solicitação encerrada" }[lang],
        body: { ru: "Сотрудник найден.", en: "A colleague has already taken it.", pt: "Já foi preenchido por um colega." }[lang],
      };

    case "attendance_clock_in":
      return {
        title: { ru: "Сотрудник пришёл", en: "Employee arrived", pt: "Funcionário chegou" }[lang],
        body: {
          ru: `${d.employee_name} пришёл(-ла) в ${d.clock_in_at_local}`,
          en: `${d.employee_name} arrived at ${d.clock_in_at_local}`,
          pt: `${d.employee_name} chegou às ${d.clock_in_at_local}`,
        }[lang],
      };

    case "attendance_clock_out":
      return {
        title: { ru: "Сотрудник закончил смену", en: "Employee clocked out", pt: "Funcionário saiu" }[lang],
        body: {
          ru: `${d.employee_name} закончил(-а) в ${d.clock_out_at_local}`,
          en: `${d.employee_name} finished at ${d.clock_out_at_local}`,
          pt: `${d.employee_name} terminou às ${d.clock_out_at_local}`,
        }[lang],
      };

    case "shift_changed_by_admin":
      return {
        title: { ru: "Администратор изменил вашу смену", en: "Admin changed your shift", pt: "Administrador alterou seu turno" }[lang],
        body: {
          ru: `${day(lang, dow)}: было ${hhmm(d.old_start_time as string)}–${hhmm(d.old_end_time as string)}, стало ${hhmm(d.new_start_time as string)}–${hhmm(d.new_end_time as string)}`,
          en: `${day(lang, dow)}: was ${hhmm(d.old_start_time as string)}–${hhmm(d.old_end_time as string)}, now ${hhmm(d.new_start_time as string)}–${hhmm(d.new_end_time as string)}`,
          pt: `${day(lang, dow)}: era ${hhmm(d.old_start_time as string)}–${hhmm(d.old_end_time as string)}, agora ${hhmm(d.new_start_time as string)}–${hhmm(d.new_end_time as string)}`,
        }[lang],
      };

    case "shift_removed_by_admin":
      return {
        title: { ru: "Администратор удалил вашу смену", en: "Admin removed your shift", pt: "Administrador removeu seu turno" }[lang],
        body: { ru: day(lang, dow), en: day(lang, dow), pt: day(lang, dow) }[lang],
      };

    case "conflict_detected":
      return {
        title: { ru: "Пересечение смен", en: "Overlapping shifts", pt: "Turnos sobrepostos" }[lang],
        body: {
          ru: `Проверьте расписание на ${day(lang, dow)}`,
          en: `Please check the schedule for ${day(lang, dow)}`,
          pt: `Verifique a escala de ${day(lang, dow)}`,
        }[lang],
      };

    default:
      return { title: APP_NAME[lang], body: n.type };
  }
}
