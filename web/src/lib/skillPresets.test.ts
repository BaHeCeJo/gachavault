import { describe, expect, it } from "vitest";
import { defaultTickOf, resolveTicks, skillPresetFor, trackFor } from "./skillPresets";

describe("skillPresetFor", () => {
  it("matches on slug and on display name", () => {
    expect(skillPresetFor("honkai-star-rail").tracks.some((t) => t.key === "memo")).toBe(true);
    expect(skillPresetFor(undefined, "Zenless Zone Zero").tracks.some((t) => t.key === "core")).toBe(true);
  });

  it("prefers Endfield over plain Arknights", () => {
    expect(skillPresetFor("arknights-endfield").types).toContain("Combo Skill");
    expect(skillPresetFor("arknights").types).toContain("Module");
  });

  it("falls back for an unknown game and still offers a track", () => {
    const preset = skillPresetFor("some-new-gacha");
    expect(preset.tracks).toHaveLength(1);
    expect(preset.tracks[0].ticks).toHaveLength(10);
  });

  it("gives every game at least one track", () => {
    for (const slug of ["honkai-star-rail", "genshin-impact", "zenless-zone-zero", "goddess-of-victory-nikke", "arknights-endfield", "wuthering-waves", "arknights"]) {
      expect(skillPresetFor(slug).tracks.length).toBeGreaterThan(0);
    }
  });
});

describe("track tick labels", () => {
  it("numbers HSR skills but prefixes light cone superimposition", () => {
    const tracks = skillPresetFor("honkai-star-rail").tracks;
    expect(trackFor(tracks, undefined, "Skill")?.ticks).toEqual(["1", "2", "3", "4", "5", "6", "7", "8", "9", "10"]);
    expect(trackFor(tracks, undefined, "Light Cone Effect")?.ticks).toEqual(["S1", "S2", "S3", "S4", "S5"]);
  });

  it("grades ZZZ core passives by letter", () => {
    const track = trackFor(skillPresetFor("zenless-zone-zero").tracks, undefined, "Core Skill");
    expect(track?.label).toBe("Core");
    expect(track?.ticks).toEqual(["A", "B", "C", "D", "E", "F"]);
  });

  it("runs an Arknights skill numerically and then into masteries", () => {
    const track = trackFor(skillPresetFor("arknights").tracks, undefined, "Skill 2");
    expect(track?.ticks).toEqual(["1", "2", "3", "4", "5", "6", "7", "M1", "M2", "M3"]);
  });
});

describe("trackFor", () => {
  const tracks = skillPresetFor("honkai-star-rail").tracks;

  it("infers the track from the ability type", () => {
    expect(trackFor(tracks, undefined, "Basic ATK")?.key).toBe("basic");
    expect(trackFor(tracks, undefined, "Memosprite Skill")?.key).toBe("memo");
    expect(trackFor(tracks, undefined, "Ultimate")?.key).toBe("skill");
  });

  it("matches the type case-insensitively", () => {
    expect(trackFor(tracks, undefined, "basic atk")?.key).toBe("basic");
  });

  it("lets an explicit track key win over the type", () => {
    expect(trackFor(tracks, "superimposition", "Skill")?.key).toBe("superimposition");
  });

  it("ignores an explicit key that names no known track", () => {
    expect(trackFor(tracks, "nonsense", "Basic ATK")?.key).toBe("basic");
  });

  it("falls back to the first track for an unrecognised type", () => {
    expect(trackFor(tracks, undefined, "Something New")?.key).toBe("skill");
    expect(trackFor(tracks, undefined, undefined)?.key).toBe("skill");
  });

  it("returns undefined when a game declares no tracks", () => {
    expect(trackFor([], undefined, "Skill")).toBeUndefined();
  });
});

describe("resolveTicks", () => {
  const track = { key: "skill", label: "Lv", ticks: ["1", "2", "3", "4", "5"] };

  it("trims to the number of values an ability actually has", () => {
    // A Basic ATK that maxes early shows its own stops, not the track's.
    expect(resolveTicks(track, 3)).toEqual(["1", "2", "3"]);
  });

  it("extends past the preset when the data carries more levels", () => {
    // The preset is a default, not the truth — extra values stay reachable.
    expect(resolveTicks(track, 7)).toEqual(["1", "2", "3", "4", "5", "6", "7"]);
  });

  it("keeps non-numeric labels while extending", () => {
    const ak = { key: "skill", label: "Lv", ticks: ["1", "2", "M1"] };
    expect(resolveTicks(ak, 4)).toEqual(["1", "2", "M1", "4"]);
  });

  it("is empty for an ability with no values", () => {
    expect(resolveTicks(track, 0)).toEqual([]);
    expect(resolveTicks(undefined, 0)).toEqual([]);
  });

  it("numbers the stops when there is no track at all", () => {
    expect(resolveTicks(undefined, 3)).toEqual(["1", "2", "3"]);
  });
});

describe("defaultTickOf", () => {
  it("opens gear tracks at the first tick", () => {
    // Almost every reader holds a light cone at S1, so opening at S5 would
    // quote numbers hardly anyone has.
    const hsr = skillPresetFor("honkai-star-rail").tracks;
    const superimp = trackFor(hsr, "superimposition");
    expect(defaultTickOf(superimp, 5)).toBe(1);

    const zzz = trackFor(skillPresetFor("zenless-zone-zero").tracks, "engine");
    expect(defaultTickOf(zzz, 5)).toBe(1);
  });

  it("opens a character's kit at max level", () => {
    const hsr = skillPresetFor("honkai-star-rail").tracks;
    expect(defaultTickOf(trackFor(hsr, undefined, "Ultimate"), 10)).toBe(10);
    expect(defaultTickOf(trackFor(hsr, undefined, "Basic ATK"), 7)).toBe(7);
  });

  it("clamps a default beyond the ticks the data actually has", () => {
    expect(defaultTickOf({ key: "k", label: "L", ticks: ["1"], defaultTick: 9 }, 1)).toBe(1);
    expect(defaultTickOf({ key: "k", label: "L", ticks: [], defaultTick: 0 }, 3)).toBe(1);
  });

  it("is zero when there are no ticks", () => {
    expect(defaultTickOf(undefined, 0)).toBe(0);
  });
});

describe("track labels", () => {
  it("names prefixed tracks in full rather than repeating the tick letter", () => {
    // The ticks already read S1..S5, so a bare "S" beside them said nothing.
    const superimp = trackFor(skillPresetFor("honkai-star-rail").tracks, "superimposition");
    expect(superimp?.label).toBe("Superimposition");
    expect(superimp?.ticks[0]).toBe("S1");
  });
});
