#!/usr/bin/env python3
"""Cache the profile text for HSR characters and light cones.

The kit and effect importers cover what an item DOES. This covers what it is:
the blurb, the flavour text, when it released, and who voices it — the fields
behind the Overview, Lore, Release and Voice Actors blocks, which render empty
on every character but one.

Both come from the item's own wiki page rather than a sub-page, so this is a
single cheap pass over ~250 pages:

    Character Infobox   -> release_date, vaEN/vaJP/vaCN/vaKR, and the
                           faction/species/world values kept for later
    {{Description|...}} -> the official one-line quote
    lead paragraphs     -> the profile blurb the game shows
    categories          -> "Released in Version X" for release_version

Writes seed_data/hsr_profiles.json. Re-run when the wiki gains items.

    python fetch_hsr_profiles.py --chars <names.json>
"""

import argparse
import html
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
OUT = os.path.join(DATA, "hsr_profiles.json")

WIKI_API = "https://honkai-star-rail.fandom.com/api.php"
UA = "gachavault-seed/1.0 (profile import)"
BATCH = 25

# Same disambiguations the kit importer needs.
NAME_OVERRIDES = {
    "March 7th": "March 7th (Preservation)",
    "March 7th • The Hunt": "March 7th (The Hunt)",
    "Topaz & Numby": "Topaz and Numby",
    "Shadowed By Night": "Shadowed by Night",
    "Amber": "Amber (Light Cone)",
    "Data Bank": "Data Bank (Light Cone)",
}

VERSION_RE = re.compile(r"^Released in Version (.+)$")


def api(params):
    url = WIKI_API + "?" + urllib.parse.urlencode(dict(params, format="json"))
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    for attempt in range(3):
        try:
            return json.loads(urllib.request.urlopen(req, timeout=45).read().decode("utf-8"))
        except Exception:
            if attempt == 2:
                raise
            time.sleep(2.0 * (attempt + 1))


def field(text, key):
    # [ \t] not \s, so an empty "|key =" cannot capture the following line.
    m = re.search(r"^\|\s*%s\s*=[ \t]*(.*?)[ \t]*$" % re.escape(key), text, re.M)
    return m.group(1).strip() if m else None


def clean(text):
    """Wikitext -> plain prose.

    Profile text carries more markup than an ability description: citations,
    interwiki links to IMDb and Wikipedia, and language templates wrapping a
    voice actor's name in its native script. Each is unwrapped to the label a
    reader would see, and citations drop out entirely.
    """
    if not text:
        return ""
    # Citations, in both the paired and self-closing spellings.
    text = re.sub(r"<ref[^>]*/>", "", text)
    text = re.sub(r"<ref[^>]*>.*?</ref>", "", text, flags=re.S)
    # Nested templates resolve innermost-first, so repeat until it settles.
    for _ in range(6):
        before = text
        # {{Lang|'''Name'''|ja=…}} and {{zh|…}} / {{ja|…}} / {{ko|…}}
        text = re.sub(r"\{\{Lang\|([^{}|]*)(?:\|[^{}]*)?\}\}", r"\1", text, flags=re.I)
        text = re.sub(r"\{\{(?:zh|ja|ko|en)\|([^{}|]*)(?:\|[^{}]*)?\}\}", r"\1", text, flags=re.I)
        # {{w|Target|Label}} -> Label, {{w|Target}} -> Target
        text = re.sub(r"\{\{w\|[^{}|]*\|([^{}|]*)\}\}", r"\1", text, flags=re.I)
        text = re.sub(r"\{\{w\|([^{}|]*)\}\}", r"\1", text, flags=re.I)
        text = re.sub(r"\{\{Rubi\|([^{}|]*)(?:\|[^{}]*)?\}\}", r"\1", text, flags=re.I)
        text = re.sub(r"\{\{Description\|(.*?)\}\}", r"\1", text, flags=re.S | re.I)
        text = re.sub(r"\{\{Mission\|([^{}|]*)(?:\|[^{}]*)?\}\}", r"\1", text, flags=re.I)
        text = re.sub(r"\{\{Color\|[^|]*\|([^{}]*)\}\}", r"\1", text, flags=re.I)
        text = re.sub(r"\{\{Extra Effect\|([^{}|]*)(?:\|[^{}]*)?\}\}", r"\1", text, flags=re.I)
        # {{sic|typo|hide=1}} flags the game's own wording; keep it as written.
        text = re.sub(r"\{\{sic\|([^{}|]*)(?:\|[^{}]*)?\}\}", r"\1", text, flags=re.I)
        # {{MC|m=man|f=woman}} is the Trailblazer's gendered wording; the
        # masculine form is as good a default as any, and it sits inside a link
        # label, so it has to resolve before links do.
        text = re.sub(r"\{\{MC\|m=([^{}|]*)(?:\|[^{}]*)?\}\}", r"\1", text, flags=re.I)
        # {{Obfuscate|5}} stands in for a name the story has not revealed yet.
        text = re.sub(r"\{\{Obfuscate\|[^{}]*\}\}", "", text, flags=re.I)
        if text == before:
            break
    # [[Target|Label]] / [[Target]], including interwiki (imdb:, ko:)
    text = re.sub(r"\[\[(?:[^\]|]*\|)?([^\]|]*)\]\]", r"\1", text)
    # [https://… Label] -> Label, bare [https://…] -> dropped
    text = re.sub(r"\[https?://\S+\s+([^\]]*)\]", r"\1", text)
    text = re.sub(r"\[https?://\S+\]", "", text)
    # The wiki has the odd unclosed "[[", which no link pattern can match.
    text = text.replace("[[", "").replace("]]", "")
    text = re.sub(r"<br\s*/?>", "\n", text)
    text = re.sub(r"</?[a-zA-Z][^>]*>", "", text)
    text = text.replace("'''", "").replace("''", "")
    text = html.unescape(text)
    # Collapse the blank runs the stripped citations leave behind.
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def find_template(text, name):
    """(start, end, inner) for the first {{name|...}}, matching braces.

    A regex cannot do this: {{Description}} routinely contains a citation that
    itself contains {{Character Page Link|X}}, and a non-greedy match stops at
    that inner "}}" — leaving the tail of the citation stranded in the prose.
    """
    open_at = text.find("{{" + name)
    if open_at < 0:
        return None
    depth, i = 0, open_at
    while i < len(text) - 1:
        pair = text[i : i + 2]
        if pair == "{{":
            depth += 1
            i += 2
            continue
        if pair == "}}":
            depth -= 1
            i += 2
            if depth == 0:
                inner = text[open_at + 2 + len(name) : i - 2].lstrip("|")
                return open_at, i, inner
            continue
        i += 1
    return None


def lead_paragraphs(body):
    """The profile blurb: the prose between the page's opening sentence and its
    first section heading, minus that opening "X is a playable character" line.

    The {{Description}} quote comes out first — that is the `lore` field, and
    leaving it in would print the same text twice on the page."""
    body = body.split("\n==", 1)[0]
    found = find_template(body, "Description")
    if found:
        body = body[: found[0]] + body[found[1] :]
    # Citations go before the paragraph split, so a multi-line <ref> cannot
    # break one paragraph into two. Self-closing first: "<ref[^>]*>" matches
    # "<ref name="x" />" too, so stripping pairs first would treat a
    # self-closing tag as an opening one and swallow every paragraph up to the
    # next "</ref>".
    body = re.sub(r"<ref[^>]*/>", "", body)
    body = re.sub(r"<ref[^>]*>.*?</ref>", "", body, flags=re.S)
    paras = [p.strip() for p in body.split("\n\n") if p.strip()]
    keep = [p for p in paras if not re.search(r"^'''.*?'''.*?\bis a\b", p, re.S)]
    return clean("\n\n".join(keep))


def fetch(titles):
    """{title: (wikitext, [categories])} for a batch of pages."""
    out = {}
    for i in range(0, len(titles), BATCH):
        res = api({
            "action": "query",
            "prop": "revisions|categories",
            "rvprop": "content",
            "rvslots": "main",
            "cllimit": "200",
            "redirects": "1",
            "titles": "|".join(titles[i : i + BATCH]),
        })
        q = res.get("query", {})
        redirects = {r["from"]: r["to"] for r in q.get("redirects", [])}
        for pg in q.get("pages", {}).values():
            if not pg.get("revisions"):
                continue
            cats = [c["title"].replace("Category:", "") for c in pg.get("categories", [])]
            out[pg["title"]] = (pg["revisions"][0]["slots"]["main"]["*"], cats)
        for src, dst in redirects.items():
            if dst in out:
                out[src] = out[dst]
        sys.stderr.write("    %d/%d\n" % (min(i + BATCH, len(titles)), len(titles)))
        time.sleep(0.05)
    return out


def release_versions():
    """{page title: version} built from the version categories themselves.

    Asking each page for its categories does not work in bulk: the API caps the
    category list per request, not per page, so most pages in a batch come back
    with none. Walking the ~30 "Released in Version X" categories instead is
    both complete and cheaper.
    """
    cats = api({
        "action": "query",
        "list": "allcategories",
        "acprefix": "Released in Version",
        "aclimit": "500",
    })
    names = [c["*"] for c in cats.get("query", {}).get("allcategories", [])]
    out = {}
    for n, cat in enumerate(names, 1):
        version = VERSION_RE.match(cat)
        if not version:
            continue
        cont, seen = None, 0
        while True:
            params = {
                "action": "query",
                "list": "categorymembers",
                "cmtitle": "Category:" + cat,
                "cmlimit": "500",
            }
            if cont:
                params["cmcontinue"] = cont
            res = api(params)
            for m in res.get("query", {}).get("categorymembers", []):
                out[m["title"]] = version.group(1).strip()
                seen += 1
            cont = res.get("continue", {}).get("cmcontinue")
            if not cont:
                break
        sys.stderr.write("    version %s: %d pages (%d/%d)\n" % (version.group(1), seen, n, len(names)))
        time.sleep(0.05)
    return out


def split_infobox(text):
    """(infobox, body) — the infobox ends at the first line that is just }}."""
    m = re.search(r"^\}\}\s*$", text, re.M)
    return (text[: m.end()], text[m.end():]) if m else ("", text)


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--chars", required=True, help="JSON file listing character names")
    ap.add_argument("--out", default=OUT)
    args = ap.parse_args()

    names = json.load(io.open(args.chars, encoding="utf-8"))
    cones = [r["data"]["name"] for r in json.load(
        io.open(os.path.join(DATA, "hsr_light_cones_import.json"), encoding="utf-8"))]

    out = {"characters": {}, "light_cones": {}}
    problems = []

    print("release versions...")
    versions = release_versions()
    print("  %d pages have a release version" % len(versions))

    print("characters: %d" % len(names))
    pages = fetch([NAME_OVERRIDES.get(n, n) for n in names])
    for n in names:
        got = pages.get(NAME_OVERRIDES.get(n, n))
        if not got:
            problems.append("character %r: no page" % n)
            continue
        text, _ = got
        box, body = split_infobox(text)
        desc = find_template(body.split("\n==", 1)[0], "Description")
        out["characters"][n] = {
            "description": lead_paragraphs(body),
            "lore": clean(desc[2]) if desc else "",
            "release_date": field(box, "release_date") or "",
            "release_version": versions.get(NAME_OVERRIDES.get(n, n)) or versions.get(n, ""),
            "voice_actor_en": clean(field(box, "vaEN") or ""),
            "voice_actor_jp": clean(field(box, "vaJP") or ""),
            "voice_actor_cn": clean(field(box, "vaCN") or ""),
            "voice_actor_kr": clean(field(box, "vaKR") or ""),
            # Kept for a later pass: these are attribute fields and need their
            # values to exist on the game before they can be imported.
            "_faction": [clean(v) for v in (field(box, "faction"), field(box, "faction2")) if v],
            "_species": clean(field(box, "species") or ""),
            "_world": clean(field(box, "world2") or field(box, "world") or ""),
        }

    print("light cones: %d" % len(cones))
    pages = fetch([NAME_OVERRIDES.get(c, c) for c in cones])
    for c in cones:
        got = pages.get(NAME_OVERRIDES.get(c, c))
        if not got:
            problems.append("light cone %r: no page" % c)
            continue
        text, _ = got
        _, body = split_infobox(text)
        desc = find_template(body, "Description")
        out["light_cones"][c] = {
            "description": clean(desc[2]) if desc else "",
            "release_version": versions.get(NAME_OVERRIDES.get(c, c)) or versions.get(c, ""),
        }

    with io.open(args.out, "w", encoding="utf-8", newline="\n") as f:
        json.dump(out, f, ensure_ascii=False, indent=1, sort_keys=True)
        f.write("\n")

    ch, lc = out["characters"], out["light_cones"]
    print()
    print("%-30s %d characters, %d light cones" % (os.path.basename(args.out), len(ch), len(lc)))
    for label, coll, keys in (
        ("characters", ch, ("description", "lore", "release_date", "release_version", "voice_actor_en")),
        ("light cones", lc, ("description", "release_version")),
    ):
        counts = ", ".join("%s %d" % (k, sum(1 for v in coll.values() if v.get(k))) for k in keys)
        print("  %-12s %s" % (label, counts))
    if problems:
        print("  !! %d problems:" % len(problems))
        for p in problems[:15]:
            print("     %s" % p)


if __name__ == "__main__":
    main()
