#!/usr/bin/env python3
"""Build the Honkai: Star Rail relic set import file.

Reads seed_data/hsr_relics_wiki.json (see fetch_hsr_relic_wiki.py) and writes
seed_data/hsr_relics_import.json — one row per set:

  {game, section, schema, slug, data} — name, type, rarity, set bonuses and
  the pieces that make up the set.

Two of the fields are shaped as lists of {type, name, description} rows rather
than flat strings, matching the character `kit` and light cone `effect` fields.
That is deliberate: the detail page already has a block that renders that
shape, so relics get the same presentation for free instead of needing a
relic-specific renderer.

  set_bonus  2-Piece / 4-Piece, the effect a reader is actually choosing between
  pieces     the individual relics, labelled by the slot they equip into

Planar Ornaments legitimately have no 4-piece bonus and only two pieces, so a
shorter list is correct for them rather than a gap to fill.

    python make_hsr_relics.py
"""

import argparse
import io
import json
import os
import re

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "seed_data")
GAME = "honkai-star-rail"
WIKI = os.path.join(DATA, "hsr_relics_wiki.json")
OUT = os.path.join(DATA, "hsr_relics_import.json")

SECTION = "relics"
SCHEMA = "Relic Sets"

# The site writes types as lowercase keys the way it does paths and elements.
TYPE_KEYS = {"Cavern Relic": "cavern_relic", "Planar Ornament": "planar_ornament"}


def slugify(name):
    """Same rule as the light cone/character importers, so slugs stay consistent."""
    s = name.lower().replace("•", " ").replace("&", " and ").replace(".", "")
    s = re.sub(r"\(.*?\)", " ", s)
    return re.sub(r"[^a-z0-9]+", "-", s).strip("-")


def set_bonus_rows(entry):
    """2-Piece and 4-Piece as renderable rows, in the order the game lists them."""
    rows = []
    for count, text in (("2", entry.get("bonus_2pc")), ("4", entry.get("bonus_4pc"))):
        if text:
            rows.append({"type": "%s-Piece" % count, "description": text})
    return rows


def piece_rows(entry):
    """The individual relics, labelled by slot — Head, Hands, Link Rope, ..."""
    return [{"type": p["slot"], "name": p["name"]} for p in entry.get("pieces", [])]


def build(wiki):
    rows, problems = [], []
    for name in sorted(wiki):
        entry = wiki[name]
        kind = entry.get("type")
        if kind not in TYPE_KEYS:
            problems.append("%s: unknown type %r" % (name, kind))
            continue

        bonuses = set_bonus_rows(entry)
        if not bonuses:
            problems.append("%s: no set bonus text" % name)
            continue

        rarities = entry.get("rarities") or []
        data = {
            "name": name,
            "relic_type": TYPE_KEYS[kind],
            # The top rarity is the one a set is farmed at; the full span is
            # kept alongside it because low-rarity drops still exist in-game.
            "rarity": str(max(rarities)) if rarities else "",
            "rarity_range": (
                "%d-%d" % (min(rarities), max(rarities))
                if len(rarities) > 1
                else (str(rarities[0]) if rarities else "")
            ),
            "set_bonus": bonuses,
            "pieces": piece_rows(entry),
        }
        if entry.get("release_version"):
            data["release_version"] = entry["release_version"]
        if entry.get("sources"):
            data["sources"] = entry["sources"]
        if entry.get("utilities"):
            data["tags"] = entry["utilities"]

        rows.append({
            "game": GAME,
            "section": SECTION,
            "schema": SCHEMA,
            "slug": slugify(name),
            "data": data,
        })

    seen = {}
    for r in rows:
        seen.setdefault(r["slug"], []).append(r["data"]["name"])
    for slug, names in sorted(seen.items()):
        if len(names) > 1:
            problems.append("duplicate slug %r: %s" % (slug, ", ".join(names)))

    return rows, problems


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--wiki", default=WIKI)
    ap.add_argument("--out", default=OUT)
    args = ap.parse_args()

    wiki = json.load(io.open(args.wiki, encoding="utf-8"))
    rows, problems = build(wiki)
    if problems:
        raise SystemExit("\n".join("!! " + p for p in problems))

    rows.sort(key=lambda r: r["slug"])
    with io.open(args.out, "w", encoding="utf-8", newline="\n") as f:
        json.dump(rows, f, ensure_ascii=False, indent=1)
        f.write("\n")

    by_type = {}
    for r in rows:
        k = r["data"]["relic_type"]
        by_type[k] = by_type.get(k, 0) + 1
    four_pc = sum(1 for r in rows for b in r["data"]["set_bonus"] if b["type"] == "4-Piece")
    print("%-30s %d rows" % (os.path.basename(args.out), len(rows)))
    print("  type:    %s" % ", ".join("%s %d" % (k, by_type[k]) for k in sorted(by_type)))
    print("  bonuses: %d sets with a 4-piece, %d pieces total"
          % (four_pc, sum(len(r["data"]["pieces"]) for r in rows)))
    print("  tagged:  %d sets carry the wiki's utility tags"
          % sum(1 for r in rows if r["data"].get("tags")))


if __name__ == "__main__":
    main()
