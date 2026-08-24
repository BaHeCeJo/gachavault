#!/usr/bin/env python3
"""Build the Honkai: Star Rail relic set import files.

Reads seed_data/hsr_relics_wiki.json (see fetch_hsr_relic_wiki.py) and writes
one file per family, because they are separate sections on the site:

  seed_data/hsr_relics_import.json      32 Cavern Relics    -> `relics`
  seed_data/hsr_ornaments_import.json   28 Planar Ornaments -> `planar-ornaments`

Each row is {game, section, schema, slug, data} — name, rarity, set bonuses and
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

# Cavern Relics and Planar Ornaments are separate sections, not one section
# with a type field. They are separate equipment categories in-game, farmed in
# different places, and only cavern sets have a 4-piece bonus -- a field that
# would be null for every ornament. Until faceted filtering exists a shared
# section could not be narrowed to one family anyway.
FAMILIES = {
    "Cavern Relic": {
        "section": "relics",
        "schema": "Relic Sets",
        "out": os.path.join(DATA, "hsr_relics_import.json"),
    },
    "Planar Ornament": {
        "section": "planar-ornaments",
        "schema": "Planar Ornaments",
        "out": os.path.join(DATA, "hsr_ornaments_import.json"),
    },
}


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
        if kind not in FAMILIES:
            problems.append("%s: unknown type %r" % (name, kind))
            continue

        bonuses = set_bonus_rows(entry)
        if not bonuses:
            problems.append("%s: no set bonus text" % name)
            continue

        rarities = entry.get("rarities") or []
        data = {
            "name": name,
            # No relic_type field: the section already says which family this
            # is, so storing it again would be a second source of truth.
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
        # Joined, not left as lists: no field type stores an array of plain
        # strings. The closest is a multi-value attribute, which stores
        # attribute keys and needs every value creating in admin first — worth
        # doing for tags once they drive filtering, but a text field until then.
        if entry.get("sources"):
            data["sources"] = ", ".join(entry["sources"])
        if entry.get("utilities"):
            data["tags"] = ", ".join(entry["utilities"])

        rows.append({
            "game": GAME,
            "section": FAMILIES[kind]["section"],
            "schema": FAMILIES[kind]["schema"],
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
    args = ap.parse_args()

    wiki = json.load(io.open(args.wiki, encoding="utf-8"))
    rows, problems = build(wiki)
    if problems:
        raise SystemExit("\n".join("!! " + p for p in problems))

    for kind, family in FAMILIES.items():
        payload = sorted(
            (r for r in rows if r["section"] == family["section"]),
            key=lambda r: r["slug"],
        )
        with io.open(family["out"], "w", encoding="utf-8", newline="\n") as f:
            json.dump(payload, f, ensure_ascii=False, indent=1)
            f.write("\n")

        four_pc = sum(1 for r in payload for b in r["data"]["set_bonus"] if b["type"] == "4-Piece")
        pieces = sum(len(r["data"]["pieces"]) for r in payload)
        print("%-30s %d rows  (section %s)"
              % (os.path.basename(family["out"]), len(payload), family["section"]))
        print("  %d with a 4-piece bonus, %d pieces, %d tagged"
              % (four_pc, pieces, sum(1 for r in payload if r["data"].get("tags"))))


if __name__ == "__main__":
    main()
