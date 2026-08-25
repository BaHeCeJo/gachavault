#!/usr/bin/env python3
"""Build a patch timeline for the calendar.

The calendar has filtered on an `event_type` of `version` since it shipped,
with nothing ever writing one.

Reads two files:

  seed_data/hsr_versions_wiki.json   the Version Infobox per version -- the
                                     real patch name and release date
  seed_data/hsr_events_import.json   the warp runs, for the phase count and to
                                     sanity-check the dates

and writes seed_data/hsr_versions_import.json. Upload at
**Admin -> Events -> Import**; it references nothing, so the order against the
runs does not matter.

A version now starts on its stated release date rather than whenever its first
warp opened, and ends when the next version starts, so the timeline tiles with
no gaps or overlaps. The last version is the exception: nothing follows it yet,
so it ends with its final warp.

Two honesty notes carried in each row's `data`:

  * `release_date` is a date, not a timestamp. The wiki does not state the hour
    an update goes live, so the start is midnight in the game's UTC+8.
  * if a version's own first warp somehow opens before that, the start is
    clamped back to the warp -- a version must never begin after a banner it
    contains. The build prints every clamp.

    python make_hsr_versions.py
"""

import argparse
import io
import json
import os
from datetime import datetime, timedelta

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "seed_data")
GAME = "honkai-star-rail"
EVENTS = os.path.join(DATA, "hsr_events_import.json")
WIKI = os.path.join(DATA, "hsr_versions_wiki.json")
OUT = os.path.join(DATA, "hsr_versions_import.json")

# The game's own clock. Release dates are stated as plain dates in it.
GAME_UTC_OFFSET = 8


def version_slug(version):
    """1.0 -> version-1-0.

    The item slugify drops dots, which would turn both "1.0" and "10" into
    "10". Versions are the one place that collision is reachable, so they keep
    the separator."""
    return "version-" + "".join(c if c.isalnum() else "-" for c in version).strip("-")


def release_start(release_date):
    """"2026-07-15" -> the UTC instant of midnight UTC+8 on that day."""
    midnight = datetime.strptime(release_date, "%Y-%m-%d")
    return (midnight - timedelta(hours=GAME_UTC_OFFSET)).strftime("%Y-%m-%dT%H:%M:%SZ")


def warp_spans(events):
    """Per version: earliest start, latest end, and how many phases it ran."""
    spans, skipped = {}, []
    for e in events:
        if e.get("event_type") != "banner":
            continue
        version = (e.get("data") or {}).get("version")
        if not version:
            continue
        if not e.get("start_at") or not e.get("end_at"):
            # Open-ended runs are the collaboration warps, which the wiki
            # publishes with `time_end = none` and no version of their own -- so
            # the version they carry here was inferred by the scraper and is not
            # trustworthy. Two Fate collab runs starting 2025-07-11 are labelled
            # 4.4, a patch from a year later. A run that cannot close a version
            # does not get to place one either.
            skipped.append(e.get("slug"))
            continue
        span = spans.setdefault(version, {"start": e["start_at"], "end": e["end_at"], "phases": set()})
        span["start"] = min(span["start"], e["start_at"])
        span["end"] = max(span["end"], e["end_at"])
        phase = (e.get("data") or {}).get("phase")
        if phase is not None:
            span["phases"].add(phase)
    return spans, skipped


def build(events, versions):
    spans, skipped = warp_spans(events)
    problems, clamped = [], []

    dated = []
    for version, meta in versions.items():
        if not meta.get("release_date"):
            problems.append("%s: no release date" % version)
            continue
        dated.append((release_start(meta["release_date"]), version, meta))
    dated.sort()

    rows = []
    for i, (start, version, meta) in enumerate(dated):
        span = spans.get(version) or {}

        # A version must never begin after a banner it contains.
        if span.get("start") and span["start"] < start:
            clamped.append("%s (%s -> %s)" % (version, start[:10], span["start"][:10]))
            start = span["start"]

        # Versions are contiguous: one ends where the next begins. Only the
        # newest has nothing after it, so it falls back to its last warp.
        if i + 1 < len(dated):
            end = dated[i + 1][0]
        else:
            end = span.get("end")
            if not end:
                problems.append("%s: newest version has no warp end to close on" % version)
                continue

        phases = len(span.get("phases") or ())
        patch = meta.get("patch_title")
        rows.append({
            "game": GAME,
            "event_type": "version",
            "slug": version_slug(version),
            "title": "Version %s: %s" % (version, patch) if patch else "Version %s" % version,
            "description": "%s. %s"
            % (patch or "Version %s" % version,
               "%d phase%s of warps." % (phases, "" if phases == 1 else "s") if phases
               else "No warps recorded."),
            "start_at": start,
            "end_at": end,
            "timezone": "UTC+8",
            "is_published": True,
            "data": {
                "version": version,
                "patch_title": patch,
                "release_date": meta["release_date"],
                "phases": phases,
                "source": "honkai-star-rail.fandom.com",
                "derived_from": "wiki release_date at 00:00 UTC+8; ends at the next version",
            },
        })
    return rows, problems, skipped, clamped


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--events", default=EVENTS)
    ap.add_argument("--wiki", default=WIKI)
    ap.add_argument("--out", default=OUT)
    args = ap.parse_args()

    events = json.load(io.open(args.events, encoding="utf-8"))
    versions = json.load(io.open(args.wiki, encoding="utf-8"))
    rows, problems, skipped, clamped = build(events, versions)

    with io.open(args.out, "w", encoding="utf-8", newline="\n") as f:
        json.dump(rows, f, ensure_ascii=False, indent=1)
        f.write("\n")

    # Versions run back to back, so an overlap means two patches were derived
    # from runs that ran at the same time — a sign the phase data is wrong.
    overlaps = [
        "%s/%s" % (a["slug"], b["slug"])
        for a, b in zip(rows, rows[1:])
        if a["end_at"] and b["start_at"] < a["end_at"]
    ]
    print("%-30s %d rows" % (os.path.basename(args.out), len(rows)))
    if rows:
        print("  span:    %s -> %s" % (rows[0]["start_at"][:10], rows[-1]["end_at"][:10]))
        print("  phases:  %d runs across %d versions"
              % (sum(r["data"]["phases"] for r in rows), len(rows)))
    if clamped:
        print("  clamped %d version start%s back to their first warp: %s"
              % (len(clamped), "" if len(clamped) == 1 else "s", ", ".join(clamped)))
    if skipped:
        print("  skipped %d open-ended run%s (no reliable version): %s"
              % (len(skipped), "" if len(skipped) == 1 else "s", ", ".join(skipped)))
    if overlaps:
        print("  !! overlapping versions: %s" % ", ".join(overlaps))
    if problems:
        print("  !! %d problems:" % len(problems))
        for p in problems[:20]:
            print("     %s" % p)


if __name__ == "__main__":
    main()
