#!/usr/bin/env python3
"""Seed Honkai: Star Rail character warp history into GachaVault.

Source is the HSR fandom wiki, which publishes this in machine-readable form:

  Character Event Warp / Character Collaboration Warp
      every run, as "<Banner Name>/<YYYY-MM-DD>" subpages
  Warp/List
      "Version X.Y: <start> - <end>" headers, grouping runs into version/phase
  <Banner Name>/<date>
      the {{Warp}} template: exact time_start/time_end (GMT+8), the featured
      5-star and 4-star characters, and the banner art filename

It writes through the public API as an admin, mirroring what the admin UI does:

  * one item per warp name in the game's "banners" section (the reusable
    preset), with its key art uploaded to media-service
  * one "banner" event per run, attached to that preset, with the rate-up
    characters as featured items

Idempotent: banners already present (by slug) and runs already present (by slug,
or by same preset + same start time) are skipped, so it is safe to re-run.

Usage:
    export GV_ADMIN_EMAIL=...  GV_ADMIN_PASSWORD=...
    python seed_hsr_banners.py --dry-run       # show what would be written
    python seed_hsr_banners.py                 # write it
"""

import argparse
import getpass
import io
import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timedelta

GAME_SLUG = "honkai-star-rail"
BANNER_SECTION = "banners"
CHARACTER_SECTION = "characters"
WIKI_API = "https://honkai-star-rail.fandom.com/api.php"
UA = "gachavault-seed/1.0 (banner history import)"
CACHE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "seed_data", "hsr_warps.json")

# Wiki display name -> item slug, for the handful that don't fall out of the
# slugify rule below.
NAME_OVERRIDES = {
    "Topaz & Numby": "topaz-numby",
}


# ── plumbing ─────────────────────────────────────────────────────────────────
def slugify(name):
    s = name.lower().replace("•", " ").replace("&", " and ").replace(".", "")
    s = re.sub(r"\(.*?\)", " ", s)
    s = re.sub(r"[^a-z0-9]+", "-", s)
    return s.strip("-")


def char_slug(name):
    return NAME_OVERRIDES.get(name) or slugify(name)


def http(method, url, body=None, token=None, raw=None, content_type=None, retries=3):
    data = raw if raw is not None else (json.dumps(body).encode() if body is not None else None)
    headers = {"User-Agent": UA}
    if content_type:
        headers["Content-Type"] = content_type
    elif body is not None:
        headers["Content-Type"] = "application/json"
    if token:
        headers["Authorization"] = "Bearer " + token
    req = urllib.request.Request(url, data=data, method=method, headers=headers)
    for attempt in range(retries):
        try:
            with urllib.request.urlopen(req, timeout=90) as r:
                return json.loads(r.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            payload = e.read().decode("utf-8", "replace")
            try:
                return json.loads(payload)
            except ValueError:
                if attempt == retries - 1:
                    raise RuntimeError("%s %s -> %s %s" % (method, url, e.code, payload[:300]))
        except Exception:
            if attempt == retries - 1:
                raise
        time.sleep(1.5 * (attempt + 1))


def wiki(params):
    url = WIKI_API + "?" + urllib.parse.urlencode(dict(params, format="json"))
    return http("GET", url)


def wiki_html(page):
    return wiki({"action": "parse", "page": page, "prop": "text"})["parse"]["text"]["*"]


def to_utc_iso(local, offset_hours=8):
    """'2023-04-25 10:00:00' in GMT+offset -> '2023-04-25T02:00:00Z'.

    A few pages write the time without seconds, or as a bare date.
    """
    text = local.strip()[:19]
    for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%d %H:%M", "%Y-%m-%d"):
        try:
            dt = datetime.strptime(text, fmt) - timedelta(hours=offset_hours)
            return dt.strftime("%Y-%m-%dT%H:%M:%SZ")
        except ValueError:
            continue
    raise ValueError("unparseable wiki time: %r" % local)


# ── 1. scrape the wiki ───────────────────────────────────────────────────────
def run_links(html):
    """[(page key, banner name, run date)] in document order, deduped."""
    out, seen = [], set()
    for m in re.finditer(
        r'<a href="/wiki/([^"/]+)/(\d{4}-\d{2}-\d{2})"[^>]*>([^<]*?)\s*\d{4}-\d{2}-\d{2}</a>', html
    ):
        name = urllib.parse.unquote(m.group(1)).replace("_", " ")
        key = "%s/%s" % (name, m.group(2))
        if key not in seen:
            seen.add(key)
            out.append((key, name, m.group(2)))
    return out


def scrape(include_collab=True):
    runs = list(run_links(wiki_html("Character Event Warp")))
    if include_collab:
        runs += list(run_links(wiki_html("Character Collaboration Warp")))
    print("  runs listed: %d" % len(runs))

    # Version + phase come from the grouping on Warp/List rather than from the
    # dates: phases overlap, so matching by date mislabels the boundaries.
    wl = wiki_html("Warp/List")
    labels, windows_seen = {}, []
    version = window = None
    for m in re.finditer(
        r'Version/([\d.]+)"[^>]*>Version [\d.]+</a>:\s*([^<]+?)\s*(?:&#8212;|—)\s*'
        r'|<a href="/wiki/([^"/]+)/(\d{4}-\d{2}-\d{2})"',
        wl,
    ):
        if m.group(1):
            version, window = m.group(1), m.group(2).strip()
            windows_seen.append((version, window))
        elif version:
            key = urllib.parse.unquote(m.group(3)).replace("_", " ") + "/" + m.group(4)
            labels.setdefault(key, (version, window))

    # Warp/List runs newest-first; number each version's windows oldest-first.
    phase_of, per_version = {}, {}
    for version, window in reversed(windows_seen):
        seen = per_version.setdefault(version, [])
        if window not in seen:
            seen.append(window)
        phase_of[(version, window)] = seen.index(window) + 1

    field = lambda k, txt: (re.search(r"^\|\s*%s\s*=\s*(.+?)\s*$" % k, txt, re.M) or [None, None])[1]
    details = {}
    keys = [r[0] for r in runs]
    for i in range(0, len(keys), 40):
        res = wiki(
            {
                "action": "query",
                "prop": "revisions",
                "rvprop": "content",
                "rvslots": "main",
                "titles": "|".join(keys[i : i + 40]),
            }
        )
        for pg in res.get("query", {}).get("pages", {}).values():
            if "revisions" not in pg:
                continue
            txt = pg["revisions"][0]["slots"]["main"]["*"]
            five = re.findall(r"5\{\{star\}\}\s*Character.*?\n((?:\*.*\n)+)", txt)
            four = re.findall(r"4\{\{star\}\}\s*Characters?.*?\n((?:\*.*\n)+)", txt)
            names = lambda b: re.findall(r"\{\{Character Intro\|([^}|]+)", b[0]) if b else []
            offset = field("time_start_offset", txt)
            details[pg["title"]] = {
                "time_start": field("time_start", txt),
                "time_end": field("time_end", txt),
                # A few pages omit the offset; every warp time on this wiki is
                # server time, GMT+8.
                "offset": offset if offset and re.match(r"^GMT[+-]\d+$", offset) else "GMT+8",
                "image": field("image", txt),
                "five_star": names(five),
                "four_star": names(four),
            }
        print("    details %d/%d" % (min(i + 40, len(keys)), len(keys)))

    out = []
    for key, name, date in runs:
        d = details.get(key)
        if not d or not d.get("time_start"):
            print("    !! no detail for %s" % key)
            continue
        version, window = labels.get(key, (None, None))
        out.append(
            dict(
                d,
                page=key,
                banner=name,
                run_date=date,
                version=version,
                phase=phase_of.get((version, window)),
            )
        )
    out.sort(key=lambda r: r["time_start"])
    return out


def image_urls(filenames):
    """Wiki file name -> full-size URL."""
    urls = {}
    names = [f for f in filenames if f]
    for i in range(0, len(names), 40):
        res = wiki(
            {
                "action": "query",
                "prop": "imageinfo",
                "iiprop": "url",
                "titles": "|".join("File:" + n for n in names[i : i + 40]),
            }
        )
        for pg in res.get("query", {}).get("pages", {}).values():
            info = pg.get("imageinfo")
            if info:
                urls[pg["title"][len("File:") :]] = info[0]["url"]
    return urls


def load_runs(refresh, include_collab):
    if not refresh and os.path.exists(CACHE):
        with io.open(CACHE, encoding="utf-8") as f:
            runs = json.load(f)
        print("using cached wiki data: %d runs (%s)" % (len(runs), CACHE))
        return runs
    print("scraping the wiki...")
    runs = scrape(include_collab)
    art = image_urls({r.get("image") for r in runs})
    for r in runs:
        r["art_url"] = art.get(r.get("image"))
    os.makedirs(os.path.dirname(CACHE), exist_ok=True)
    with io.open(CACHE, "w", encoding="utf-8") as f:
        json.dump(runs, f, ensure_ascii=False, indent=1)
    print("cached -> %s" % CACHE)
    return runs


# ── 2. the site API ──────────────────────────────────────────────────────────
class Site(object):
    def __init__(self, base, token):
        self.base = base.rstrip("/") + "/api/v1"
        self.token = token

    def get(self, path, **params):
        url = self.base + path
        if params:
            url += "?" + urllib.parse.urlencode(params)
        return http("GET", url, token=self.token)

    def post(self, path, body):
        return http("POST", self.base + path, body=body, token=self.token)

    def upload(self, filename, data):
        boundary = "----gachavault%d" % int(time.time() * 1000)
        head = (
            "--%s\r\nContent-Disposition: form-data; name=\"file\"; filename=\"%s\"\r\n"
            "Content-Type: application/octet-stream\r\n\r\n" % (boundary, filename)
        ).encode()
        payload = head + data + ("\r\n--%s--\r\n" % boundary).encode()
        return http(
            "POST",
            self.base + "/media/upload",
            raw=payload,
            token=self.token,
            content_type="multipart/form-data; boundary=" + boundary,
        )


def login(base, email, password):
    r = http("POST", base.rstrip("/") + "/api/v1/auth/login", body={"email": email, "password": password})
    if not r.get("success"):
        sys.exit("login failed: %s" % json.dumps(r)[:300])
    return r["data"]["access_token"]


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--base", default=os.environ.get("GACHAVAULT_BASE", "https://hotarumi.com"))
    p.add_argument("--dry-run", action="store_true", help="show what would be written, write nothing")
    p.add_argument("--refresh", action="store_true", help="re-scrape the wiki instead of using the cache")
    p.add_argument("--no-art", action="store_true", help="skip uploading banner key art")
    p.add_argument("--no-collab", action="store_true", help="skip the collaboration warps")
    p.add_argument("--unpublished", action="store_true", help="create events as drafts")
    p.add_argument("--limit", type=int, help="only process the first N runs (for a smoke test)")
    args = p.parse_args()

    runs = load_runs(args.refresh, not args.no_collab)
    if args.limit:
        runs = runs[: args.limit]

    # Everything a dry run reads is public, so it doesn't need credentials.
    email = os.environ.get("GV_ADMIN_EMAIL")
    password = os.environ.get("GV_ADMIN_PASSWORD")
    if not (email and password) and not args.dry_run:
        email = email or input("admin email: ").strip()
        password = password or getpass.getpass("admin password: ")
    if email and password:
        site = Site(args.base, login(args.base, email, password))
        print("logged in to %s as %s" % (args.base, email))
    else:
        site = Site(args.base, None)
        print("dry run against %s (anonymous)" % args.base)

    game = site.get("/games/" + GAME_SLUG)["data"]
    sections = {s["slug"]: s for s in site.get("/games/%s/sections" % GAME_SLUG)["data"]}
    schemas = site.get("/games/%s/schemas" % GAME_SLUG)["data"]
    banner_section = sections[BANNER_SECTION]
    banner_schema = next(s for s in schemas if s["section_id"] == banner_section["id"])

    chars = site.get(
        "/items", game_id=game["id"], section_id=sections[CHARACTER_SECTION]["id"], limit=500
    )["data"]
    char_ids = {c["slug"]: c["id"] for c in chars}

    banners = {
        b["slug"]: b
        for b in site.get("/items", game_id=game["id"], section_id=banner_section["id"], limit=500)["data"]
    }
    existing = site.get("/events", **{"game": GAME_SLUG, "from": "2000-01-01T00:00:00Z"})["data"]
    by_slug = {e["slug"] for e in existing}
    by_run = {(e.get("banner_item_id"), e["start_at"][:13]) for e in existing}
    print(
        "existing: %d banner presets, %d events; %d characters resolvable"
        % (len(banners), len(existing), len(char_ids))
    )

    # Report anything we can't attach before writing a thing.
    missing = sorted(
        {n for r in runs for n in r["five_star"] + r["four_star"] if char_slug(n) not in char_ids}
    )
    if missing:
        print("\n!! %d characters not in the DB — their rate-ups will be skipped:" % len(missing))
        for n in missing:
            print("     %s (looked for slug '%s')" % (n, char_slug(n)))

    created_banners = created_events = skipped_events = 0
    for r in runs:
        bslug = slugify(r["banner"])
        label = "%s %s p%s" % (r["version"] or "?", r["banner"], r["phase"])

        # ── the reusable preset ──────────────────────────────────────────────
        banner = banners.get(bslug)
        if not banner:
            art = None
            if r.get("art_url") and not args.no_art and not args.dry_run:
                try:
                    blob = urllib.request.urlopen(
                        urllib.request.Request(r["art_url"], headers={"User-Agent": UA}), timeout=90
                    ).read()
                    up = site.upload(os.path.basename(r["art_url"].split("?")[0]), blob)
                    art = up["data"]["public_url"] if up.get("success") else None
                except Exception as e:
                    print("    art upload failed for %s: %s" % (bslug, e))
            data = {"name": r["banner"]}
            if art:
                data["art_url"] = art
            if r["version"]:
                data["version"] = r["version"]
            if args.dry_run:
                print("  + banner  %s" % bslug)
                banner = {"id": "dry-run", "slug": bslug}
            else:
                res = site.post(
                    "/items",
                    {
                        "game_id": game["id"],
                        "section_id": banner_section["id"],
                        "type_schema_id": banner_schema["id"],
                        "slug": bslug,
                        "data": data,
                    },
                )
                if not res.get("success"):
                    print("  !! banner %s failed: %s" % (bslug, json.dumps(res)[:200]))
                    continue
                banner = res["data"]
            banners[bslug] = banner
            created_banners += 1

        # ── the run ──────────────────────────────────────────────────────────
        offset = int(r["offset"].replace("GMT", "").replace("+", "") or 8)
        start = to_utc_iso(r["time_start"], offset)
        # The collaboration warps are open-ended ("Since ... (Indefinite)") and
        # write time_end = none; those become events with no end date.
        raw_end = (r.get("time_end") or "").strip()
        end = to_utc_iso(raw_end, offset) if re.match(r"^\d{4}-\d{2}-\d{2}", raw_end) else None
        eslug = "%s-%s" % (bslug, r["run_date"])
        if eslug in by_slug or (banner["id"], start[:13]) in by_run:
            skipped_events += 1
            continue

        featured = []
        for i, n in enumerate(r["five_star"]):
            if char_slug(n) in char_ids:
                featured.append({"item_id": char_ids[char_slug(n)], "role": "featured_5", "order": i})
        for i, n in enumerate(r["four_star"]):
            if char_slug(n) in char_ids:
                featured.append(
                    {"item_id": char_ids[char_slug(n)], "role": "featured_4", "order": len(r["five_star"]) + i}
                )

        title = ", ".join(r["five_star"]) or r["banner"]
        if args.dry_run:
            print(
                "  + event   %-46s %s -> %s  [%d featured]"
                % (title[:46], start[:10], (end or "open")[:10], len(featured))
            )
            created_events += 1
            continue

        res = site.post(
            "/events",
            {
                "game_id": game["id"],
                "event_type": "banner",
                "slug": eslug,
                "title": title,
                "description": "%s rate-up warp, Version %s Phase %s."
                % (r["banner"], r["version"], r["phase"]),
                "start_at": start,
                "end_at": end,
                "timezone": "UTC+8",
                "is_published": not args.unpublished,
                "banner_item_id": banner["id"],
                "featured_items": featured,
                "data": {"version": r["version"], "phase": r["phase"], "source": "honkai-star-rail.fandom.com"},
            },
        )
        if not res.get("success"):
            print("  !! event %s failed: %s" % (eslug, json.dumps(res)[:250]))
            continue
        by_slug.add(eslug)
        created_events += 1
        print("  + %-14s %-44s %s" % (label[:14], title[:44], start[:10]))

    print(
        "\n%s: %d banner presets, %d events created, %d already present"
        % ("dry run" if args.dry_run else "done", created_banners, created_events, skipped_events)
    )


if __name__ == "__main__":
    main()
