#!/usr/bin/env python3
"""Build a patch timeline out of the warp runs.

The calendar already offers a "version" filter next to "banner", but nothing
has ever written an event of that type, so the filter is there and empty. Every
run in seed_data/hsr_events_import.json carries its version and phase in the
event's `data`, which is enough to derive one row per version.

Reads seed_data/hsr_events_import.json — not hsr_warps.json, which is the older
and thinner of the two; see the caution in make_hsr_import.py — and writes:

  seed_data/hsr_versions_import.json
      One row per game version, spanning its warp phases. Upload it at
      /admin/events/import. It references nothing, so it can go before or
      after the runs.

A version's span is derived: it opens with its first phase and closes when its
last phase does. That start is knowingly approximate — a patch goes live a few
hours before its first warp, after maintenance — but the warp history is the
only source cached here, so the alternative is inventing times. Every row says
so in `data.derived_from`, so a real patch-note time can overwrite it later
without guessing which rows were estimates.

    python make_hsr_versions.py
"""

import argparse
import io
import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "seed_data")
GAME = "honkai-star-rail"
EVENTS = os.path.join(DATA, "hsr_events_import.json")
OUT = os.path.join(DATA, "hsr_versions_import.json")


def version_slug(version):
    """1.0 -> version-1-0.

    The item slugify drops dots, which would turn both "1.0" and "10" into
    "10". Versions are the one place that collision is reachable, so they keep
    the separator."""
    return "version-" + "".join(c if c.isalnum() else "-" for c in version).strip("-")


def build(events):
    spans, problems, skipped = {}, [], []
    for e in events:
        if e.get("event_type") != "banner":
            continue
        version = (e.get("data") or {}).get("version")
        if not version:
            problems.append("%s: no version" % e.get("slug"))
            continue
        if not e.get("start_at") or not e.get("end_at"):
            # Open-ended runs are the collaboration warps, which the wiki
            # publishes with `time_end = none` and no version of their own — so
            # the version they carry here was inferred by the scraper and is
            # not trustworthy. Two Fate collab runs starting 2025-07-11 are
            # labelled 4.4, a patch from a year later, which would drag that
            # version's span back twelve months. A run that cannot close a
            # version does not get to open one either.
            skipped.append(e.get("slug"))
            continue
        span = spans.setdefault(version, {"start": e["start_at"], "end": e["end_at"], "phases": set()})
        span["start"] = min(span["start"], e["start_at"])
        span["end"] = max(span["end"], e["end_at"])
        phase = (e.get("data") or {}).get("phase")
        if phase is not None:
            span["phases"].add(phase)

    rows = []
    for version, span in sorted(spans.items(), key=lambda kv: kv[1]["start"]):
        phases = len(span["phases"])
        rows.append({
            "game": GAME,
            "event_type": "version",
            "slug": version_slug(version),
            "title": "Version %s" % version,
            "description": "Version %s update, %d phase%s of warps."
            % (version, phases, "" if phases == 1 else "s"),
            "start_at": span["start"],
            "end_at": span["end"],
            "timezone": "UTC+8",
            "is_published": True,
            "data": {
                "version": version,
                "phases": phases,
                "source": "honkai-star-rail.fandom.com",
                "derived_from": "warp phase times",
            },
        })
    return rows, problems, skipped


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--events", default=EVENTS)
    ap.add_argument("--out", default=OUT)
    args = ap.parse_args()

    events = json.load(io.open(args.events, encoding="utf-8"))
    rows, problems, skipped = build(events)

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
