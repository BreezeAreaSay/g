import { describe, expect, it } from "vitest";
import { selectNextToDispatch, type QueuedShortageRequest } from "./shortageQueue";

function req(id: string, role: "waiter" | "dishwasher", createdAt: string): QueuedShortageRequest {
  return { id, role, createdAt };
}

describe("selectNextToDispatch (spec §13 dishwasher priority)", () => {
  it("returns null for an empty queue", () => {
    expect(selectNextToDispatch([])).toBeNull();
  });

  it("picks a dishwasher request over an earlier-queued waiter request", () => {
    const queue = [req("waiter-1", "waiter", "2026-09-21T10:00:00Z"), req("dw-1", "dishwasher", "2026-09-21T10:05:00Z")];
    expect(selectNextToDispatch(queue)?.id).toBe("dw-1");
  });

  it("among several dishwasher requests, picks the chronologically earliest", () => {
    const queue = [
      req("dw-2", "dishwasher", "2026-09-21T11:00:00Z"),
      req("dw-1", "dishwasher", "2026-09-21T10:00:00Z"),
      req("waiter-1", "waiter", "2026-09-21T09:00:00Z"),
    ];
    expect(selectNextToDispatch(queue)?.id).toBe("dw-1");
  });

  it("falls back to chronological order among waiters once no dishwasher request remains", () => {
    const queue = [req("waiter-2", "waiter", "2026-09-21T11:00:00Z"), req("waiter-1", "waiter", "2026-09-21T10:00:00Z")];
    expect(selectNextToDispatch(queue)?.id).toBe("waiter-1");
  });

  it("a single waiter request with no competing dishwasher request dispatches on its own", () => {
    const queue = [req("waiter-1", "waiter", "2026-09-21T10:00:00Z")];
    expect(selectNextToDispatch(queue)?.id).toBe("waiter-1");
  });
});
