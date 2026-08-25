#!/usr/bin/env python3
"""Build the material catalog and the per-character ascension costs.

Reads seed_data/hsr_ascension_wiki.json (see fetch_hsr_ascension_wiki.py) and
writes three files:

  seed_data/hsr_materials_import.json
      One row per material, for a `materials` section using a `Material`
      schema — name, rarity, type and the description from its own page.
      Upload at Admin -> Items -> Import.

  seed_data/hsr_ascension_import.json
      Enrichment rows for the 85 characters that already exist, adding
      `ascension_cost` and `trace_cost`. Upload at Admin -> Items -> Import
      with "Update them", the same as the profile and kit passes.

  seed_data/hsr_stats_import.json
      Base HP/ATK/DEF/SPD at every ascension breakpoint. PARKED: it needs the
      table field type from feature/leveling-table-field, which is not merged.
      Built anyway so it lands the day that branch does; do not upload it
      before then, as the rows would store as opaque JSON.

Costs are emitted as {type, description} rows — the same shape as the character
`kit`, light cone `effect` and relic `set_bonus` fields — so the detail page
renders them with the block it already has. The structured item/quantity pairs
stay in the cache for anything that later wants to total them up.

    python make_hsr_materials.py
"""

import argparse
import io
import json
import os
import re

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "seed_data")
GAME = "honkai-star-rail"
WIKI = os.path.join(DATA, "hsr_ascension_wiki.json")
CATALOG = os.path.join(DATA, "hsr_characters_catalog.json")
OUT_MATERIALS = os.path.join(DATA, "hsr_materials_import.json")
OUT_ASCENSION = os.path.join(DATA, "hsr_ascension_import.json")
OUT_STATS = os.path.join(DATA, "hsr_stats_import.json")


def slugify(name):
    """Same rule as the other importers, so slugs stay consistent."""
    s = name.lower().replace("•", " ").replace("&", " and ").replace(".", "")
    s = re.sub(r"\(.*?\)", " ", s)
    return re.sub(r"[^a-z0-9]+", "-", s).strip("-")


def clean(text):
    """Wikitext -> plain sentence, for the material descriptions."""
    if not text:
        return None
    text = re.sub(r"\[\[(?:[^\]|]*\|)?([^\]|]*)\]\]", r"\1", text)
    text = re.sub(r"<br\s*/?>", "\n", text)
    text = re.sub(r"</?[a-zA-Z][^>]*>", "", text)
    return text.replace("'''", "").replace("''", "").strip()


def cost_text(cost):
    """[{item, qty}] -> "4,000 Credit, 5 Dream Collection Component"."""
    return ", ".join("{:,} {}".format(c["qty"], c["item"]) for c in cost)


def material_rows(materials):
    rows = []
    for name in sorted(materials):
        m = materials[name]
        data = {"name": name}
        if m.get("rarity"):
            data["rarity"] = m["rarity"]
        if m.get("type"):
            data["material_type"] = m["type"]
        if clean(m.get("description")):
            data["description"] = clean(m["description"])
        if clean(m.get("source")):
            data["source"] = clean(m["source"])
        rows.append({
            "game": GAME,
            "section": "materials",
            "schema": "Material",
            "slug": slugify(name),
            "data": data,
        })
    return rows


def character_rows(wiki, catalog):
    rows, problems = [], []
    for name in sorted(k for k in wiki if k != "_materials"):
        slug = catalog.get(name)
        if not slug:
            problems.append("%s: not in the character catalog, no slug to address" % name)
            continue
        entry = wiki[name]
        ascension = [
            {"type": "Ascension %d → %d" % (s["from"], s["to"]), "description": cost_text(s["cost"])}
            for s in entry["ascension"]
        ]
        traces = [
            {"type": t["label"], "description": cost_text(t["cost"])}
            for t in entry["trace_totals"]
        ]
        if not ascension:
            problems.append("%s: no ascension steps" % name)
            continue
        rows.append({
            "game": GAME,
            "section": "characters",
            "schema": "Character",
            "slug": slug,
            "data": {"ascension_cost": ascension, "trace_cost": traces},
        })
    return rows, problems


def stat_rows(wiki, catalog):
    rows = []
    for name in sorted(k for k in wiki if k != "_materials"):
        slug = catalog.get(name)
        if not slug or not wiki[name]["stats"]:
            continue
        rows.append({
            "game": GAME,
            "section": "characters",
            "schema": "Character",
            "slug": slug,
            "data": {
                "ascension_stats": {
                    "columns": ["Level", "HP", "ATK", "DEF", "SPD"],
                    "rows": [
                        [s["level"], s["hp"], s["atk"], s["def"], s["spd"]]
                        for s in wiki[name]["stats"]
                    ],
                }
            },
        })
    return rows


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--wiki", default=WIKI)
    ap.add_argument("--catalog", default=CATALOG)
    args = ap.parse_args()

    wiki = json.load(io.open(args.wiki, encoding="utf-8"))
    catalog = json.load(io.open(args.catalog, encoding="utf-8"))
    materials = wiki.get("_materials") or {}

    mats = material_rows(materials)
    chars, problems = character_rows(wiki, catalog)
    stats = stat_rows(wiki, catalog)

    for path, payload in (
        (OUT_MATERIALS, mats),
        (OUT_ASCENSION, chars),
        (OUT_STATS, stats),
    ):
        with io.open(path, "w", encoding="utf-8", newline="\n") as f:
            json.dump(payload, f, ensure_ascii=False, indent=1)
            f.write("\n")
        print("%-30s %d rows" % (os.path.basename(path), len(payload)))

    # Every material a character asks for must exist in the catalog, or the
    # ascension text names something the site has no page for.
    referenced = {
        c["item"]
        for k, v in wiki.items()
        if k != "_materials"
        for g in v["ascension"] + v["trace_totals"]
        for c in g["cost"]
    }
    missing = sorted(referenced - set(materials))
    by_type = {}
    for m in materials.values():
        by_type[m.get("type") or "?"] = by_type.get(m.get("type") or "?", 0) + 1
    print("  materials by type: %s" % ", ".join("%s %d" % (k, by_type[k]) for k in sorted(by_type)))
    print("  costs:             %d ascension rows, %d trace rows"
          % (sum(len(r["data"]["ascension_cost"]) for r in chars),
             sum(len(r["data"]["trace_cost"]) for r in chars)))
    print("  stats:             PARKED until feature/leveling-table-field merges")
    if missing:
        print("  !! %d referenced materials have no catalog row: %s"
              % (len(missing), ", ".join(missing[:10])))
    if problems:
        print("  !! %d problems:" % len(problems))
        for p in problems[:20]:
            print("     %s" % p)


if __name__ == "__main__":
    main()
