// Per-game ability/skill vocabularies, used to seed the "Type" and "Group"
// inputs of the `skilllist` field editor so admins tag each ability with the
// game's real terminology instead of free-typing (and misspelling) it. These
// are SUGGESTIONS only — the inputs stay free-text, so an unlisted game or a
// new ability category still works. Matched by game slug first, then name, on a
// normalized substring so "honkai-star-rail", "Honkai: Star Rail" both hit.

export interface SkillPreset {
  // substrings (lowercased) that identify the game by slug or name
  match: string[];
  // ordered category labels for the ability "Type" tag
  types: string[];
  // labelled progression groups (eidolons, constellations…) for the "Group" tag
  groups: string[];
}

const PRESETS: SkillPreset[] = [
  {
    match: ["honkai-star-rail", "star-rail", "star rail", "hsr"],
    types: ["Basic ATK", "Enhanced Basic ATK", "Skill", "Enhanced Skill", "Ultimate", "Talent", "Technique", "Elation Skill", "Memosprite Skill", "Memosprite Talent"],
    groups: ["Memosprite", "Elation", "Transformation", "Traces", "Eidolons"],
  },
  {
    match: ["genshin"],
    types: ["Normal Attack", "Elemental Skill", "Elemental Burst", "Passive Talent"],
    groups: ["Passive Talents", "Constellations"],
  },
  {
    match: ["zenless", "zzz"],
    types: ["Basic Attack", "Dodge", "Assist", "Special Attack", "EX Special Attack", "Chain Attack", "Ultimate", "Core Skill", "Additional Ability"],
    groups: ["Core Skill", "Mindscape Cinema"],
  },
  {
    match: ["wuthering", "wuwa"],
    types: ["Basic Attack", "Resonance Skill", "Resonance Liberation", "Forte Circuit", "Intro Skill", "Outro Skill", "Inherent Skill"],
    groups: ["Resonance Chain"],
  },
  // Endfield before plain Arknights so the more specific slug wins.
  {
    match: ["endfield"],
    types: ["Normal Attack", "Combo Skill", "Skill", "Ultimate", "Talent"],
    groups: [],
  },
  {
    match: ["arknights"],
    types: ["Trait", "Talent", "Skill 1", "Skill 2", "Skill 3", "Module"],
    groups: ["Talents", "Skills", "Modules"],
  },
  {
    match: ["nikke"],
    types: ["Skill 1", "Skill 2", "Burst Skill"],
    groups: ["Burst I", "Burst II", "Burst III"],
  },
  {
    match: ["blue-archive", "blue archive"],
    types: ["EX Skill", "Basic Skill", "Enhanced Skill", "Sub Skill"],
    groups: [],
  },
  {
    match: ["umamusume", "uma-musume", "uma"],
    types: ["Unique Skill", "Speed", "Acceleration", "Recovery", "Positioning", "Gate/Start", "Debuff", "Passive"],
    groups: [],
  },
  {
    match: ["honkai-impact", "honkai impact", "hi3"],
    types: ["Basic ATK", "Skill", "Ultimate", "Evade", "SP Skill", "Leader Skill", "Passive"],
    groups: [],
  },
  {
    match: ["reverse", "1999"],
    types: ["Skill 1", "Skill 2", "Ultimate", "Passive"],
    groups: ["Insight", "Portray"],
  },
  {
    match: ["fate", "fgo", "grand-order", "grand order"],
    types: ["Skill 1", "Skill 2", "Skill 3", "Noble Phantasm", "Class Skill", "Append Skill"],
    groups: ["Active Skills", "Passive Skills", "Append Skills"],
  },
];

// A reasonable cross-game fallback when nothing matches (a new game, or one
// without a preset yet): the categories shared by most action gachas.
const FALLBACK: SkillPreset = {
  match: [],
  types: ["Basic ATK", "Skill", "Ultimate", "Talent", "Technique", "Passive"],
  groups: ["Eidolons", "Constellations"],
};

function norm(s: string | undefined): string {
  return (s ?? "").toLowerCase();
}

// Resolve the preset for a game from its slug and/or display name. Slug is
// checked first (more stable), then the name.
export function skillPresetFor(gameSlug?: string, gameName?: string): SkillPreset {
  const slug = norm(gameSlug);
  const name = norm(gameName);
  for (const p of PRESETS) {
    if (p.match.some((m) => slug.includes(m) || name.includes(m))) return p;
  }
  return FALLBACK;
}
