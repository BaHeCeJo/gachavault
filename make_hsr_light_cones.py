#!/usr/bin/env python3
"""Turn the pasted light cone catalog into an import file.

Reads seed_data/hsr_light_cones_raw.txt — the light cone list as it appears on
the source site, where each entry is:

    <Name>
    <Name>[ New]           # the site repeats the name; "New" is a UI badge
    Rarity: N★

    Path: <Path>

    <effect text, superimpose 1/2/3/4/5 values separated by slashes>

    HP
    HP
    +<max-level HP>
    ATK
    ATK
    +<max-level ATK>
    DEF
    DEF
    +<max-level DEF>

and writes:

  seed_data/hsr_light_cones_import.json
      One row per light cone in the shape /admin/items/import expects:
      {game, section, schema, slug, data} — name, rarity, path and effect.

Load that file in the admin bulk-import screen. Nothing here writes to the
site; these scripts only ever produce a file for a human to import.

The effect comes from seed_data/hsr_light_cones_wiki.json, not from the prose
in the raw file above. The raw text runs its per-superimposition numbers
together ("by 12/14/16/18/20%") and is lossy — it rounds decimals, truncates
them, and is in places simply wrong. The wiki states the same effect with a
marker at each value's position and the value listed at every rank, so both
come across exactly. See fetch_hsr_light_cone_wiki.py.

Each cone becomes a one-row `effect` skilllist: the ability's name, its
sentence with a {token} at each value, and one {label, values[]} scaling per
token. The site splices the value for the chosen superimposition back into the
sentence — the schema that can finally express the curve.

The HP/ATK/DEF are still parsed but not imported — they validate the raw file's
shape and the counts get reported, but they depend on the cone's level and
ascension, and storing one snapshot in a flat field would state as fact
something that is only true at one point on the curve.

The source gives no availability or release version/date, so those fields are
left unset rather than guessed.
"""

import io
import json
import os
import re

from scaling_extract import check_fixtures, label_for_context, slugify as slug_label

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "seed_data")
GAME = "honkai-star-rail"
RAW = os.path.join(DATA, "hsr_light_cones_raw.txt")
OUT = os.path.join(DATA, "hsr_light_cones_import.json")
WIKI = os.path.join(DATA, "hsr_light_cones_wiki.json")

# Profile text — the blurb, flavour quote, release and voice actors. Cached by
# fetch_hsr_profiles.py; see seed_data/README.md.
PROFILES = os.path.join(DATA, "hsr_profiles.json")


def profile_fields(profiles, name, keys):
    """The non-empty profile values for one item, ready to merge into its row."""
    p = (profiles or {}).get(name) or {}
    return {k: p[k] for k in keys if p.get(k)}

# The site writes the Hunt without its article; the game's attribute key has it.
PATH_KEYS = {
    "abundance": "abundance",
    "destruction": "destruction",
    "elation": "elation",
    "erudition": "erudition",
    "harmony": "harmony",
    "hunt": "the_hunt",
    "the hunt": "the_hunt",
    "nihility": "nihility",
    "preservation": "preservation",
    "remembrance": "remembrance",
}

RARITY_RE = re.compile(r"^Rarity:\s*(\d)★$")
PATH_RE = re.compile(r"^Path:\s*(.+?)\s*$")
STAT_RE = re.compile(r"^\+([\d,]+)$")


def slugify(name):
    """Same rule as the banner/character importers, so slugs stay consistent."""
    s = name.lower().replace("•", " ").replace("&", " and ").replace(".", "")
    s = re.sub(r"\(.*?\)", " ", s)
    return re.sub(r"[^a-z0-9]+", "-", s).strip("-")


def take_stats(lines):
    """Pull the trailing HP/ATK/DEF block off an entry's body.

    Returns (stats dict, remaining body lines). Entries whose stats the source
    hasn't published yet ("Coming Soon!") have no block, and get no stats.
    """
    want = ["HP", "ATK", "DEF"]
    tail = [l for l in lines if l.strip()]
    if len(tail) < 9:
        return {}, lines
    block = tail[-9:]
    stats = {}
    for i, label in enumerate(want):
        a, b, c = block[i * 3 : i * 3 + 3]
        m = STAT_RE.match(c.strip())
        if not (a.strip() == label and b.strip() == label and m):
            return {}, lines
        stats["base_" + label.lower()] = int(m.group(1).replace(",", ""))
    # Drop the block from the body: it is the last 9 non-blank lines.
    cut, seen = len(lines), 0
    for i in range(len(lines) - 1, -1, -1):
        if lines[i].strip():
            seen += 1
            if seen == 9:
                cut = i
                break
    return stats, lines[:cut]


def parse(text):
    lines = text.splitlines()
    marks = [i for i, l in enumerate(lines) if RARITY_RE.match(l.strip())]
    entries = []
    for n, idx in enumerate(marks):
        name = lines[idx - 2].strip()
        echo = lines[idx - 1].strip()
        # The second line repeats the name, optionally with a "New" badge; if it
        # doesn't, the entry isn't shaped the way we think and we want to know.
        if echo not in (name, name + " New"):
            raise ValueError("entry %d (%r): unexpected second line %r" % (n, name, echo))

        rarity = RARITY_RE.match(lines[idx].strip()).group(1)
        path_line = next(l for l in lines[idx + 1 :] if l.strip())
        pm = PATH_RE.match(path_line.strip())
        if not pm:
            raise ValueError("entry %r: expected a Path line, got %r" % (name, path_line))
        path = PATH_KEYS.get(pm.group(1).strip().lower())
        if not path:
            raise ValueError("entry %r: unknown path %r" % (name, pm.group(1)))

        start = lines.index(path_line, idx) + 1
        end = (marks[n + 1] - 2) if n + 1 < len(marks) else len(lines)
        stats, body = take_stats(lines[start:end])

        # Keep paragraph breaks, drop the blank run around them.
        effect = re.sub(r"\n{3,}", "\n\n", "\n".join(body).strip())
        entries.append(
            {
                "name": name,
                "slug": slugify(name),
                "rarity": rarity,
                "path": path,
                "effect": effect,
                "stats": stats,
                "is_new": echo.endswith(" New"),
            }
        )
    return entries


# Wiki values corrected here, keyed by (light cone, variable number). Both of
# these break an otherwise perfect arithmetic series at one position AND
# disagree with the pasted catalog, which has the arithmetic value — two
# independent signals that the wiki has a typo. Applied openly and reported on
# every build rather than silently, and worth re-checking in game.
VALUE_OVERRIDES = {
    # 72/84/96/[106]/120 steps by 12 except once; the catalog says 108.
    ("Flickering Stars", 3): ["72", "84", "96", "108", "120"],
    # 12/14/16/[20]/20 steps by 2 except once; the catalog says 18.
    ("Mushy Shroomy's Adventures", 1): ["12", "14", "16", "18", "20"],
}


def arithmetic_breaks(values):
    """True if exactly one interior value stops the series being arithmetic.

    Every scaling in this catalog steps evenly, so a single value out of line is
    a typo rather than game design — the check that found the two overrides
    above, kept so a future wiki edit cannot reintroduce one unnoticed."""
    try:
        v = [float(x.rstrip("%")) for x in values]
    except ValueError:
        return False
    if len(v) < 4:
        return False
    steps = {round(v[i + 1] - v[i], 6) for i in range(len(v) - 1)}
    if len(steps) == 1:
        return False
    for i in range(1, len(v) - 1):
        fixed = v[:]
        fixed[i] = (v[i - 1] + v[i + 1]) / 2.0
        if len({round(fixed[j + 1] - fixed[j], 6) for j in range(len(v) - 1)}) == 1:
            return True
    return False


# "(var1)" in the wiki's effect text, optionally carrying the unit that belongs
# with its value.
MARKER_RE = re.compile(r"\(var(\d+)\)(%?)")


def effect_row_from_wiki(name, entry):
    """One skilllist row built from a light cone's wiki infobox, or None.

    The wiki marks each value's position in the sentence and lists its value at
    every rank, so both come across exactly — no parsing numbers back out of
    prose, and no rounding. Only the value's *name* is inferred, from the words
    around it, because the infobox does not name its variables.

    Typed "Light Cone Effect" so the site resolves the slider to superimposition
    (S1-S5) rather than a character's skill levels."""
    text = (entry.get("effect") or "").strip()
    if not text:
        return None

    variables = entry.get("variables") or {}
    row = {"type": "Light Cone Effect", "description": text}
    if entry.get("passive"):
        row["name"] = entry["passive"]

    scalings, used = [], set()
    for k in entry.get("var_order") or []:
        values = VALUE_OVERRIDES.get((name, k)) or variables.get(str(k))
        if not values:
            continue
        marker = "(var%d)" % k
        at = text.find(marker)
        if at < 0:
            continue
        # A "%" written just after the marker belongs to the value, so it moves
        # into the value and out of the sentence — the site highlights the whole
        # "12%" rather than leaving a stray sign behind the number.
        pct = text[at + len(marker) : at + len(marker) + 1] == "%"

        # Other markers would be read as words, so blank them out of the context
        # the label is guessed from.
        before = MARKER_RE.sub(" ", text[:at])
        after = MARKER_RE.sub(" ", text[at + len(marker) + (1 if pct else 0) :])
        label = label_for_context(before, after)

        token = slug_label(label)
        if not token or token in used:
            token = str(len(scalings) + 1)
        used.add(token)

        # Every occurrence: a cone can spend the same variable twice in one
        # sentence ("Subscribe for More!").
        text = text.replace(marker + "%" if pct else marker, "{%s}" % token)
        text = text.replace(marker, "{%s}" % token)
        scalings.append({
            "label": label or "Value %d" % (len(scalings) + 1),
            # Exactly as the wiki states them — never re-rounded or reformatted.
            "values": [v + "%" if pct else v for v in values],
        })

    row["description"] = text
    if scalings:
        row["scalings"] = scalings
    return row


def main():
    # Fail before writing anything if the offline extractor has drifted from the
    # TypeScript one the admin editor uses.
    check_fixtures()

    with io.open(WIKI, encoding="utf-8") as f:
        wiki_effects = json.load(f)
    with io.open(PROFILES, encoding="utf-8") as f:
        profiles = json.load(f)["light_cones"]

    with io.open(RAW, encoding="utf-8") as f:
        entries = parse(f.read())

    dupes = {e["slug"] for e in entries if [x["slug"] for x in entries].count(e["slug"]) > 1}
    if dupes:
        raise SystemExit("duplicate slugs: %s" % ", ".join(sorted(dupes)))

    rows, placeholder = [], []
    no_effect = []
    for e in entries:
        if not e["stats"]:
            placeholder.append(e["name"])
        data = {"name": e["name"], "rarity": e["rarity"], "path": e["path"]}
        data.update(profile_fields(profiles, e["name"], ("description", "release_version")))
        row = effect_row_from_wiki(e["name"], wiki_effects.get(e["name"]) or {})
        if row:
            data["effect"] = [row]
        else:
            # An empty list, not an absent key: the import merges per field, so
            # omitting it would leave behind whatever is already stored — and
            # an earlier build wrote a broken row for the cones the wiki has
            # not published yet.
            data["effect"] = []
            no_effect.append(e["name"])
        rows.append(
            {
                "game": GAME,
                "section": "light-cones",
                "schema": "Light Cones",
                "slug": e["slug"],
                # HP/ATK/DEF stay out — see the module docstring.
                "data": data,
            }
        )

    rows.sort(key=lambda r: r["slug"])
    with io.open(OUT, "w", encoding="utf-8", newline="\n") as f:
        json.dump(rows, f, ensure_ascii=False, indent=1)
        f.write("\n")

    by_rarity = {}
    by_path = {}
    for e in entries:
        by_rarity[e["rarity"]] = by_rarity.get(e["rarity"], 0) + 1
        by_path[e["path"]] = by_path.get(e["path"], 0) + 1
    print("%-32s %d rows" % (os.path.basename(OUT), len(rows)))
    print("  rarity: %s" % ", ".join("%s★ %d" % (k, by_rarity[k]) for k in sorted(by_rarity)))
    print("  path:   %s" % ", ".join("%s %d" % (k, by_path[k]) for k in sorted(by_path)))
    with_effect = sum(1 for r in rows if r["data"].get("effect"))
    scaled = sum(1 for r in rows for a in r["data"].get("effect", []) if a.get("scalings"))
    print("  effect: %d rows, %d with per-superimposition scalings" % (with_effect, scaled))
    print("  HP/ATK/DEF parsed but not imported (level/ascension curves)")
    if no_effect:
        print("  no effect text: %s" % ", ".join(no_effect))
    if VALUE_OVERRIDES:
        print("  wiki values corrected: %s" % ", ".join(
            "%s var%d" % (n, k) for n, k in sorted(VALUE_OVERRIDES)))
    odd = [
        "%s / %s" % (r["data"]["name"], sc["label"])
        for r in rows
        for a in r["data"].get("effect", [])
        for sc in a.get("scalings", [])
        if arithmetic_breaks(sc["values"])
    ]
    if odd:
        print("  !! %d scaling(s) break an even series — check the wiki:" % len(odd))
        for o in odd:
            print("     %s" % o)
    if placeholder:
        print("  not published at the source yet: %s" % ", ".join(placeholder))
    new = [e["name"] for e in entries if e["is_new"]]
    if new:
        print("  flagged New by the source: %s" % ", ".join(new))


if __name__ == "__main__":
    main()
