// Ability scaling values and the placeholder tokens that splice them back into
// an ability's description.
//
// Every gacha wiki writes a scaling the same way: one sentence with the
// per-level values slash-separated inline ("Increases CRIT Rate by
// 12/14/16/18/20%"). Storing that verbatim means the reader has to pick their
// own level out of a run of numbers, so instead we lift each run into a
// `{ label, values[] }` scaling and leave a `{token}` behind in the text. At
// render time the token is replaced by the value for the selected level, and
// the sentence reads the way the game states it.
//
// Both halves live here so the admin editor (which creates tokens) and the
// public Skills block (which resolves them) can never drift apart.

export interface Scaling {
  label?: string;
  // values[i] is the value at the i-th tick of the ability's level track.
  values?: string[];
}

// Built fresh per call rather than shared as module constants: a global regex
// carries a mutable `lastIndex`, and both `.test()` and `matchAll` read it — so
// a single shared instance makes one function's scan silently resume from where
// another left off, skipping the leading match.

// `{crit_rate}` / `{1}`. Named tokens resolve against a scaling's slugified
// label, numeric ones are 1-based indices into the scaling list — so a scaling
// whose label is empty (or duplicated) is still addressable.
const tokenRe = () => /\{([a-z0-9_]+)\}/gi;

// A run of two or more numbers joined by "/", each optionally carrying a "%".
// Deliberately narrow: it must not swallow "24/7", a date, or a fraction in
// prose, so a run only counts when it has at least two separators OR a percent
// sign somewhere in it (see extractScalingRuns).
const runRe = () => /\d+(?:\.\d+)?%?(?:\/\d+(?:\.\d+)?%?)+/g;

export function slugify(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

// Split a hand-typed or pasted value list. Wiki data arrives slash-separated
// ("12/14/16"), datamined dumps arrive comma-separated ("12, 14, 16") — accept
// either (and a mix) so both paste straight in.
export function splitValues(raw: string): string[] {
  return raw
    .split(/[,/]/)
    .map((v) => v.trim())
    .filter(Boolean);
}

// Glue words that never belong in a generated label ("…CRIT Rate by 12/14/16"
// → "CRIT Rate", not "Rate by").
const STOPWORDS = new Set(["by", "to", "of", "for", "at", "as", "and", "or", "up", "a", "an", "the", "is", "are", "with", "plus", "additional", "that", "this", "equal", "each", "every"]);
// Possessives that only ever lead a phrase, never end one.
const LEADING_ONLY = new Set(["wearer's", "wearers", "their", "its", "his", "her", "'s"]);
// Effect verbs. A label made only of these names an action, not a stat, so it
// is a signal to look for the stat on the other side of the values instead —
// Genshin writes "Deals 100.8%/109.4%/… of ATK", with the stat trailing.
const VERBS = new Set(["deal", "deals", "dealt", "increase", "increases", "increased", "restore", "restores", "regenerate", "regenerates", "recover", "recovers", "reduce", "reduces", "heal", "heals", "grant", "grants", "gain", "gains", "provide", "provides", "inflict", "inflicts", "apply", "applies", "boost", "boosts", "raise", "raises", "lower", "lowers", "add", "adds", "has", "have"]);

const MAX_LABEL_WORDS = 3;

function words(s: string): string[] {
  return s
    .replace(/[^\p{L}\p{N}'\s-]+/gu, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

const isStop = (w: string) => STOPWORDS.has(w.toLowerCase()) || LEADING_ONLY.has(w.toLowerCase());
// Stat names are near-universally capitalised in game text ("CRIT Rate", "ATK",
// "Ultimate DMG"), so a capitalised word is the strongest available hint about
// where the stat phrase actually starts.
const isCapitalized = (w: string) => /\p{Lu}/u.test(w);
const isVerb = (w: string) => VERBS.has(w.toLowerCase());
// "wearer's", "holder's" — a possessive leads a phrase but is never the stat.
const isPossessive = (w: string) => /'s$/i.test(w);
// A bare number is part of the effect's prose ("for 2 turn(s)"), never a stat name.
const isNumeric = (w: string) => /^\d+(?:\.\d+)?$/.test(w);

// A stat name never opens with a verb or a bare number ("increases the DMG" is
// the clause, "DMG" is the stat) and never closes with glue or a number.
function trimEdges(list: string[]): string[] {
  const out = list.slice();
  while (out.length > 0 && (isStop(out[0]) || isPossessive(out[0]) || isVerb(out[0]) || isNumeric(out[0]))) {
    out.shift();
  }
  while (out.length > 0 && (isStop(out[out.length - 1]) || isNumeric(out[out.length - 1]))) out.pop();
  return out;
}

// The stat phrase sitting just before a run of values.
function phraseBefore(before: string): string {
  const list = words(before);
  while (list.length > 0 && isStop(list[list.length - 1])) list.pop();
  // A trailing verb names the action, not the stat ("…holder's DMG dealt").
  while (list.length > 0 && isVerb(list[list.length - 1])) list.pop();
  if (list.length === 0) return "";

  let tail = list.slice(-MAX_LABEL_WORDS);
  // Nothing capitalised nearby means we are looking at filler ("…dealt by the
  // wearer increase"); reach further back to the last capitalised word and take
  // the phrase ending there instead.
  if (!tail.some(isCapitalized)) {
    const at = list.map(isCapitalized).lastIndexOf(true);
    if (at >= 0) tail = list.slice(Math.max(0, at - (MAX_LABEL_WORDS - 1)), at + 1);
  }
  return trimEdges(tail).join(" ");
}

// The stat phrase just after a run of values, used when the text reads
// "Deals <values> of ATK" or "regenerates <values> Energy". Stops at the first
// glue word so it grabs the stat and nothing else, and never crosses a comma or
// sentence boundary — what follows those is a new clause about something else
// ("…increases by 3/4/5%, stacking up to 3 times" does not scale "stacking").
function phraseAfter(after: string): string {
  const list = words(after.split(/[.!?,\n]/)[0] ?? "");
  while (list.length > 0 && isStop(list[0])) list.shift();
  const out: string[] = [];
  for (const w of list) {
    if (out.length >= MAX_LABEL_WORDS || isStop(w)) break;
    out.push(w);
  }
  return trimEdges(out).join(" ");
}

// Guess a scaling's label from the prose around its run of values. A suggestion
// only — the admin can rename it, and a bad guess costs one edit.
//
// Which side to read is decided by the word butting up against the values. A
// verb there ("…regenerates 6/6.5/7/7.5/8 Energy") means the stat trails the
// numbers, so the text after wins; reaching backwards instead would sail past
// the verb and label it with whatever capitalised phrase happened to come
// earlier in the sentence. Everywhere else the stat leads ("CRIT Rate by …").
// Either side falls back to the other when it comes up empty.
function labelFromContext(before: string, after: string): string {
  const lead = words(before).filter((w) => !isStop(w));
  const verbLed = lead.length > 0 && isVerb(lead[lead.length - 1]);
  if (verbLed) return phraseAfter(after) || phraseBefore(before);

  const label = phraseBefore(before);
  const onlyVerbs = label === "" || words(label).every(isVerb);
  return onlyVerbs ? phraseAfter(after) || label : label;
}

// A "%" written once at the end of a run applies to every value in it — HSR and
// NIKKE both write "12/14/16/18/20%" meaning five percentages. If any part
// already carries its own unit we leave the run exactly as written.
function normalizeUnits(parts: string[]): string[] {
  const withUnit = parts.filter((p) => p.endsWith("%")).length;
  if (withUnit !== 1 || !parts[parts.length - 1].endsWith("%")) return parts;
  return parts.map((p) => (p.endsWith("%") ? p : `${p}%`));
}

export interface ExtractResult {
  // The description with each run replaced by its `{token}`.
  text: string;
  // One scaling per run found, in the order they appear.
  scalings: Scaling[];
}

// Pull every slash-separated run of values out of a pasted ability description,
// turning each into a scaling and leaving a token in its place. This is the
// whole point of the "smart paste" action in the admin editor: paste the
// sentence from the wiki, get the per-level data for free.
//
// `minParts` guards against false positives in prose — a run needs at least
// three values, or two with a percent sign, before we treat it as a scaling.
export function extractScalingRuns(description: string, minParts = 3): ExtractResult {
  const scalings: Scaling[] = [];
  const used = new Set<string>();
  let out = "";
  let last = 0;

  for (const m of description.matchAll(runRe())) {
    const raw = m[0];
    const parts = normalizeUnits(raw.split("/"));
    const hasPercent = parts.some((p) => p.endsWith("%"));
    if (parts.length < minParts && !(parts.length >= 2 && hasPercent)) continue;

    const start = m.index ?? 0;
    const label = labelFromContext(description.slice(last, start), description.slice(start + raw.length));

    // Tokens must be unique within an ability or two scalings would resolve to
    // the same value. Fall back to a positional token when the label is empty
    // or already taken.
    let token = slugify(label);
    if (!token || used.has(token)) token = String(scalings.length + 1);
    used.add(token);

    out += description.slice(last, start) + `{${token}}`;
    last = start + raw.length;
    scalings.push({ label: label || `Value ${scalings.length + 1}`, values: parts });
  }

  out += description.slice(last);
  return { text: out, scalings };
}

export function hasTokens(description: string): boolean {
  return tokenRe().test(description);
}

// Resolve one scaling's value at a level index, clamping to the ends. An
// ability whose track is longer than its own value list (a Basic ATK on a
// 10-level slider) holds at its last value rather than rendering blank.
export function valueAt(scaling: Scaling | undefined, levelIndex: number): string {
  const values = scaling?.values ?? [];
  if (values.length === 0) return "";
  const i = Math.max(0, Math.min(levelIndex, values.length - 1));
  return values[i] ?? "";
}

function findScaling(scalings: Scaling[], token: string): Scaling | undefined {
  const asIndex = Number(token);
  if (Number.isInteger(asIndex) && asIndex >= 1 && asIndex <= scalings.length) {
    return scalings[asIndex - 1];
  }
  const want = token.toLowerCase();
  return scalings.find((s) => slugify(s.label ?? "") === want);
}

export type TemplatePart =
  | { kind: "text"; text: string }
  // A resolved scaling value, rendered highlighted so the level-dependent
  // numbers stand out from the prose.
  | { kind: "value"; text: string };

// Split a tokenized description into renderable parts with each token replaced
// by its value at `levelIndex`. An unresolvable token is emitted as literal
// text, so a typo shows up in the page as `{typo}` instead of silently
// vanishing — much easier to spot and fix than a missing number.
export function renderTemplate(
  description: string,
  scalings: Scaling[],
  levelIndex: number,
): TemplatePart[] {
  const parts: TemplatePart[] = [];
  let last = 0;

  for (const m of description.matchAll(tokenRe())) {
    const start = m.index ?? 0;
    const scaling = findScaling(scalings, m[1]);
    if (scaling === undefined) continue;

    if (start > last) parts.push({ kind: "text", text: description.slice(last, start) });
    parts.push({ kind: "value", text: valueAt(scaling, levelIndex) });
    last = start + m[0].length;
  }

  if (last < description.length) parts.push({ kind: "text", text: description.slice(last) });
  return parts;
}

// Which scalings a description actually splices inline. The Skills block lists
// the rest underneath, so a scaling stays visible even if its token was never
// placed in the text.
export function tokenizedScalings(description: string, scalings: Scaling[]): Set<number> {
  const used = new Set<number>();
  for (const m of description.matchAll(tokenRe())) {
    const scaling = findScaling(scalings, m[1]);
    if (scaling) used.add(scalings.indexOf(scaling));
  }
  return used;
}
