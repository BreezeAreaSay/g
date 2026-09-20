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

export interface StaffingRequirement {
  id: string;
  week_id: string;
  day_of_week: DayOfWeek;
  role: StaffRole;
  start_time: string; // "HH:MM:SS"
  end_time: string;
  required_count: number;
  created_at: string;
  updated_at: string;
}

export type ShiftSource = "self" | "admin" | "shortage_response";

export interface Shift {
  id: string;
  week_id: string;
  employee_id: string;
  role: StaffRole;
  day_of_week: DayOfWeek;
  start_time: string;
  end_time: string;
  source: ShiftSource;
  created_at: string;
  updated_at: string;
}

/** Row from the `shift_schedule` view — shift + employee name, no phone. */
export interface ShiftScheduleEntry extends Shift {
  employee_name: string;
}

export type ShortageRecordStatus = "detected" | "skipped" | "resolved";

export interface ShortageRecord {
  id: string;
  week_id: string;
  requirement_id: string;
  day_of_week: DayOfWeek;
  role: StaffRole;
  start_time: string;
  end_time: string;
  required_count: number;
  scheduled_count: number;
  status: ShortageRecordStatus;
  skipped_by: string | null;
  skipped_at: string | null;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
}

export type ShortageRequestStatus = "queued" | "open" | "filled" | "all_declined" | "cancelled";

export interface ShortageRequest {
  id: string;
  week_id: string;
  shortage_record_id: string | null;
  day_of_week: DayOfWeek;
  role: StaffRole;
  start_time: string;
  end_time: string;
  needed_count: number;
  status: ShortageRequestStatus;
  created_by: string;
  created_at: string;
  opened_at: string | null;
  closed_at: string | null;
  closed_reason: string | null;
}

export interface ShortageResponse {
  id: string;
  request_id: string;
  employee_id: string;
  response: "accepted" | "declined";
  led_to_shift: boolean;
  responded_at: string;
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
