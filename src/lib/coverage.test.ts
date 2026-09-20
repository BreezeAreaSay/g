import { describe, expect, it } from "vitest";
import { computeCoverage, mergeDeficitRanges, summarizeCoverage, type RequirementInterval, type ShiftInterval } from "./coverage";
import { timeStringToMinutes as t } from "./time";

function req(start: string, end: string, count: number): RequirementInterval {
  return { startMinutes: t(start), endMinutes: t(end), requiredCount: count };
}
function shift(employeeId: string, start: string, end: string): ShiftInterval {
  return { employeeId, startMinutes: t(start), endMinutes: t(end) };
}

describe("computeCoverage", () => {
  it("matches the spec's worked example exactly (partial overlap)", () => {
    const segments = computeCoverage(
      [req("14:00", "18:00", 2)],
      [shift("ivan", "10:00", "18:00"), shift("maria", "16:00", "22:30")],
    );

    expect(segments).toEqual([
      { startMinutes: t("14:00"), endMinutes: t("16:00"), required: 2, scheduled: 1, deficit: 1, surplus: 0 },
      { startMinutes: t("16:00"), endMinutes: t("18:00"), required: 2, scheduled: 2, deficit: 0, surplus: 0 },
    ]);
  });

  it("one employee fully covering a requirement of 1", () => {
    const segments = computeCoverage([req("10:00", "14:00", 1)], [shift("a", "10:00", "14:00")]);
    expect(segments).toHaveLength(1);
    expect(segments[0]).toMatchObject({ required: 1, scheduled: 1, deficit: 0 });
  });

  it("no employees scheduled at all -> full deficit", () => {
    const segments = computeCoverage([req("10:00", "14:00", 2)], []);
    expect(segments).toEqual([
      { startMinutes: t("10:00"), endMinutes: t("14:00"), required: 2, scheduled: 0, deficit: 2, surplus: 0 },
    ]);
  });

  it("more employees than required -> surplus, no deficit", () => {
    const segments = computeCoverage(
      [req("10:00", "14:00", 1)],
      [shift("a", "10:00", "14:00"), shift("b", "10:00", "14:00"), shift("c", "10:00", "14:00")],
    );
    expect(segments[0]).toMatchObject({ required: 1, scheduled: 3, deficit: 0, surplus: 2 });
  });

  it("several employees with staggered shifts covering one requirement", () => {
    const segments = computeCoverage(
      [req("10:00", "18:00", 2)],
      [shift("a", "10:00", "14:00"), shift("b", "12:00", "18:00"), shift("c", "14:00", "18:00")],
    );
    // 10-12: a only (1/2, deficit 1); 12-14: a+b (2/2); 14-18: b+c (2/2)
    expect(segments).toEqual([
      { startMinutes: t("10:00"), endMinutes: t("12:00"), required: 2, scheduled: 1, deficit: 1, surplus: 0 },
      { startMinutes: t("12:00"), endMinutes: t("14:00"), required: 2, scheduled: 2, deficit: 0, surplus: 0 },
      { startMinutes: t("14:00"), endMinutes: t("18:00"), required: 2, scheduled: 2, deficit: 0, surplus: 0 },
    ]);
  });

  it("shortage of several people at once", () => {
    const segments = computeCoverage([req("10:00", "14:00", 3)], [shift("a", "10:00", "14:00")]);
    expect(segments[0]).toMatchObject({ required: 3, scheduled: 1, deficit: 2 });
  });

  it("multiple requirement intervals in a day are evaluated independently", () => {
    const segments = computeCoverage(
      [req("10:00", "14:00", 1), req("14:00", "18:00", 3), req("18:00", "22:30", 2)],
      [shift("a", "10:00", "18:00"), shift("b", "16:00", "22:30")],
    );
    expect(segments).toEqual([
      { startMinutes: t("10:00"), endMinutes: t("14:00"), required: 1, scheduled: 1, deficit: 0, surplus: 0 },
      { startMinutes: t("14:00"), endMinutes: t("16:00"), required: 3, scheduled: 1, deficit: 2, surplus: 0 },
      { startMinutes: t("16:00"), endMinutes: t("18:00"), required: 3, scheduled: 2, deficit: 1, surplus: 0 },
      { startMinutes: t("18:00"), endMinutes: t("22:30"), required: 2, scheduled: 1, deficit: 1, surplus: 0 },
    ]);
  });

  it("overlapping requirement intervals sum their required counts", () => {
    const segments = computeCoverage(
      [req("10:00", "16:00", 1), req("14:00", "18:00", 2)],
      [shift("a", "10:00", "18:00")],
    );
    // 10-14: only the first requirement applies (1); 14-16: both apply (1+2=3); 16-18: only the second (2)
    expect(segments.map((s) => s.required)).toEqual([1, 3, 2]);
  });

  it("a shift entirely outside every requirement interval produces no segment", () => {
    const segments = computeCoverage([req("14:00", "18:00", 1)], [shift("a", "20:00", "22:00")]);
    expect(segments).toEqual([{ startMinutes: t("14:00"), endMinutes: t("18:00"), required: 1, scheduled: 0, deficit: 1, surplus: 0 }]);
  });

  it("no requirements defined -> no segments (spec §28 ⚪)", () => {
    expect(computeCoverage([], [shift("a", "10:00", "14:00")])).toEqual([]);
  });
});

describe("summarizeCoverage", () => {
  it("is 'empty' when there are no segments", () => {
    expect(summarizeCoverage([])).toBe("empty");
  });
  it("is 'shortage' when any segment has a deficit", () => {
    const segments = computeCoverage([req("10:00", "14:00", 2)], [shift("a", "10:00", "14:00")]);
    expect(summarizeCoverage(segments)).toBe("shortage");
  });
  it("is 'full' when every segment is covered", () => {
    const segments = computeCoverage([req("10:00", "14:00", 1)], [shift("a", "10:00", "14:00")]);
    expect(summarizeCoverage(segments)).toBe("full");
  });
});

describe("mergeDeficitRanges", () => {
  it("merges adjacent segments that share the same deficit size", () => {
    const segments = computeCoverage(
      [req("10:00", "18:00", 2)],
      [shift("a", "10:00", "14:00"), shift("b", "12:00", "18:00"), shift("c", "14:00", "18:00")],
    );
    // deficit only in 10-12 (1 short); rest fully covered
    expect(mergeDeficitRanges(segments)).toEqual([{ startMinutes: t("10:00"), endMinutes: t("12:00"), deficit: 1 }]);
  });

  it("drops fully-covered segments and keeps only the real shortage", () => {
    const segments = computeCoverage(
      [req("14:00", "16:00", 3), req("16:00", "18:00", 1)],
      [shift("a", "14:00", "18:00")],
    );
    // 14-16: 1/3 (deficit 2); 16-18: 1/1 (fully covered, dropped)
    expect(mergeDeficitRanges(segments)).toEqual([{ startMinutes: t("14:00"), endMinutes: t("16:00"), deficit: 2 }]);
  });
});
