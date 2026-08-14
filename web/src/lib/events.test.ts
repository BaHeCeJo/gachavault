import { describe, expect, it } from "vitest";
import { availabilityOf, type CalendarEvent } from "@/lib/events";

const NOW = new Date("2026-08-13T12:00:00Z").getTime();
const DAY = 86_400_000;
const at = (offsetDays: number) => new Date(NOW + offsetDays * DAY).toISOString();

// Only the fields availabilityOf reads; the rest of CalendarEvent is irrelevant
// to which run wins.
const run = (slug: string, startDays: number, endDays: number | null): CalendarEvent =>
  ({
    id: slug,
    slug,
    start_at: at(startDays),
    end_at: endDays === null ? null : at(endDays),
    server_times: [],
    featured_items: [],
  }) as unknown as CalendarEvent;

describe("availabilityOf", () => {
  it("returns null when the item has never been on a banner", () => {
    expect(availabilityOf([], NOW)).toBeNull();
  });

  it("prefers a live run over past and future ones", () => {
    const live = run("live", -3, 4);
    const result = availabilityOf([run("old", -60, -40), live, run("next", 30, 50)], NOW);
    expect(result).toEqual({ state: "active", run: live });
  });

  // The bug this replaced: "has the newest run ended?" answers no for a run
  // that hasn't started, so a scheduled rerun read as available now.
  it("does not treat a scheduled future run as available", () => {
    const soon = run("soon", 10, 30);
    const result = availabilityOf([soon, run("old", -60, -40)], NOW);
    expect(result?.state).toBe("upcoming");
    expect(result?.run.slug).toBe("soon");
  });

  it("picks the soonest upcoming run, not the furthest out", () => {
    const result = availabilityOf([run("later", 60, 80), run("sooner", 5, 25)], NOW);
    expect(result?.run.slug).toBe("sooner");
  });

  it("falls back to the most recently finished run", () => {
    const result = availabilityOf([run("ancient", -400, -380), run("recent", -30, -10)], NOW);
    expect(result).toMatchObject({ state: "ended" });
    expect(result?.run.slug).toBe("recent");
  });

  it("treats an open-ended run as live", () => {
    const result = availabilityOf([run("permanent", -5, null)], NOW);
    expect(result?.state).toBe("active");
    expect(result?.run.end_at).toBeNull();
  });
});
