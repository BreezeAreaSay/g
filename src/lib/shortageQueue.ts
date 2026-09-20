import type { StaffRole } from "@/types/database";

/**
 * Mirrors the SQL dispatch order in dispatch_next_shortage_request()
 * (`order by (role = 'dishwasher') desc, created_at asc`) as a pure,
 * independently testable function — spec §13's dishwasher-priority rule.
 */
export interface QueuedShortageRequest {
  id: string;
  role: StaffRole;
  createdAt: string; // ISO timestamp — string-sortable
}

export function selectNextToDispatch<T extends QueuedShortageRequest>(queued: T[]): T | null {
  if (queued.length === 0) return null;
  return [...queued].sort((a, b) => {
    if (a.role !== b.role) return a.role === "dishwasher" ? -1 : 1;
    return a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0;
  })[0];
}
