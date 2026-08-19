import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { ItemPageBundle } from "@/lib/seo";
import { SkillsBlock } from "./SkillsBlock";

// The block reads `item.data` plus the game slug (to pick the level-track
// preset), so a bundle stub keeps the fixtures to the part under test.
function bundleWith(kit: unknown, gameSlug?: string): ItemPageBundle {
  return { item: { data: { kit }, game_slug: gameSlug } } as unknown as ItemPageBundle;
}

const LIGHT_CONE_EFFECT = {
  type: "Passive",
  name: "Wheat Dream in the Ripples",
  description:
    "Increases the wearer's CRIT Rate by {crit_rate}. The Ultimate DMG and Follow-up ATK DMG dealt by the wearer increase by {ult_dmg}.",
  scalings: [
    { label: "CRIT Rate", values: ["12%", "14%", "16%", "18%", "20%"] },
    { label: "Ult DMG", values: ["24%", "28%", "32%", "36%", "40%"] },
  ],
};

function renderKit(kit: unknown, gameSlug?: string) {
  return render(<SkillsBlock config={{ list_field: "kit" }} bundle={bundleWith(kit, gameSlug)} />);
}

// Shaped like a memosprite character (Hyacine, Castorice, Aglaea): the Skill
// runs to 10, the Basic ATK stops at 7, and the memosprite is its own kit.
const MEMOSPRITE_KIT = [
  {
    type: "Basic ATK",
    name: "Basic",
    description: "Deals DMG equal to {dmg} of ATK.",
    scalings: [{ label: "DMG", values: ["50%", "60%", "70%", "80%", "90%", "100%", "110%"] }],
  },
  {
    type: "Skill",
    name: "Skill",
    description: "Heals for {heal} of ATK.",
    scalings: [{ label: "Heal", values: ["1%", "2%", "3%", "4%", "5%", "6%", "7%", "8%", "9%", "10%"] }],
  },
  {
    type: "Memosprite Skill",
    group: "Memosprite",
    name: "Ica's Skill",
    description: "Restores {restore} HP.",
    scalings: [{ label: "Restore", values: ["11%", "12%", "13%", "14%", "15%", "16%", "17%", "18%", "19%", "20%"] }],
  },
];

describe("SkillsBlock", () => {
  it("splices the top-level values into the sentence by default", () => {
    renderKit([LIGHT_CONE_EFFECT]);

    // The slider starts maxed, so a light cone reads at superimposition 5.
    expect(screen.getByText(/Increases the wearer's CRIT Rate by/)).toBeInTheDocument();
    expect(screen.getByText("20%")).toBeInTheDocument();
    expect(screen.getByText("40%")).toBeInTheDocument();
  });

  it("re-splices every value when the level changes", () => {
    renderKit([LIGHT_CONE_EFFECT]);

    fireEvent.change(screen.getByRole("slider"), { target: { value: "1" } });

    expect(screen.getByText("12%")).toBeInTheDocument();
    expect(screen.getByText("24%")).toBeInTheDocument();
    expect(screen.queryByText("20%")).not.toBeInTheDocument();
  });

  it("does not repeat an inlined scaling as a row underneath", () => {
    renderKit([LIGHT_CONE_EFFECT]);

    // Both scalings are spliced into the text, so neither label is listed.
    expect(screen.queryByText("CRIT Rate")).not.toBeInTheDocument();
    expect(screen.queryByText("Ult DMG")).not.toBeInTheDocument();
  });

  it("still lists a scaling whose token was never placed in the text", () => {
    renderKit([
      {
        name: "Partly tokenized",
        description: "CRIT Rate rises by {crit_rate}.",
        scalings: [
          { label: "CRIT Rate", values: ["12%", "20%"] },
          { label: "Energy Regen", values: ["4%", "8%"] },
        ],
      },
    ]);

    expect(screen.getByText("Energy Regen")).toBeInTheDocument();
    expect(screen.queryByText("CRIT Rate")).not.toBeInTheDocument();
  });

  it("keeps the label/value list for descriptions with no tokens", () => {
    renderKit([
      {
        name: "Untokenized",
        description: "Increases the wearer's CRIT Rate.",
        scalings: [{ label: "CRIT Rate", values: ["12%", "20%"] }],
      },
    ]);

    expect(screen.getByText("CRIT Rate")).toBeInTheDocument();
    expect(screen.getByText("20%")).toBeInTheDocument();
  });

  it("shows every level in the table view, inlined scalings included", () => {
    renderKit([LIGHT_CONE_EFFECT]);

    fireEvent.click(screen.getByRole("button", { name: "All levels" }));

    expect(screen.getByText("CRIT Rate")).toBeInTheDocument();
    expect(screen.getByText("Ult DMG")).toBeInTheDocument();
    // Every level is a column, including ones the slider isn't sitting on.
    expect(screen.getByText("12%")).toBeInTheDocument();
    expect(screen.getByText("16%")).toBeInTheDocument();
    // The description keeps splicing too, so the current level's value appears
    // both in the sentence and in the table.
    expect(screen.getAllByText("20%").length).toBeGreaterThan(1);
  });

  it("renders an ability with no scalings as plain text", () => {
    renderKit([{ type: "Technique", name: "Technique", description: "Immediately recovers 1 Skill Point." }]);

    expect(screen.getByText("Immediately recovers 1 Skill Point.")).toBeInTheDocument();
    expect(screen.queryByRole("slider")).not.toBeInTheDocument();
  });

  it("renders nothing when the kit field is empty", () => {
    const { container } = renderKit([]);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("SkillsBlock level tracks", () => {
  it("gives every scaling ability its own slider", () => {
    renderKit(MEMOSPRITE_KIT, "honkai-star-rail");

    // One control per ability, not per track: two abilities can share a track
    // and still need to be read at different levels.
    expect(screen.getAllByRole("slider")).toHaveLength(3);
    expect(screen.getByLabelText("Basic level")).toBeInTheDocument();
    expect(screen.getByLabelText("Skill level")).toBeInTheDocument();
    expect(screen.getByLabelText("Ica's Skill level")).toBeInTheDocument();
  });

  it("opens each track at its own base cap", () => {
    renderKit(MEMOSPRITE_KIT, "honkai-star-rail");

    // Basic ATK opens at 6 of 7 (its 7th needs an eidolon), while the Skill and
    // the memosprite open at 10. One shared slider could not express that.
    expect(screen.getByText("100%")).toBeInTheDocument();
    expect(screen.queryByText("110%")).not.toBeInTheDocument();
    expect(screen.getByText("10%")).toBeInTheDocument();
    expect(screen.getByText("20%")).toBeInTheDocument();
  });

  it("still reaches the eidolon-boosted level when dragged there", () => {
    renderKit(MEMOSPRITE_KIT, "honkai-star-rail");

    fireEvent.change(screen.getByLabelText("Basic level"), { target: { value: "7" } });
    expect(screen.getByText("110%")).toBeInTheDocument();
  });

  it("moves only the ability whose slider changed", () => {
    renderKit(MEMOSPRITE_KIT, "honkai-star-rail");

    fireEvent.change(screen.getByLabelText("Ica's Skill level"), { target: { value: "1" } });

    expect(screen.getByText("11%")).toBeInTheDocument();
    // The character's own skills are untouched.
    expect(screen.getByText("10%")).toBeInTheDocument();
    expect(screen.getByText("100%")).toBeInTheDocument();
  });

  it("labels a light cone's slider by superimposition", () => {
    renderKit(
      [
        {
          type: "Light Cone Effect",
          name: "Wheat Dream in the Ripples",
          description: "Increases CRIT Rate by {crit_rate}.",
          scalings: [{ label: "CRIT Rate", values: ["12%", "14%", "16%", "18%", "20%"] }],
        },
      ],
      "honkai-star-rail",
    );

    // Ticks read S1..S5, and the slider opens on S1 rather than maxed. The
    // track name sits beside the slider as its unit.
    expect(screen.getByText("Superimposition")).toBeInTheDocument();
    expect(screen.getByText("S1")).toBeInTheDocument();
    expect(screen.getByText("12%")).toBeInTheDocument();
  });

  it("grades a ZZZ core passive by letter rather than by number", () => {
    renderKit(
      [
        {
          type: "Core Skill",
          name: "Core Passive",
          description: "ATK increases by {atk}.",
          scalings: [{ label: "ATK", values: ["4%", "8%", "12%", "16%", "20%", "24%"] }],
        },
      ],
      "zenless-zone-zero",
    );

    expect(screen.getByText("Core")).toBeInTheDocument();
    expect(screen.getByText("F")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Core Passive level"), { target: { value: "1" } });
    expect(screen.getByText("A")).toBeInTheDocument();
    expect(screen.getByText("4%")).toBeInTheDocument();
  });

  it("heads the all-levels table with the track's tick labels", () => {
    renderKit(
      [
        {
          type: "Skill 1",
          name: "Mastery skill",
          description: "Deals damage.",
          scalings: [{ label: "DMG", values: ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10"] }],
        },
      ],
      "arknights",
    );

    fireEvent.click(screen.getByRole("button", { name: "All levels" }));

    // Columns 8-10 are the mastery ranks, not "8", "9", "10".
    expect(screen.getByRole("columnheader", { name: "M1" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "M3" })).toBeInTheDocument();
  });

  it("honours an explicit track over the one implied by the type", () => {
    renderKit(
      [
        {
          type: "Skill",
          track: "superimposition",
          name: "Overridden",
          description: "Boosts by {boost}.",
          scalings: [{ label: "Boost", values: ["1%", "2%", "3%", "4%", "5%"] }],
        },
      ],
      "honkai-star-rail",
    );

    expect(screen.getByText("Superimposition")).toBeInTheDocument();
  });

  it("shows no slider for a kit of level-less abilities", () => {
    renderKit(
      [
        { type: "Technique", name: "Technique", description: "Recovers 1 Skill Point." },
        { group: "Eidolons", name: "E1", description: "A fixed bonus." },
      ],
      "honkai-star-rail",
    );

    expect(screen.queryByRole("slider")).not.toBeInTheDocument();
    expect(screen.getByText("A fixed bonus.")).toBeInTheDocument();
  });
});

describe("SkillsBlock slider defaults", () => {
  const LIGHT_CONE = [
    {
      type: "Light Cone Effect",
      name: "Longing",
      description: "Increases CRIT Rate by {crit_rate}.",
      scalings: [{ label: "CRIT Rate", values: ["12%", "14%", "16%", "18%", "20%"] }],
    },
  ];

  it("opens a light cone at S1, the superimposition almost every reader has", () => {
    renderKit(LIGHT_CONE, "honkai-star-rail");

    expect(screen.getByText("S1")).toBeInTheDocument();
    expect(screen.getByText("12%")).toBeInTheDocument();
    expect(screen.queryByText("20%")).not.toBeInTheDocument();
  });

  it("labels that slider in full instead of a bare letter", () => {
    renderKit(LIGHT_CONE, "honkai-star-rail");
    expect(screen.getByText("Superimposition")).toBeInTheDocument();
  });

  it("still opens a character's kit at its base cap, not at S1", () => {
    renderKit(MEMOSPRITE_KIT, "honkai-star-rail");

    expect(screen.getByText("100%")).toBeInTheDocument();
    expect(screen.getByText("10%")).toBeInTheDocument();
  });

  it("lets the reader move a defaulted slider up", () => {
    renderKit(LIGHT_CONE, "honkai-star-rail");

    fireEvent.change(screen.getByLabelText("Longing level"), { target: { value: "5" } });
    expect(screen.getByText("20%")).toBeInTheDocument();
    expect(screen.getByText("S5")).toBeInTheDocument();
  });
});

describe("SkillsBlock abilities sharing a track", () => {
  // Aglaea really has two Basic ATKs — one per stance — and a character like
  // Blade has a Skill and its enhanced form. They land on the same level track
  // but are different abilities, so each needs its own control.
  const TWO_BASICS = [
    {
      type: "Basic ATK",
      name: "Thorned Nectar",
      description: "Deals Lightning DMG equal to {lightning_dmg} of ATK.",
      scalings: [{ label: "Lightning DMG", values: ["50%", "60%", "70%", "80%", "90%", "100%", "110%"] }],
    },
    {
      type: "Basic ATK",
      name: "Slash by a Thousandfold Kiss",
      description: "Joint ATK dealing Lightning DMG equal to {joint_dmg} of ATK.",
      scalings: [{ label: "Joint DMG", values: ["20%", "24%", "28%", "32%", "36%", "40%", "44%"] }],
    },
  ];

  it("gives each of them a separate slider", () => {
    renderKit(TWO_BASICS, "honkai-star-rail");

    expect(screen.getAllByRole("slider")).toHaveLength(2);
    expect(screen.getByLabelText("Thorned Nectar level")).toBeInTheDocument();
    expect(screen.getByLabelText("Slash by a Thousandfold Kiss level")).toBeInTheDocument();
  });

  it("moves one without moving the other", () => {
    renderKit(TWO_BASICS, "honkai-star-rail");

    // Both open at the base cap of 6.
    expect(screen.getByText("100%")).toBeInTheDocument();
    expect(screen.getByText("40%")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Thorned Nectar level"), { target: { value: "1" } });

    expect(screen.getByText("50%")).toBeInTheDocument();
    // The second Basic ATK stayed where it was.
    expect(screen.getByText("40%")).toBeInTheDocument();
    expect(screen.queryByText("100%")).not.toBeInTheDocument();
  });
});

describe("SkillsBlock ability tag", () => {
  it("shows how an ability hits, beside its type", () => {
    // What tells Aglaea's two Basic ATKs apart on the wiki is the tag, not the
    // type — both are typed Basic ATK.
    renderKit([
      { type: "Basic ATK", tag: "Single Target", name: "Thorned Nectar", description: "Deals DMG." },
      { type: "Enhanced Basic ATK", tag: "Blast", name: "Slash by a Thousandfold Kiss", description: "Joint ATK." },
    ], "honkai-star-rail");

    expect(screen.getByText("Single Target")).toBeInTheDocument();
    expect(screen.getByText("Blast")).toBeInTheDocument();
    expect(screen.getByText("Basic ATK")).toBeInTheDocument();
    expect(screen.getByText("Enhanced Basic ATK")).toBeInTheDocument();
  });

  it("renders nothing extra when an ability has no tag", () => {
    renderKit([{ type: "Skill", name: "Plain", description: "Does a thing." }], "honkai-star-rail");
    expect(screen.getByText("Skill")).toBeInTheDocument();
    expect(screen.getByText("Plain")).toBeInTheDocument();
  });
});
