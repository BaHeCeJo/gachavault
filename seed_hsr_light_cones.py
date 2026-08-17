#!/usr/bin/env python3
"""Seed the Honkai: Star Rail light cone catalog into GachaVault.

Consumes seed_data/hsr_light_cones_import.json (written by
make_hsr_light_cones.py) and writes through the public API as an admin:

  * widens the "Light Cones" schema so the HP/ATK/DEF the catalog carries have
    somewhere to live, and turns on rarity/path filters — with 167 rows the
    section is unusable without them
  * uploads each cone's full art and icon, scraped from the HSR fandom wiki,
    into the schema's fullart_url / icon_url image slots
  * creates one item per cone, updating rather than duplicating the ones
    already present

Idempotent: cones already present are matched by slug and updated in place,
keeping any art they already have, so it is safe to re-run.

Usage:
    export GV_ADMIN_EMAIL=...  GV_ADMIN_PASSWORD=...
    python seed_hsr_light_cones.py --dry-run    # show what would be written
    python seed_hsr_light_cones.py              # write it
"""

import argparse
import getpass
import io
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "seed_data")
IMPORT = os.path.join(DATA, "hsr_light_cones_import.json")
ART_CACHE = os.path.join(DATA, "hsr_light_cone_art.txt")

GAME_SLUG = "honkai-star-rail"
SECTION = "light-cones"
SCHEMA_NAME = "Light Cones"
WIKI_API = "https://honkai-star-rail.fandom.com/api.php"
UA = "gachavault-seed/1.0 (light cone import)"

# The catalog carries max-level base stats; the schema had no home for them.
STAT_FIELDS = [
    {"key": "base_hp", "label": "Base HP", "type": "number"},
    {"key": "base_atk", "label": "Base ATK", "type": "number"},
    {"key": "base_def", "label": "Base DEF", "type": "number"},
]
FILTERS = ["rarity", "path"]

# Wiki file name patterns, mapped to the schema's image slots.
ART_SLOTS = [("fullart_url", "Light Cone %s.png"), ("icon_url", "Light Cone %s Icon.png")]

# Catalog name -> the wiki's title for it, where the two disagree on casing.
ART_NAME_OVERRIDES = {"Shadowed By Night": "Shadowed by Night"}


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
            with urllib.request.urlopen(req, timeout=120) as r:
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
    return http("GET", WIKI_API + "?" + urllib.parse.urlencode(dict(params, format="json")))


# ── art ──────────────────────────────────────────────────────────────────────
def resolve_art(names, refresh):
    """{name: {slot: wiki url}} for every cone whose art the wiki publishes."""
    if not refresh and os.path.exists(ART_CACHE):
        art = {}
        with io.open(ART_CACHE, encoding="utf-8") as f:
            for line in f:
                parts = line.rstrip("\n").split("\t")
                if len(parts) == 3 and parts[2]:
                    art.setdefault(parts[0], {})[parts[1]] = parts[2]
        print("using cached art index: %d cones (%s)" % (len(art), ART_CACHE))
        return art

    titles, art = {}, {}
    for name in names:
        for slot, pattern in ART_SLOTS:
            titles["File:" + pattern % ART_NAME_OVERRIDES.get(name, name)] = (name, slot)
    keys = list(titles)
    for i in range(0, len(keys), 40):
        res = wiki(
            {
                "action": "query",
                "prop": "imageinfo",
                "iiprop": "url",
                "titles": "|".join(keys[i : i + 40]),
            }
        )
        for pg in res.get("query", {}).get("pages", {}).values():
            info = pg.get("imageinfo")
            if info and pg["title"] in titles:
                name, slot = titles[pg["title"]]
                art.setdefault(name, {})[slot] = info[0]["url"]
        print("    art lookup %d/%d" % (min(i + 40, len(keys)), len(keys)))

    with io.open(ART_CACHE, "w", encoding="utf-8", newline="\n") as f:
        for name in sorted(art):
            for slot in sorted(art[name]):
                f.write("%s\t%s\t%s\n" % (name, slot, art[name][slot]))
    print("cached -> %s" % ART_CACHE)
    return art


# ── the site API ─────────────────────────────────────────────────────────────
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

    def patch(self, path, body):
        return http("PATCH", self.base + path, body=body, token=self.token)

    def upload(self, filename, data):
        boundary = "----gachavault%d" % int(time.time() * 1000)
        head = (
            '--%s\r\nContent-Disposition: form-data; name="file"; filename="%s"\r\n'
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


def ensure_schema(site, schema, dry_run):
    """Add the stat fields and the rarity/path filters if they aren't there."""
    fields = list(schema.get("fields") or [])
    have = {f.get("key") for f in fields}
    added = [f for f in STAT_FIELDS if f["key"] not in have]
    patch = {}
    if added:
        patch["fields"] = fields + added
    if not schema.get("filter_attrs"):
        patch["filter_attrs"] = FILTERS
    if not patch:
        print("schema already has the stat fields and filters")
        return
    what = []
    if added:
        what.append("fields +%s" % ", ".join(f["key"] for f in added))
    if "filter_attrs" in patch:
        what.append("filter_attrs = %s" % FILTERS)
    if dry_run:
        print("  ~ schema  %s" % "; ".join(what))
        return
    res = site.patch("/games/%s/schemas/%s" % (GAME_SLUG, schema["id"]), patch)
    if not res.get("success"):
        sys.exit("schema update failed: %s" % json.dumps(res)[:300])
    print("  ~ schema  %s" % "; ".join(what))


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--base", default=os.environ.get("GACHAVAULT_BASE", "https://hotarumi.com"))
    p.add_argument("--dry-run", action="store_true", help="show what would be written, write nothing")
    p.add_argument("--refresh-art", action="store_true", help="re-query the wiki instead of using the cache")
    p.add_argument("--no-art", action="store_true", help="skip uploading art")
    p.add_argument("--skip-schema", action="store_true", help="leave the schema alone")
    p.add_argument("--limit", type=int, help="only process the first N cones (for a smoke test)")
    args = p.parse_args()

    with io.open(IMPORT, encoding="utf-8") as f:
        rows = json.load(f)
    if args.limit:
        rows = rows[: args.limit]
    print("catalog: %d light cones" % len(rows))

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
    section = sections[SECTION]
    schema = next(s for s in schemas if s["name"] == SCHEMA_NAME)

    if not args.skip_schema:
        ensure_schema(site, schema, args.dry_run)

    existing = {
        i["slug"]: i
        for i in site.get("/items", game_id=game["id"], section_id=section["id"], limit=500)["data"]
    }
    print("existing: %d light cones in the section" % len(existing))

    art = {} if args.no_art else resolve_art([r["data"]["name"] for r in rows], args.refresh_art)
    missing_art = [r["data"]["name"] for r in rows if not art.get(r["data"]["name"], {}).get("fullart_url")]
    if missing_art and not args.no_art:
        print("!! %d cones have no full art on the wiki: %s" % (len(missing_art), ", ".join(missing_art)))

    uploaded = {}

    def upload_art(url):
        """Wiki URL -> our media URL, uploaded once per distinct source image."""
        if url in uploaded:
            return uploaded[url]
        blob = urllib.request.urlopen(
            urllib.request.Request(url, headers={"User-Agent": UA}), timeout=120
        ).read()
        res = site.upload(os.path.basename(url.split("/revision")[0].split("?")[0]), blob)
        if not res.get("success"):
            raise RuntimeError(json.dumps(res)[:200])
        uploaded[url] = res["data"]["public_url"]
        return uploaded[url]

    payload, art_failures = [], []
    for n, row in enumerate(rows):
        name = row["data"]["name"]
        prior = existing.get(row["slug"])
        # An update replaces data wholesale, so start from what is already
        # stored and let the catalog win: art and any hand-written lore survive.
        data = dict((prior or {}).get("data") or {})
        data.update(row["data"])

        for slot, url in sorted(art.get(name, {}).items()):
            if data.get(slot) or args.dry_run:
                continue
            try:
                data[slot] = upload_art(url)
            except Exception as e:
                art_failures.append("%s %s: %s" % (name, slot, e))

        entry = {"game": row["game"], "section": row["section"], "schema": row["schema"], "slug": row["slug"], "data": data}
        if prior:
            # bulk-import creates when there's no id and skips on a slug clash;
            # passing the id is what turns this row into an update.
            entry["id"] = prior["id"]
        payload.append(entry)
        if not args.dry_run and (n + 1) % 25 == 0:
            print("    prepared %d/%d" % (n + 1, len(rows)))

    if art_failures:
        print("!! %d art uploads failed:" % len(art_failures))
        for f in art_failures[:10]:
            print("     %s" % f)

    creates = [e for e in payload if "id" not in e]
    updates = [e for e in payload if "id" in e]
    if args.dry_run:
        print("\ndry run: would create %d, update %d" % (len(creates), len(updates)))
        for e in creates[:5]:
            d = e["data"]
            print(
                "  + %-38s %s★ %-12s hp=%s atk=%s def=%s"
                % (e["slug"][:38], d.get("rarity"), d.get("path"), d.get("base_hp"), d.get("base_atk"), d.get("base_def"))
            )
        if len(creates) > 5:
            print("  ... and %d more" % (len(creates) - 5))
        for e in updates:
            print("  ~ %s (already present)" % e["slug"])
        return

    total = {"created": 0, "updated": 0, "skipped": 0}
    errors = []
    for i in range(0, len(payload), 200):
        res = site.post("/items/bulk-import", payload[i : i + 200])
        if not res.get("success"):
            sys.exit("bulk import failed: %s" % json.dumps(res)[:400])
        d = res["data"]
        for k in total:
            total[k] += d.get(k, 0)
        errors += d.get("errors") or []
        print("    imported %d/%d" % (min(i + 200, len(payload)), len(payload)))

    print(
        "\ndone: %d created, %d updated, %d skipped, %d art uploads"
        % (total["created"], total["updated"], total["skipped"], len(uploaded))
    )
    if errors:
        print("!! %d rows errored:" % len(errors))
        for e in errors[:15]:
            print("     %s: %s" % (e.get("slug"), e.get("error")))


if __name__ == "__main__":
    main()
