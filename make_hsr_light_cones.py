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
      {game, section, schema, slug, data} — name, rarity and path only.

The effect text and the HP/ATK/DEF are parsed (they validate the file's shape,
and the counts get reported) but deliberately not imported: both are curves,
not values. The slash-separated numbers in an effect are its five superimpose
levels, and the stats depend on the cone's level and ascension. Storing one
snapshot of either in a flat field would state as fact something that is only
true at one point on the curve, so they stay in the raw file until there is a
schema that can express the scaling.

The source gives no availability, release version/date, skill name, or art, so
those fields are left unset rather than guessed — see seed_hsr_light_cones.py
for the art, which is scraped separately.
"""

import io
import json
import os
import re

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "seed_data")
GAME = "honkai-star-rail"
RAW = os.path.join(DATA, "hsr_light_cones_raw.txt")
OUT = os.path.join(DATA, "hsr_light_cones_import.json")

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


def main():
    with io.open(RAW, encoding="utf-8") as f:
        entries = parse(f.read())

    dupes = {e["slug"] for e in entries if [x["slug"] for x in entries].count(e["slug"]) > 1}
    if dupes:
        raise SystemExit("duplicate slugs: %s" % ", ".join(sorted(dupes)))

    rows, placeholder = [], []
    for e in entries:
        if not e["stats"]:
            placeholder.append(e["name"])
        rows.append(
            {
                "game": GAME,
                "section": "light-cones",
                "schema": "Light Cones",
                "slug": e["slug"],
                # Effect and stats are scaling curves — see the module docstring.
                "data": {"name": e["name"], "rarity": e["rarity"], "path": e["path"]},
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
    print("  effect + HP/ATK/DEF parsed but not imported (scaling curves)")
    if placeholder:
        print("  not published at the source yet: %s" % ", ".join(placeholder))
    new = [e["name"] for e in entries if e["is_new"]]
    if new:
        print("  flagged New by the source: %s" % ", ".join(new))


if __name__ == "__main__":
    main()
