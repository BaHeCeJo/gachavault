#!/usr/bin/env python3
"""Turn the scraped warp history into files you can hand to the admin UI.

Reads seed_data/hsr_warps.json (a cached scrape of the wiki warp history) and
writes:

  seed_data/hsr_banners_import.json
      One row per warp name, in the shape /admin/items/import expects:
      {game, section, schema, slug, data}. Upload it there to create every
      banner preset in one go.

  seed_data/hsr_events_import.json
      One row per run, with times already converted from the wiki's GMT+8 to
      UTC and characters resolved to item slugs. This is the payload an events
      bulk import would take; until that exists it doubles as the reference to
      enter runs from, and as the input the seeder script consumes.

  seed_data/hsr_banner_art.txt
      Banner slug -> wiki art URL, for uploading art separately.

CAUTION: hsr_warps.json is behind the import files it produces. Re-running this
today rebuilds hsr_events_import.json with 108 runs where the built file has
136 — the cache covers character warps only, and the built file also carries
the light cone warps (Cauldron Contrivance, Contract Zero, ...). Re-scrape the
warp history before re-running, or you will silently drop 42 runs. Anything
that only needs to *read* the runs should read hsr_events_import.json instead,
which is what make_hsr_versions.py does.
"""

import io
import json
import os
import re
from datetime import datetime, timedelta

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "seed_data")
GAME = "honkai-star-rail"

NAME_OVERRIDES = {"Topaz & Numby": "topaz-numby"}


def slugify(name):
    s = name.lower().replace("•", " ").replace("&", " and ").replace(".", "")
    s = re.sub(r"\(.*?\)", " ", s)
    return re.sub(r"[^a-z0-9]+", "-", s).strip("-")


def char_slug(name):
    return NAME_OVERRIDES.get(name) or slugify(name)


def to_utc(local, offset=8):
    text = (local or "").strip()[:19]
    for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%d %H:%M", "%Y-%m-%d"):
        try:
            return (datetime.strptime(text, fmt) - timedelta(hours=offset)).strftime(
                "%Y-%m-%dT%H:%M:%SZ"
            )
        except ValueError:
            continue
    return None


with io.open(os.path.join(DATA, "hsr_warps.json"), encoding="utf-8") as f:
    runs = json.load(f)

# ── banner presets ───────────────────────────────────────────────────────────
presets, art = {}, {}
for r in runs:
    slug = slugify(r["banner"])
    art.setdefault(slug, r.get("art_url"))
    if slug in presets:
        continue
    data = {"name": r["banner"]}
    if r.get("version"):
        data["version"] = r["version"]
    data["description"] = "Character Event Warp. First run: Version %s Phase %s (%s)." % (
        r["version"],
        r["phase"],
        r["run_date"],
    )
    presets[slug] = {
        "game": GAME,
        "section": "banners",
        "schema": "Banner",
        "slug": slug,
        "data": data,
    }

# ── runs ─────────────────────────────────────────────────────────────────────
events = []
for r in runs:
    offset = int((r.get("offset") or "GMT+8").replace("GMT", "").replace("+", "") or 8)
    end_raw = (r.get("time_end") or "").strip()
    events.append(
        {
            "game": GAME,
            "event_type": "banner",
            "slug": "%s-%s" % (slugify(r["banner"]), r["run_date"]),
            "title": ", ".join(r["five_star"]) or r["banner"],
            "description": "%s rate-up warp, Version %s Phase %s."
            % (r["banner"], r["version"], r["phase"]),
            "banner": slugify(r["banner"]),
            "start_at": to_utc(r["time_start"], offset),
            "end_at": to_utc(end_raw, offset) if re.match(r"^\d{4}-\d{2}-\d{2}", end_raw) else None,
            "timezone": "UTC+8",
            "is_published": True,
            # Version/phase are game-specific, so they ride in the event's free
            # -form data rather than as columns the importer has to know about.
            "data": {
                "version": r["version"],
                "phase": r["phase"],
                "source": "honkai-star-rail.fandom.com",
            },
            "featured_5": [char_slug(n) for n in r["five_star"]],
            "featured_4": [char_slug(n) for n in r["four_star"]],
        }
    )
events.sort(key=lambda e: e["start_at"])

out = [
    ("hsr_banners_import.json", sorted(presets.values(), key=lambda p: p["slug"])),
    ("hsr_events_import.json", events),
]
for name, payload in out:
    with io.open(os.path.join(DATA, name), "w", encoding="utf-8", newline="\n") as f:
        json.dump(payload, f, ensure_ascii=False, indent=1)
        f.write("\n")
    print("%-28s %d rows" % (name, len(payload)))

with io.open(os.path.join(DATA, "hsr_banner_art.txt"), "w", encoding="utf-8", newline="\n") as f:
    for slug in sorted(art):
        f.write("%s\t%s\n" % (slug, art[slug] or ""))
print("%-28s %d rows" % ("hsr_banner_art.txt", len(art)))
