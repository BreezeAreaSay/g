// Hand-written mirror of the Postgres schema (supabase/migrations). We keep
// this in sync by hand rather than codegen, since the schema is small and
// this keeps the project understandable without an extra build step.

export type StaffRole = "waiter" | "dishwasher";

export const STAFF_ROLES: StaffRole[] = ["waiter", "dishwasher"];

/** 0 = Monday … 6 = Sunday, matching `staffing_requirements.day_of_week` etc. */
export type DayOfWeek = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export const DAYS_OF_WEEK: DayOfWeek[] = [0, 1, 2, 3, 4, 5, 6];

export interface ScheduleWeek {
  id: string;
  start_date: string; // ISO date, e.g. "2026-09-21"
  end_date: string;
  timezone: string; // IANA tz name, e.g. "Europe/Moscow"
  is_active: boolean;
  created_at: string;
}

export interface Employee {
  id: string;
  auth_user_id: string | null;
  name: string;
  phone: string;
  is_active: boolean;
  preferred_language: "ru" | "en" | "pt";
  created_at: string;
  updated_at: string;
}

/** Row from the phone-free `employee_roster` view — safe to show to any employee. */
export interface EmployeeRosterEntry {
  id: string;
  name: string;
  is_active: boolean;
  roles: StaffRole[];
}

export interface AdminProfile {
  user_id: string;
  display_name: string;
  created_at: string;
}

export type NotificationRecipientType = "admin" | "employee";

export interface AppNotification {
  id: string;
  created_at: string;
  recipient_type: NotificationRecipientType;
  employee_id: string | null;
  type: string;
  data: Record<string, unknown>;
  read_at: string | null;
}

export interface AuditLogEntry {
  id: string;
  occurred_at: string;
  actor_type: "employee" | "admin" | "system";
  actor_employee_id: string | null;
  actor_admin_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  old_value: Record<string, unknown> | null;
  new_value: Record<string, unknown> | null;
}
