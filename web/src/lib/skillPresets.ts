// Per-game ability/skill vocabularies, used to seed the "Type" and "Group"
// inputs of the `skilllist` field editor so admins tag each ability with the
// game's real terminology instead of free-typing (and misspelling) it. These
// are SUGGESTIONS only — the inputs stay free-text, so an unlisted game or a
// new ability category still works. Matched by game slug first, then name, on a
// normalized substring so "honkai-star-rail", "Honkai: Star Rail" both hit.

// A level track: the axis an ability's `scalings[].values` are indexed by.
//
// Levels are NOT always "1..N". Arknights skills run 1-7 then M1-M3, ZZZ core
// passives are graded A-F, light cones and weapons use S1-S5 / R1-R5. So a
// track carries its own tick labels and `values[i]` lines up with `ticks[i]`.
// One kit usually needs several: an HSR character's Skill caps at 10 while the
// Basic ATK caps at 7, and a memosprite runs its own track entirely — which is
// why the Skills block renders one slider per track rather than one for the
// whole list.
export interface SkillTrack {
  key: string;
  // Shown beside the slider — "Lv", "S", "Core"…
  label: string;
  // ticks[i] labels the value at index i.
  ticks: string[];
  // Ability "Type" tags that default to this track, so an admin rarely picks
  // one by hand. The first track is the fallback for anything unmatched.
  types?: string[];
}

export interface SkillPreset {
  // substrings (lowercased) that identify the game by slug or name
  match: string[];
  // ordered category labels for the ability "Type" tag
  types: string[];
  // labelled progression groups (eidolons, constellations…) for the "Group" tag
  groups: string[];
  // level tracks this game's abilities scale along
  tracks: SkillTrack[];
}

// "1".."n" — the common case, spelled once.
function range(n: number): string[] {
  return Array.from({ length: n }, (_, i) => String(i + 1));
}

// "S1".."S5", "R1".."R5" — a prefixed track.
function prefixed(prefix: string, n: number): string[] {
  return Array.from({ length: n }, (_, i) => `${prefix}${i + 1}`);
}

const PRESETS: SkillPreset[] = [
  {
    match: ["honkai-star-rail", "star-rail", "star rail", "hsr"],
    types: ["Basic ATK", "Enhanced Basic ATK", "Skill", "Enhanced Skill", "Ultimate", "Talent", "Technique", "Elation Skill", "Memosprite Skill", "Memosprite Talent", "Light Cone Effect"],
    groups: ["Memosprite", "Elation", "Transformation", "Traces", "Eidolons"],
    tracks: [
      { key: "skill", label: "Lv", ticks: range(10), types: ["Skill", "Enhanced Skill", "Ultimate", "Talent", "Elation Skill"] },
      { key: "basic", label: "Lv", ticks: range(7), types: ["Basic ATK", "Enhanced Basic ATK"] },
      // A memosprite levels with its summoner but is a separate kit, so its
      // abilities get their own slider (Hyacine, Castorice, Aglaea).
      { key: "memo", label: "Memo Lv", ticks: range(10), types: ["Memosprite Skill", "Memosprite Talent"] },
      // Light cone superimposition.
      { key: "superimposition", label: "S", ticks: prefixed("S", 5), types: ["Light Cone Effect"] },
    ],
  },
  {
    match: ["genshin"],
    types: ["Normal Attack", "Elemental Skill", "Elemental Burst", "Passive Talent", "Weapon Passive"],
    groups: ["Passive Talents", "Constellations"],
    tracks: [
      // 10 base, up to 15 with the C3/C5 constellation bonuses.
      { key: "talent", label: "Lv", ticks: range(15), types: ["Normal Attack", "Elemental Skill", "Elemental Burst"] },
      { key: "refinement", label: "R", ticks: prefixed("R", 5), types: ["Weapon Passive"] },
    ],
  },
  {
    match: ["zenless", "zzz"],
    types: ["Basic Attack", "Dodge", "Assist", "Special Attack", "EX Special Attack", "Chain Attack", "Ultimate", "Core Skill", "Additional Ability", "W-Engine Passive"],
    groups: ["Core Skill", "Mindscape Cinema"],
    tracks: [
      { key: "skill", label: "Lv", ticks: range(16), types: ["Basic Attack", "Dodge", "Assist", "Special Attack", "EX Special Attack", "Chain Attack", "Ultimate"] },
      // Core passives are letter-graded, not numbered — the case that makes
      // tick labels mandatory rather than derived from a count.
      { key: "core", label: "Core", ticks: ["A", "B", "C", "D", "E", "F"], types: ["Core Skill", "Additional Ability"] },
      { key: "engine", label: "P", ticks: prefixed("P", 5), types: ["W-Engine Passive"] },
    ],
  },
  {
    match: ["wuthering", "wuwa"],
    types: ["Basic Attack", "Resonance Skill", "Resonance Liberation", "Forte Circuit", "Intro Skill", "Outro Skill", "Inherent Skill", "Weapon Passive"],
    groups: ["Resonance Chain"],
    tracks: [
      { key: "skill", label: "Lv", ticks: range(10), types: ["Basic Attack", "Resonance Skill", "Resonance Liberation", "Forte Circuit", "Intro Skill", "Outro Skill"] },
      { key: "tune", label: "S", ticks: prefixed("S", 5), types: ["Weapon Passive"] },
    ],
  },
  // Endfield before plain Arknights so the more specific slug wins.
  {
    match: ["endfield"],
    types: ["Normal Attack", "Combo Skill", "Skill", "Ultimate", "Talent"],
    groups: [],
    tracks: [
      { key: "skill", label: "Lv", ticks: range(10), types: ["Normal Attack", "Combo Skill", "Skill", "Ultimate", "Talent"] },
    ],
  },
  {
    match: ["arknights"],
    types: ["Trait", "Talent", "Skill 1", "Skill 2", "Skill 3", "Module"],
    groups: ["Talents", "Skills", "Modules"],
    tracks: [
      // 1-7, then the three mastery ranks — a track that is numeric for most of
      // its length and then isn't.
      { key: "skill", label: "Lv", ticks: [...range(7), "M1", "M2", "M3"], types: ["Skill 1", "Skill 2", "Skill 3"] },
      { key: "module", label: "Stage", ticks: range(3), types: ["Module"] },
    ],
  },
  {
    match: ["nikke"],
    types: ["Skill 1", "Skill 2", "Burst Skill"],
    groups: ["Burst I", "Burst II", "Burst III"],
    tracks: [
      { key: "skill", label: "Lv", ticks: range(10), types: ["Skill 1", "Skill 2", "Burst Skill"] },
    ],
  },
  {
    match: ["blue-archive", "blue archive"],
    types: ["EX Skill", "Basic Skill", "Enhanced Skill", "Sub Skill"],
    groups: [],
    tracks: [
      { key: "ex", label: "Lv", ticks: range(5), types: ["EX Skill"] },
      { key: "skill", label: "Lv", ticks: range(10), types: ["Basic Skill", "Enhanced Skill", "Sub Skill"] },
    ],
  },
  {
    match: ["umamusume", "uma-musume", "uma"],
    types: ["Unique Skill", "Speed", "Acceleration", "Recovery", "Positioning", "Gate/Start", "Debuff", "Passive"],
    groups: [],
    tracks: [{ key: "level", label: "Lv", ticks: range(6) }],
  },
  {
    match: ["honkai-impact", "honkai impact", "hi3"],
    types: ["Basic ATK", "Skill", "Ultimate", "Evade", "SP Skill", "Leader Skill", "Passive"],
    groups: [],
    tracks: [{ key: "level", label: "Lv", ticks: range(10) }],
  },
  {
    match: ["reverse", "1999"],
    types: ["Skill 1", "Skill 2", "Ultimate", "Passive"],
    groups: ["Insight", "Portray"],
    // Reverse: 1999 scales on Insight AND Portray at once. A track is a single
    // axis, so Portray is modelled here and Insight differences belong in
    // separate ability rows until 2-D tracks exist.
    tracks: [{ key: "portray", label: "P", ticks: range(5), types: ["Skill 1", "Skill 2", "Ultimate"] }],
  },
  {
    match: ["fate", "fgo", "grand-order", "grand order"],
    types: ["Skill 1", "Skill 2", "Skill 3", "Noble Phantasm", "Class Skill", "Append Skill"],
    groups: ["Active Skills", "Passive Skills", "Append Skills"],
    tracks: [
      { key: "skill", label: "Lv", ticks: range(10), types: ["Skill 1", "Skill 2", "Skill 3", "Class Skill", "Append Skill"] },
      { key: "np", label: "NP", ticks: range(5), types: ["Noble Phantasm"] },
    ],
  },
];

// A reasonable cross-game fallback when nothing matches (a new game, or one
// without a preset yet): the categories shared by most action gachas.
const FALLBACK: SkillPreset = {
  match: [],
  types: ["Basic ATK", "Skill", "Ultimate", "Talent", "Technique", "Passive"],
  groups: ["Eidolons", "Constellations"],
  tracks: [{ key: "level", label: "Lv", ticks: range(10) }],
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

// Which track an ability scales along: its explicit `track` key when the admin
// set one, otherwise inferred from its Type tag, otherwise the game's first
// track. Returns undefined only when a game somehow has no tracks at all.
export function trackFor(
  tracks: SkillTrack[],
  trackKey?: string,
  type?: string,
): SkillTrack | undefined {
  if (tracks.length === 0) return undefined;
  if (trackKey) {
    const explicit = tracks.find((t) => t.key === trackKey);
    if (explicit) return explicit;
  }
  const wanted = norm(type);
  if (wanted) {
    const byType = tracks.find((t) => (t.types ?? []).some((x) => norm(x) === wanted));
    if (byType) return byType;
  }
  return tracks[0];
}

// The tick labels actually used for a track, reconciled with the data.
//
// The preset is a good default, not the truth: a datamined kit may carry more
// values than we predicted (an Arknights skill with masteries where we expected
// seven levels) or fewer (an ability that maxes early). The data wins in both
// directions — the slider spans exactly as many stops as there are values, and
// any beyond the preset's labels fall back to their 1-based number so nothing
// is silently unreachable.
export function resolveTicks(track: SkillTrack | undefined, valueCount: number): string[] {
  const ticks = track?.ticks ?? [];
  if (valueCount <= 0) return [];
  if (valueCount <= ticks.length) return ticks.slice(0, valueCount);
  return [
    ...ticks,
    ...Array.from({ length: valueCount - ticks.length }, (_, i) => String(ticks.length + i + 1)),
  ];
}
