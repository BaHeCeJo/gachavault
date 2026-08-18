import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { Scaling } from "./skillScaling";
import {
  extractScalingRuns,
  hasTokens,
  renderTemplate,
  splitValues,
  tokenizedScalings,
  valueAt,
} from "./skillScaling";

describe("splitValues", () => {
  it("accepts slash-separated wiki data and comma-separated dumps alike", () => {
    expect(splitValues("12/14/16/18/20%")).toEqual(["12", "14", "16", "18", "20%"]);
    expect(splitValues("12%, 14%, 16%")).toEqual(["12%", "14%", "16%"]);
  });

  it("drops blanks from a trailing separator", () => {
    expect(splitValues("12, 14, ")).toEqual(["12", "14"]);
  });
});

describe("extractScalingRuns", () => {
  it("lifts both runs out of an HSR light cone effect and names them", () => {
    const src =
      "Increases the wearer's CRIT Rate by 12/14/16/18/20%. The Ultimate DMG and Follow-up ATK DMG dealt by the wearer increase by 24/28/32/36/40%.";
    const { text, scalings } = extractScalingRuns(src);

    expect(scalings).toHaveLength(2);
    expect(scalings[0].label).toBe("CRIT Rate");
    expect(scalings[0].values).toEqual(["12%", "14%", "16%", "18%", "20%"]);
    expect(scalings[1].values).toEqual(["24%", "28%", "32%", "36%", "40%"]);
    // Only the run of numbers becomes a token — the sentence around it survives
    // untouched, so the text still reads the way the game states it.
    expect(text).toBe(
      "Increases the wearer's CRIT Rate by {crit_rate}. The Ultimate DMG and Follow-up ATK DMG dealt by the wearer increase by {follow_up_atk_dmg}.",
    );
  });

  it("applies a trailing percent across the whole run", () => {
    const { scalings } = extractScalingRuns("ATK increased by 8/10/12/14/16%.");
    expect(scalings[0].values).toEqual(["8%", "10%", "12%", "14%", "16%"]);
  });

  it("leaves per-value units alone when they are already written out", () => {
    const { scalings } = extractScalingRuns("deals 156.8%/168.5%/180.2% of ATK as DMG.");
    expect(scalings[0].values).toEqual(["156.8%", "168.5%", "180.2%"]);
  });

  it("names a Genshin-style talent line from the stat that follows the values", () => {
    const { text, scalings } = extractScalingRuns(
      "Deals 100.8%/109.4%/118.1%/130.5%/139.1% of ATK as Pyro DMG.",
    );
    expect(scalings[0].values).toHaveLength(5);
    // "Deals" is a verb, not a stat, so the label comes from the other side.
    expect(scalings[0].label).toBe("ATK");
    expect(text).toBe("Deals {atk} of ATK as Pyro DMG.");
  });

  it("ignores short numeric runs that are prose, not scalings", () => {
    const src = "Available 24/7 during the event.";
    const { text, scalings } = extractScalingRuns(src);
    expect(scalings).toHaveLength(0);
    expect(text).toBe(src);
  });

  it("falls back to a positional token when two runs would slug the same", () => {
    const { text, scalings } = extractScalingRuns(
      "CRIT Rate 1/2/3/4/5%. CRIT Rate 6/7/8/9/10%.",
    );
    expect(scalings).toHaveLength(2);
    // Both runs name the same stat, so the second cannot reuse {crit_rate} —
    // it would resolve to the first scaling's values.
    expect(text).toBe("CRIT Rate {crit_rate}. CRIT Rate {2}.");
  });

  it("returns the description untouched when there is nothing to lift", () => {
    const src = "Immediately recovers 1 Skill Point.";
    expect(extractScalingRuns(src)).toEqual({ text: src, scalings: [] });
  });
});

describe("valueAt", () => {
  const scaling = { label: "CRIT Rate", values: ["12%", "14%", "16%"] };

  it("indexes by level", () => {
    expect(valueAt(scaling, 0)).toBe("12%");
    expect(valueAt(scaling, 2)).toBe("16%");
  });

  it("clamps a short value list to its last entry instead of blanking", () => {
    expect(valueAt(scaling, 9)).toBe("16%");
  });

  it("is empty for a scaling with no values", () => {
    expect(valueAt({ label: "x", values: [] }, 0)).toBe("");
    expect(valueAt(undefined, 0)).toBe("");
  });
});

describe("renderTemplate", () => {
  const scalings = [
    { label: "CRIT Rate", values: ["12%", "14%", "16%", "18%", "20%"] },
    { label: "Ultimate DMG", values: ["24%", "28%", "32%", "36%", "40%"] },
  ];

  it("splices superimposition 1 values into the sentence", () => {
    const parts = renderTemplate(
      "Increases the wearer's CRIT Rate by {crit_rate}. Ultimate DMG increases by {ultimate_dmg}.",
      scalings,
      0,
    );
    expect(parts.map((p) => p.text).join("")).toBe(
      "Increases the wearer's CRIT Rate by 12%. Ultimate DMG increases by 24%.",
    );
    expect(parts.filter((p) => p.kind === "value").map((p) => p.text)).toEqual(["12%", "24%"]);
  });

  it("splices the top level from the same template", () => {
    const parts = renderTemplate("CRIT Rate by {crit_rate}.", scalings, 4);
    expect(parts.map((p) => p.text).join("")).toBe("CRIT Rate by 20%.");
  });

  it("resolves 1-based positional tokens", () => {
    const parts = renderTemplate("{1} and {2}", scalings, 1);
    expect(parts.map((p) => p.text).join("")).toBe("14% and 28%");
  });

  it("leaves an unresolvable token visible so the typo is findable", () => {
    const parts = renderTemplate("Boosts {crit_rat} a lot.", scalings, 0);
    expect(parts.map((p) => p.text).join("")).toBe("Boosts {crit_rat} a lot.");
    expect(parts.every((p) => p.kind === "text")).toBe(true);
  });

  it("passes through a description with no tokens at all", () => {
    const parts = renderTemplate("Recovers 1 Skill Point.", scalings, 0);
    expect(parts).toEqual([{ kind: "text", text: "Recovers 1 Skill Point." }]);
  });
});

describe("hasTokens", () => {
  it("detects a token and is repeatable across calls", () => {
    expect(hasTokens("by {crit_rate}")).toBe(true);
    expect(hasTokens("by {crit_rate}")).toBe(true);
  });

  it("is false for plain prose", () => {
    expect(hasTokens("Increases CRIT Rate.")).toBe(false);
  });
});

describe("regex state is not shared between calls", () => {
  const scalings = [{ label: "CRIT Rate", values: ["12%", "20%"] }];

  // A shared global regex carries `lastIndex` across `.test()` and `matchAll`,
  // which made a preceding hasTokens() call skip the first token here.
  it("resolves the first token even after hasTokens has scanned the same text", () => {
    const text = "CRIT Rate by {crit_rate}.";
    expect(hasTokens(text)).toBe(true);
    expect(renderTemplate(text, scalings, 0).map((p) => p.text).join("")).toBe("CRIT Rate by 12%.");
    expect(tokenizedScalings(text, scalings)).toEqual(new Set([0]));
  });

  it("extracts the first run on a repeated call", () => {
    const src = "CRIT Rate by 12/14/16/18/20%.";
    expect(extractScalingRuns(src).scalings).toHaveLength(1);
    expect(extractScalingRuns(src).scalings).toHaveLength(1);
  });
});

describe("tokenizedScalings", () => {
  const scalings = [
    { label: "CRIT Rate", values: ["12%"] },
    { label: "Ultimate DMG", values: ["24%"] },
  ];

  it("reports only the scalings spliced into the text", () => {
    expect(tokenizedScalings("by {crit_rate}", scalings)).toEqual(new Set([0]));
  });

  it("is empty when the description places no tokens", () => {
    expect(tokenizedScalings("plain text", scalings)).toEqual(new Set());
  });
});

describe("round trip", () => {
  it("paste, extract, then render reproduces the sentence at each level", () => {
    const src = "Increases the wearer's CRIT Rate by 12/14/16/18/20%.";
    const { text, scalings } = extractScalingRuns(src);

    expect(renderTemplate(text, scalings, 0).map((p) => p.text).join("")).toBe(
      "Increases the wearer's CRIT Rate by 12%.",
    );
    expect(renderTemplate(text, scalings, 4).map((p) => p.text).join("")).toBe(
      "Increases the wearer's CRIT Rate by 20%.",
    );
  });
});

// Shared with the Python importer (make_hsr_light_cones.py), which extracts the
// same runs offline for bulk seeding. Both read this file, so a change to the
// heuristic on one side fails loudly on the other instead of quietly producing
// different tokens for the same effect text.
describe("shared extraction fixtures", () => {
  // Relative to the vitest cwd (web/), so the repo-root seed_data is one up.
  const fixtures = JSON.parse(
    readFileSync("../seed_data/scaling_extraction_fixtures.json", "utf8"),
  ) as { cases: { description: string; expected: { text: string; scalings: Scaling[] } }[] };

  it("covers the shapes the light cone catalog actually contains", () => {
    expect(fixtures.cases.length).toBeGreaterThanOrEqual(8);
  });

  for (const c of fixtures.cases) {
    it(`matches: ${c.description.slice(0, 60)}…`, () => {
      expect(extractScalingRuns(c.description)).toEqual(c.expected);
    });
  }
});
