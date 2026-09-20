/**
 * Coverage calculation (spec §9): compares required staffing against what
 * is actually scheduled, minute by minute, for ONE day + ONE role at a
 * time. This is pure, framework-free logic so it can be unit tested
 * directly — see coverage.test.ts for the worked examples from the spec.
 */

export interface RequirementInterval {
  startMinutes: number;
  endMinutes: number;
  requiredCount: number;
}

export interface ShiftInterval {
  employeeId: string;
  startMinutes: number;
  endMinutes: number;
}

export interface CoverageSegment {
  startMinutes: number;
  endMinutes: number;
  required: number;
  scheduled: number;
  deficit: number;
  surplus: number;
}

/**
 * Returns one segment per "nothing changes" slice of time that falls
 * inside at least one requirement interval. Requirement intervals that
 * overlap are summed (e.g. two overlapping requirements needing 1 and 2
 * people mean 3 are required in the overlap) rather than rejected, since
 * the spec never says they can't overlap.
 */
export function computeCoverage(
  requirements: RequirementInterval[],
  shifts: ShiftInterval[],
): CoverageSegment[] {
  if (requirements.length === 0) return [];

  const breakpoints = new Set<number>();
  for (const r of requirements) {
    breakpoints.add(r.startMinutes);
    breakpoints.add(r.endMinutes);
  }
  for (const s of shifts) {
    for (const r of requirements) {
      if (s.startMinutes > r.startMinutes && s.startMinutes < r.endMinutes) {
        breakpoints.add(s.startMinutes);
      }
      if (s.endMinutes > r.startMinutes && s.endMinutes < r.endMinutes) {
        breakpoints.add(s.endMinutes);
      }
    }
  }

  const sorted = [...breakpoints].sort((a, b) => a - b);
  const segments: CoverageSegment[] = [];

  for (let i = 0; i < sorted.length - 1; i++) {
    const segStart = sorted[i];
    const segEnd = sorted[i + 1];
    if (segEnd <= segStart) continue;

    const covering = requirements.filter((r) => r.startMinutes <= segStart && r.endMinutes >= segEnd);
    if (covering.length === 0) continue;

    const required = covering.reduce((sum, r) => sum + r.requiredCount, 0);
    const scheduled = shifts.filter((s) => s.startMinutes <= segStart && s.endMinutes >= segEnd).length;

    segments.push({
      startMinutes: segStart,
      endMinutes: segEnd,
      required,
      scheduled,
      deficit: Math.max(0, required - scheduled),
      surplus: Math.max(0, scheduled - required),
    });
  }

  return segments;
}

export type DayCoverageState = "full" | "shortage" | "empty";

/** Rolls a set of segments (e.g. both roles of one day) up to one badge state — spec §28. */
export function summarizeCoverage(segments: CoverageSegment[]): DayCoverageState {
  if (segments.length === 0) return "empty";
  return segments.some((s) => s.deficit > 0) ? "shortage" : "full";
}

/** Merges adjacent/overlapping segments with the same deficit into contiguous ranges, for display. */
export function mergeDeficitRanges(segments: CoverageSegment[]): { startMinutes: number; endMinutes: number; deficit: number }[] {
  const deficits = segments
    .filter((s) => s.deficit > 0)
    .sort((a, b) => a.startMinutes - b.startMinutes);

  const merged: { startMinutes: number; endMinutes: number; deficit: number }[] = [];
  for (const seg of deficits) {
    const last = merged[merged.length - 1];
    if (last && last.endMinutes === seg.startMinutes && last.deficit === seg.deficit) {
      last.endMinutes = seg.endMinutes;
    } else {
      merged.push({ startMinutes: seg.startMinutes, endMinutes: seg.endMinutes, deficit: seg.deficit });
    }
  }
  return merged;
}
