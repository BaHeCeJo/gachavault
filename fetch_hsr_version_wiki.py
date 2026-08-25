#!/usr/bin/env python3
"""Cache the Version Infobox for every game version.

make_hsr_versions.py originally derived a version's name and span from its warp
phases, because the warp history was the only thing cached. The wiki states
both directly:

    {{Version Infobox
    |title        = In Ravages Does the Whistle Sound
    |version      = 4.4
    |release_date = 2026-07-15
    |prev         = 4.3
    |next         = 4.5

so a version can carry its real patch name and an authoritative release date
instead of "Version 4.4" and a start inferred from when its first banner opened.

Version pages live at Version/<number>. The list of versions comes from the
built events file rather than from a category, so this only ever fetches
versions the site actually has warps for.

Writes seed_data/hsr_versions_wiki.json.

    python fetch_hsr_version_wiki.py
"""

import argparse
import io
import json
import os
import re
import sys
import time
import urllib.parse
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "seed_data")
EVENTS = os.path.join(DATA, "hsr_events_import.json")
OUT = os.path.join(DATA, "hsr_versions_wiki.json")

WIKI_API = "https://honkai-star-rail.fandom.com/api.php"
UA = "gachavault-seed/1.0 (version import)"
BATCH = 25


def wiki(params):
    url = WIKI_API + "?" + urllib.parse.urlencode(dict(params, format="json"))
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    for attempt in range(3):
        try:
            return json.loads(urllib.request.urlopen(req, timeout=30).read().decode("utf-8"))
        except Exception:
            if attempt == 2:
                raise
            time.sleep(1.5 * (attempt + 1))


def field(text, key):
    m = re.search(r"^\|\s*%s\s*=[ \t]*(.*?)[ \t]*$" % re.escape(key), text, re.M)
    return m.group(1).strip() if m else None


def versions_in(events):
    out = set()
    for e in events:
        v = (e.get("data") or {}).get("version")
        if v:
            out.add(v)
    return sorted(out, key=lambda v: [int(p) for p in v.split(".") if p.isdigit()])


def fetch(versions):
    title_of = {v: "Version/%s" % v for v in versions}
    titles = sorted(title_of.values())
    pages, redirects = {}, {}

    for i in range(0, len(titles), BATCH):
        res = wiki({
            "action": "query",
            "prop": "revisions",
            "rvprop": "content",
            "rvslots": "main",
            "redirects": "1",
            "titles": "|".join(titles[i : i + BATCH]),
        })
        q = res.get("query", {})
        for r in q.get("redirects", []):
            redirects[r["from"]] = r["to"]
        for pg in q.get("pages", {}).values():
            if pg.get("revisions"):
                pages[pg["title"]] = pg["revisions"][0]["slots"]["main"]["*"]
        sys.stderr.write("    fetched %d/%d\n" % (min(i + BATCH, len(titles)), len(titles)))
        time.sleep(0.3)

    out, problems = {}, []
    for v in versions:
        page = title_of[v]
        text = pages.get(redirects.get(page, page))
        if text is None:
            problems.append("%s: no page at %r" % (v, page))
            continue
        if "Version Infobox" not in text:
            problems.append("%s: no Version Infobox" % v)
            continue
        release = field(text, "release_date")
        if not re.match(r"^\d{4}-\d{2}-\d{2}$", release or ""):
            problems.append("%s: release_date %r is not a date" % (v, release))
            release = None
        out[v] = {
            "page": redirects.get(page, page),
            "patch_title": field(text, "title"),
            "release_date": release,
            "prev": field(text, "prev"),
            "next": field(text, "next"),
        }
    return out, problems


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--events", default=EVENTS)
    ap.add_argument("--out", default=OUT)
    args = ap.parse_args()

    events = json.load(io.open(args.events, encoding="utf-8"))
    versions = versions_in(events)
    print("versions with warps: %d" % len(versions))
    data, problems = fetch(versions)

    with io.open(args.out, "w", encoding="utf-8", newline="\n") as f:
        json.dump(data, f, ensure_ascii=False, indent=1, sort_keys=True)
        f.write("\n")

    named = sum(1 for v in data.values() if v.get("patch_title"))
    dated = sum(1 for v in data.values() if v.get("release_date"))
    print("%-30s %d versions" % (os.path.basename(args.out), len(data)))
    print("  patch titles:  %d" % named)
    print("  release dates: %d" % dated)
    if problems:
        print("  !! %d problems:" % len(problems))
        for p in problems[:20]:
            print("     %s" % p)


if __name__ == "__main__":
    main()
