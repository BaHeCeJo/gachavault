import { describe, expect, it } from "vitest";
import {
  availabilityOf,
  currentCycleStart,
  inCurrentCycle,
  type CalendarEvent,
} from "@/lib/events";

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

// ── Current patch cycle ──────────────────────────────────────────────────────

const NOW_ISO = new Date(NOW).toISOString();

const ev = (
  slug: string,
  startDays: number,
  endDays: number | null,
  game = "honkai-star-rail",
): CalendarEvent =>
  ({
    id: slug,
    slug,
    game_slug: game,
    start_at: at(startDays),
    end_at: endDays === null ? null : at(endDays),
    server_times: [],
    featured_items: [],
  }) as unknown as CalendarEvent;

describe("currentCycleStart", () => {
  it("picks the newest version that has already started", () => {
    const versions = [ev("v1", -80, -40), ev("v2", -40, -1), ev("v3", -1, 40)];
    expect(currentCycleStart(versions, NOW_ISO)["honkai-star-rail"]).toBe(at(-1));
  });

  it("ignores versions that have not started yet", () => {
    const versions = [ev("v3", -1, 40), ev("v4", 40, 80)];
    expect(currentCycleStart(versions, NOW_ISO)["honkai-star-rail"]).toBe(at(-1));
  });

  it("tracks each game separately", () => {
    const cycles = currentCycleStart(
      [ev("hsr", -5, 30), ev("gi", -20, 20, "genshin-impact")],
      NOW_ISO,
    );
    expect(cycles).toEqual({ "honkai-star-rail": at(-5), "genshin-impact": at(-20) });
  });

  it("is empty when no version has started", () => {
    expect(currentCycleStart([ev("v4", 10, 50)], NOW_ISO)).toEqual({});
  });
});

describe("inCurrentCycle", () => {
  const cycle = { "honkai-star-rail": at(-5) };

  it("keeps an event that started this cycle", () => {
    expect(inCurrentCycle(ev("now", -2, 10), cycle, NOW_ISO)).toBe(true);
  });

  it("keeps an announced future event", () => {
    expect(inCurrentCycle(ev("soon", 20, 40), cycle, NOW_ISO)).toBe(true);
  });

  it("keeps an older event that is genuinely still running", () => {
    expect(inCurrentCycle(ev("straddler", -20, 5), cycle, NOW_ISO)).toBe(true);
  });

  it("drops an older event that has ended", () => {
    expect(inCurrentCycle(ev("done", -60, -30), cycle, NOW_ISO)).toBe(false);
  });

  // The case this exists for: the wiki publishes collaboration warps with
  // `time_end = none`, so the API never stops calling them current.
  it("drops an older open-ended event", () => {
    expect(inCurrentCycle(ev("excalibur-excelsior", -400, null), cycle, NOW_ISO)).toBe(false);
  });

  it("keeps an open-ended event that started this cycle", () => {
    expect(inCurrentCycle(ev("live", -1, null), cycle, NOW_ISO)).toBe(true);
  });

  it("keeps everything for a game with no version timeline", () => {
    expect(inCurrentCycle(ev("orphan", -400, null, "arknights"), cycle, NOW_ISO)).toBe(true);
  });
});
