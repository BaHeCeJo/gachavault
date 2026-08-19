#!/usr/bin/env python3
"""Turn the cached character wiki pages into a bulk-import file.

Reads seed_data/hsr_characters_wiki.json (see fetch_hsr_character_wiki.py) and
writes seed_data/hsr_characters_import.json — one row per character carrying a
`kit` skilllist, in the shape the admin bulk-import screen expects. Load that
file there; nothing in this repo writes to the site.

A kit is three kinds of row, in the order a reader wants them:

  abilities   Basic ATK, Skill, Ultimate, Talent, Technique — with per-level
              scalings, and a {token} where each value sits in the sentence
  traces      the Bonus Abilities unlocked by ascension — fixed effects, so
              text only, grouped under "Traces"
  eidolons    E1-E6, fixed text, grouped under "Eidolons"

The wiki writes an ability's numbers as a range in the prose — "equal to
80%—176% of ATK" — and publishes the levels in between as a table beside it.
Each range becomes a {token}, the table row at the same position supplies its
values, and the site splices the value for the chosen level back in. When the
counts disagree the ability keeps its prose and gets no scalings, because a
wrong alignment would state confident numbers that are simply not the ability's.

Level caps come from LEVEL_CAPS below rather than from the table, which runs
past what the game allows on some skills.
"""

import html
import io
import json
import os
import re

# The cache was written before the cleaner learned some of the wiki's
# templates, so descriptions are cleaned again on the way through. Cleaning
# is idempotent for text already clean, so this needs no re-scrape.
from fetch_hsr_character_wiki import clean as clean_wikitext
from scaling_extract import check_fixtures, label_for_context, slugify as slug_label

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "seed_data")
GAME = "honkai-star-rail"
WIKI = os.path.join(DATA, "hsr_characters_wiki.json")
CATALOG = os.path.join(DATA, "hsr_characters_catalog.json")
OUT = os.path.join(DATA, "hsr_characters_import.json")

# Highest level each kind of ability actually reaches, mirroring the tracks in
# web/src/lib/skillPresets.ts. The wiki's table is longer than the game allows
# for some skills (Acheron's shows 15), so it is trimmed rather than trusted —
# a slider stop nobody can reach is a number nobody can use.
LEVEL_CAPS = {
    "basic atk": 7,
    "enhanced basic atk": 7,
    "skill": 12,
    "enhanced skill": 12,
    "ultimate": 12,
    "enhanced ultimate": 12,
    "talent": 12,
    "enhanced talent": 12,
    "technique": 12,
    "enhanced technique": 12,
    "memosprite skill": 12,
    "enhanced memosprite skill": 12,
    "memosprite talent": 12,
    "enhanced memosprite talent": 12,
    "elation skill": 12,
    "servant skill": 12,
    "servant talent": 12,
    # Himeko • Nova's Companion Protocol abilities.
    "assist skill": 12,
}

# Ability type -> the order it should appear in the kit. A reader scans a kit in
# this order regardless of how the wiki's category happened to sort it.
TYPE_ORDER = [
    "basic atk", "enhanced basic atk", "skill", "enhanced skill",
    "ultimate", "enhanced ultimate", "talent", "enhanced talent",
    "technique", "enhanced technique", "elation skill",
    "servant skill", "servant talent", "assist skill",
    "memosprite skill", "enhanced memosprite skill",
    "memosprite talent", "enhanced memosprite talent",
]

# A range written in an ability description: "80%—176%", "2—5", "1.5%—3%".
# The wiki uses an em dash; a hyphen shows up occasionally too.
RANGE_RE = re.compile(r"\d[\d.]*%?\s*[—–-]\s*\d[\d.]*%?")


def slug(name):
    s = name.lower()
    s = s.replace("•", " ").replace("&", " and ")
    s = re.sub(r"[^a-z0-9]+", "-", s)
    return re.sub(r"^-+|-+$", "", s)


def dedupe(rows, key):
    """Keep the first row for each key, in the order the wiki listed them."""
    seen, out = set(), []
    for r in rows:
        k = key(r)
        if k in seen:
            continue
        seen.add(k)
        out.append(r)
    return out


def infer_enhanced(abilities):
    """Name the alternate form when the wiki has one page for each of a
    character's two stances.

    Aglaea has two abilities both typed Basic ATK and both described as "is
    Aglaea's Basic ATK" — Thorned Nectar is the one she uses normally, and
    Slash by a Thousandfold Kiss replaces it while Garmentmaker is out. The
    wiki records no difference between them beyond `tag`, so the game's own
    distinction has to be reconstructed here.

    The rule is deliberately narrow, because guessing wrong renames a real
    ability: it fires only when a type has exactly two abilities. Within the
    pair the single-target one is the base and the wider-hitting one is the
    alternate, with sortkey breaking a tie.

    Runs after current_kit(), so the pair is always two abilities of one kit —
    never an ability and its superseded self. Blade comes through it correctly:
    of his two 3.4 Basic ATKs, Shard Sword is the one he opens with and Forest
    of Swords is what it becomes under Hellscape.
    """
    by_type = {}
    for a in abilities:
        by_type.setdefault((a.get("type") or "").strip().lower(), []).append(a)

    out = list(abilities)
    for atype, group in by_type.items():
        enhanced_type = "enhanced %s" % atype
        if enhanced_type not in LEVEL_CAPS:
            continue
        # Already has a real Enhanced counterpart from an "/Enhanced" page.
        if by_type.get(enhanced_type):
            continue
        if len(group) != 2:
            continue

        def rank(a):
            tag = (a.get("tag") or "").strip().lower()
            key = a.get("sortkey") or ""
            return (tag != "single target", int(key) if key.isdigit() else 0)

        base, alternate = sorted(group, key=rank)
        if rank(base) == rank(alternate):
            continue  # nothing separates them; leave both as they are
        out[out.index(alternate)] = dict(
            alternate, type="Enhanced %s" % (alternate.get("type") or "").strip()
        )
    return out


def current_kit(entries):
    """Drop the superseded half of a reworked kit.

    Eleven characters have been reworked (Blade and Seele in 3.4, Sparkle in
    4.0, Seele's Ultimate again in 4.2 …). The wiki keeps both kits: the
    original on the plain page, the rework on a "<name>/Enhanced" subpage, shown
    on the character page as Base and Enhanced tabs.

    "/Enhanced" therefore does not mean an enhanced state in combat — it means
    the current version of the ability. Merging both tabs printed every one of
    those abilities twice, once with numbers the game no longer uses. When a
    page has an /Enhanced counterpart the counterpart wins and the original is
    dropped; abilities without one are untouched.
    """
    superseded = {
        e["page"][: -len("/Enhanced")]
        for e in entries
        if str(e.get("page", "")).endswith("/Enhanced")
    }
    return [e for e in entries if e.get("page") not in superseded]


def _num(v):
    """A wiki value as a plain number: "57.2%" and "57.2" both -> 57.2."""
    try:
        return float(str(v).strip().rstrip("%"))
    except ValueError:
        return None


def _endpoints(text):
    """The first and last number of a range as written in the prose."""
    parts = re.split(r"[—–-]", text)
    if len(parts) < 2:
        return None
    lo, hi = _num(parts[0]), _num(parts[-1])
    return None if lo is None or hi is None else (lo, hi)


def match_by_value(ranges, attrs):
    """Pair each range with the table row that starts and ends on its numbers.

    The surest way to know which row a range belongs to is that they agree at
    both ends. Position does not survive contact with the data: Xueyi's Ultimate
    quotes two values that are rows 1 and 3 of its table, skipping the middle
    one, and Blade's enhanced Basic ATK has a table listing its values twice —
    once as percentages and once as decimals.

    Returns a list of attr rows in range order, or None if any range matches no
    row or more than one (ambiguous, so not worth guessing at).
    """
    ends = [(_endpoints(m.group(0)), m) for m in ranges]
    if any(e is None for e, _ in ends):
        return None

    picked, used = [], set()
    for target, _ in ends:
        hits = [
            i
            for i, v in enumerate(attrs)
            if i not in used
            and len(v) > 1
            and _num(v[0]) is not None
            and abs(_num(v[0]) - target[0]) < 1e-9
            and abs((_num(v[-1]) or 0) - target[1]) < 1e-9
        ]
        if len(hits) != 1:
            return None
        used.add(hits[0])
        picked.append(attrs[hits[0]])
    return picked


def align_values(desc, attrs):
    """Match the ranges in an ability's prose to the rows of its table.

    -> (description with a {token} at each value, scalings) or None.

    Two alignments are tried, in this order:

    Positional — every mention is its own value. Blade's Basic ATK really does
    have two table rows both reading 20%—44%, one scaling off ATK and one off
    Max HP, so identical text is not always the same value.

    By distinct value — an ability quotes one value twice ("deals 25%—55% ...
    each time dealing 25%—55%") and the table lists it once. Every mention still
    becomes a token; they all resolve to the one scaling.

    Neither matching means we cannot tell which number is which, so the caller
    keeps the prose. A wrong alignment would state confident numbers that are
    not this ability's.
    """
    ranges = list(RANGE_RE.finditer(desc))
    if not attrs or not ranges or not all(len(v) > 1 for v in attrs):
        return None

    distinct, first_at = [], {}
    for m in ranges:
        if m.group(0) not in first_at:
            first_at[m.group(0)] = m
            distinct.append(m.group(0))

    by_value = match_by_value(ranges, attrs)
    if len(ranges) == len(attrs):
        chosen, per_occurrence = list(zip(ranges, attrs)), True
    elif by_value:
        # The table has rows the prose never quotes, or quotes out of order.
        chosen, per_occurrence = list(zip(ranges, by_value)), True
    elif len(distinct) == len(attrs):
        chosen, per_occurrence = [(first_at[t], v) for t, v in zip(distinct, attrs)], False
    else:
        return None

    scalings, tokens, used = [], [], set()
    for m, values in chosen:
        label = label_for_context(desc[: m.start()], desc[m.end() :])
        token = slug_label(label)
        if not token or token in used:
            token = str(len(scalings) + 1)
        used.add(token)
        tokens.append(token)
        scalings.append({
            "label": label or "Value %d" % (len(scalings) + 1),
            "values": values,
        })

    if per_occurrence:
        out, last = [], 0
        for (m, _), token in zip(chosen, tokens):
            out.append(desc[last : m.start()])
            out.append("{%s}" % token)
            last = m.end()
        out.append(desc[last:])
        return "".join(out), scalings

    token_of = dict(zip(distinct, tokens))
    return RANGE_RE.sub(lambda m: "{%s}" % token_of[m.group(0)], desc), scalings


def ability_rows(entry):
    """The kit rows for one character's levelled abilities and traces."""
    rows = []
    abilities = entry.get("abilities") or []

    def order(a):
        t = (a.get("type") or "").strip().lower()
        return (TYPE_ORDER.index(t) if t in TYPE_ORDER else len(TYPE_ORDER), a.get("title", ""))

    for a in sorted(infer_enhanced(current_kit(abilities)), key=order):
        atype = (a.get("type") or "").strip()
        desc = clean_wikitext(a.get("desc") or "")
        if not desc and not a.get("title"):
            continue

        # A Bonus Ability is a trace: a fixed effect with no level, so it keeps
        # its prose and is grouped away from the levelled kit.
        is_trace = atype.lower() == "bonus ability"
        row = {"type": "Trace" if is_trace else atype, "name": html.unescape(a.get("title", ""))}
        if a.get("tag"):
            row["tag"] = a["tag"]
        if is_trace:
            row["group"] = "Traces"

        attrs = a.get("attrs") or []
        cap = LEVEL_CAPS.get(atype.lower())
        if cap:
            attrs = [v[:cap] for v in attrs]

        aligned = align_values(desc, attrs)
        if aligned:
            row["description"], row["scalings"] = aligned
        else:
            row["description"] = desc

        rows.append(row)
    # A trace is one effect, so an "/Enhanced" variant of it collapses into the
    # base the way an eidolon does. A levelled ability is only a duplicate when
    # its name, type and text all match — Blade's enhanced Basic ATK shares a
    # name with the base but is a different attack.
    def key(r):
        if r.get("group") == "Traces":
            return ("trace", r.get("name"))
        return (r.get("name"), r.get("type"), r.get("description"))

    return dedupe(rows, key)


def eidolon_rows(entry):
    rows = []
    for e in current_kit(entry.get("eidolons") or []):
        lvl = e.get("level") or ""
        rows.append({
            "type": "E%s" % lvl if lvl else "Eidolon",
            "group": "Eidolons",
            "name": html.unescape(e.get("title", "")),
            "description": clean_wikitext(e.get("desc") or ""),
        })
    # One eidolon level has one effect. An "/Enhanced" subpage repeats a level
    # with a conditional variant, and the base page is listed first.
    return dedupe(rows, lambda r: (r.get("type"), r.get("name")))


def main():
    # Fail before writing if the label heuristic has drifted from the
    # TypeScript one the admin editor uses.
    check_fixtures()

    with io.open(WIKI, encoding="utf-8") as f:
        wiki = json.load(f)
    with io.open(CATALOG, encoding="utf-8") as f:
        catalog = json.load(f)

    rows, missing, unaligned = [], [], []
    for name in sorted(catalog):
        entry = wiki.get(name)
        if not entry:
            missing.append(name)
            continue
        kit = ability_rows(entry) + eidolon_rows(entry)
        for r in kit:
            if r.get("type") not in ("Trace",) and not r.get("group") and not r.get("scalings"):
                if RANGE_RE.search(r.get("description", "")):
                    unaligned.append("%s / %s" % (name, r.get("name")))
        rows.append({
            "game": GAME,
            "section": "characters",
            "schema": "Character",
            "slug": catalog[name],
            "data": {"kit": kit},
        })

    rows.sort(key=lambda r: r["slug"])
    with io.open(OUT, "w", encoding="utf-8", newline="\n") as f:
        json.dump(rows, f, ensure_ascii=False, indent=1)
        f.write("\n")

    kit_rows = sum(len(r["data"]["kit"]) for r in rows)
    scaled = sum(1 for r in rows for k in r["data"]["kit"] if k.get("scalings"))
    scalings = sum(len(k.get("scalings", [])) for r in rows for k in r["data"]["kit"])
    print("%-32s %d characters" % (os.path.basename(OUT), len(rows)))
    print("  kit rows : %d (%d with scalings, %d scalings total)" % (kit_rows, scaled, scalings))
    if missing:
        print("  !! no wiki kit for: %s" % ", ".join(missing))
    if unaligned:
        print("  !! %d abilities kept as prose (range/table counts disagreed):" % len(unaligned))
        for u in unaligned[:15]:
            print("     %s" % u)


if __name__ == "__main__":
    main()
