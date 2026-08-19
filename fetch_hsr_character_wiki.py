#!/usr/bin/env python3
"""Cache HSR character kits — abilities, traces and eidolons — from the wiki.

Unlike light cones, a character's kit is not one infobox. Each ability, trace
and eidolon is its own wiki page, gathered by category:

    Category:<Character> Abilities   -> Ability Infobox (type = Skill, Basic ATK,
                                        Ultimate, Talent, Technique, Bonus Ability)
    Category:<Character> Eidolons    -> Eidolon Infobox (level = 1..6)

and the per-level numbers are not in the infobox either. An ability's `desc`
states a range — "equal to {{Color|h|80%—176%}} of ATK" — which is the value at
level 1 and at the level cap, with everything between left implicit. The
rendered page carries the full table instead, one row per scaling attribute:

    Level    1     2     3   ...
    Attr. 1  80%   88%   96% ...

so the numbers come from the parsed HTML, matched to the description by
position: the Nth highlighted range in `desc` is Attr. N. When those two counts
disagree we keep the ability as plain text rather than guess an alignment.

Usefully, the table is sized per ability rather than to one fixed length — a
Basic ATK comes back with 7 levels where an Ultimate has 12 — so each ability
carries its own tick count.

Writes seed_data/hsr_characters_wiki.json. Re-run when the wiki gains
characters; it is a slow scrape (~1300 pages), so the cache is committed and
builds read it offline.

    python fetch_hsr_character_wiki.py [--only "Acheron,Moze"]
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
OUT = os.path.join(HERE, "seed_data", "hsr_characters_wiki.json")

WIKI_API = "https://honkai-star-rail.fandom.com/api.php"
UA = "gachavault-seed/1.0 (character kit import)"
TITLE_BATCH = 40

# Catalog name -> the wiki's name for the character, where they disagree. The
# two March 7ths are disambiguated by path on the wiki, and Topaz spells out
# the ampersand in category names.
NAME_OVERRIDES = {
    "March 7th": "March 7th (Preservation)",
    "March 7th • The Hunt": "March 7th (The Hunt)",
    "Topaz & Numby": "Topaz and Numby",
}

# Ability types that scale with a level. Anything else (Bonus Ability, i.e. a
# major trace) is a fixed effect and renders as text.
LEVELLED_TYPES = {
    "basic atk", "enhanced basic atk", "skill", "enhanced skill", "ultimate",
    "talent", "technique", "memosprite skill", "memosprite talent",
    "elation skill", "servant skill", "servant talent", "assist skill",
}


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
    # [ 	] not \s: \s matches newlines, and an empty "|key =" would then
    # capture the next line instead of an empty string.
    m = re.search(r"^\|\s*%s\s*=[ \t]*(.*?)[ \t]*$" % re.escape(key), text, re.M)
    return m.group(1).strip() if m else None


def clean(text):
    """Wikitext -> plain sentence, keeping {{Color}} contents as markers."""
    if not text:
        return ""
    # {{Color|h|80%—176%}} and its lowercase spelling — the wrapper only
    # carries highlighting; the range inside it is the value we want.
    text = re.sub(r"\{\{Color\|[^|]*\|([^{}]*)\}\}", r"\1", text, flags=re.I)
    # {{Extra Effect|Follow-up ATK}} tags a game term; keep the term itself.
    text = re.sub(r"\{\{Extra Effect\|([^{}|]*)(?:\|[^{}]*)?\}\}", r"\1", text, flags=re.I)
    text = re.sub(r"\{\{sic\|([^|{}]*)(?:\|[^{}]*)?\}\}", r"\1", text)
    text = re.sub(r"\{\{Rubi\|([^{}|]*)(?:\|[^{}]*)?\}\}", r"\1", text)
    text = re.sub(r"\[\[(?:[^\]|]*\|)?([^\]|]*)\]\]", r"\1", text)
    text = re.sub(r"<br\s*/?>", "\n", text)
    text = re.sub(r"</?[a-zA-Z][^>]*>", "", text)
    text = text.replace("'''", "").replace("''", "")
    return html.unescape(text).strip()


def category(name, kind):
    res = api({
        "action": "query",
        "list": "categorymembers",
        "cmtitle": "Category:%s %s" % (name, kind),
        "cmlimit": "200",
    })
    return [m["title"] for m in res.get("query", {}).get("categorymembers", [])]


def wikitext(titles):
    """{title: wikitext} for a list of pages, batched."""
    out = {}
    for i in range(0, len(titles), TITLE_BATCH):
        res = api({
            "action": "query",
            "prop": "revisions",
            "rvprop": "content",
            "rvslots": "main",
            "redirects": "1",
            "titles": "|".join(titles[i : i + TITLE_BATCH]),
        })
        q = res.get("query", {})
        redirects = {r["from"]: r["to"] for r in q.get("redirects", [])}
        for pg in q.get("pages", {}).values():
            if pg.get("revisions"):
                out[pg["title"]] = pg["revisions"][0]["slots"]["main"]["*"]
        for src, dst in redirects.items():
            if dst in out:
                out[src] = out[dst]
        sys.stderr.write("      wikitext %d/%d\n" % (min(i + TITLE_BATCH, len(titles)), len(titles)))
        time.sleep(0.05)
    return out


LEVEL_ROW_RE = re.compile(r"<tr[^>]*>(.*?)</tr>", re.S)
CELL_RE = re.compile(r"<t[hd][^>]*>(.*?)</t[hd]>", re.S)


def cells(row_html):
    return [re.sub(r"\s+", " ", re.sub(r"<[^>]+>", "", c)).strip() for c in CELL_RE.findall(row_html)]


def scaling_table(page_html):
    """[[values per level], ...] — one list per Attr. row, or [] if absent."""
    for table in re.findall(r"<table[^>]*>.*?</table>", page_html, re.S):
        rows = [cells(r) for r in LEVEL_ROW_RE.findall(table)]
        header = next((r for r in rows if r and r[0].strip().lower() == "level"), None)
        if not header:
            continue
        attrs = []
        for r in rows:
            if r and r[0].lower().startswith("attr"):
                # First cell is the label; the rest are the per-level values.
                attrs.append([v for v in r[1:] if v])
        if attrs:
            return attrs
    return []


def parsed_html(title):
    res = api({"action": "parse", "page": title, "prop": "text"})
    return res.get("parse", {}).get("text", {}).get("*", "")


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--only", help="comma-separated character names, for a quick run")
    ap.add_argument("--out", default=OUT)
    ap.add_argument("--chars", required=True, help="JSON file listing character names")
    args = ap.parse_args()

    names = json.load(io.open(args.chars, encoding="utf-8"))
    if args.only:
        want = {x.strip() for x in args.only.split(",")}
        names = [n for n in names if n in want]
    print("characters: %d" % len(names))

    out, problems = {}, []
    for n, name in enumerate(names, 1):
        wiki_name = NAME_OVERRIDES.get(name, name)
        sys.stderr.write("  [%d/%d] %s\n" % (n, len(names), name))

        ability_titles = category(wiki_name, "Abilities")
        eidolon_titles = category(wiki_name, "Eidolons")
        if not ability_titles:
            problems.append("%s: no ability pages (tried %r)" % (name, wiki_name))
            continue

        texts = wikitext(ability_titles + eidolon_titles)
        abilities, eidolons = [], []

        for title in ability_titles:
            t = texts.get(title)
            if not t:
                problems.append("%s: no wikitext for ability %r" % (name, title))
                continue
            atype = field(t, "type") or ""
            desc = clean(field(t, "desc"))
            entry = {
                "title": field(t, "title") or title,
                "type": atype,
                "desc": desc,
                "energy_cost": field(t, "energyCost") or "",
                "energy_gen": field(t, "energyGen") or "",
                "req_asc": field(t, "reqAsc") or "",
                # How the ability hits — Single Target, Blast, AoE, Bounce,
                # Enhance, Support. The wiki shows it beside the type, and it is
                # what tells two same-typed abilities apart.
                "tag": field(t, "tag") or "",
                # The wiki's own ordering within a type. Sparse and not
                # consistent between characters, so it only breaks ties.
                "sortkey": field(t, "sortkey") or "",
            }
            # Only levelled abilities carry a table; a trace is a fixed effect.
            if atype.strip().lower() in LEVELLED_TYPES and "Scaling" in t:
                attrs = scaling_table(parsed_html(title))
                if attrs:
                    entry["levels"] = max(len(a) for a in attrs)
                    entry["attrs"] = attrs
                time.sleep(0.05)
            abilities.append(entry)

        for title in eidolon_titles:
            t = texts.get(title)
            if not t:
                problems.append("%s: no wikitext for eidolon %r" % (name, title))
                continue
            eidolons.append({
                "title": field(t, "title") or title,
                "level": field(t, "level") or "",
                "desc": clean(field(t, "desc")),
            })
        eidolons.sort(key=lambda e: int(e["level"]) if e["level"].isdigit() else 99)

        out[name] = {"wiki_name": wiki_name, "abilities": abilities, "eidolons": eidolons}

    with io.open(args.out, "w", encoding="utf-8", newline="\n") as f:
        json.dump(out, f, ensure_ascii=False, indent=1, sort_keys=True)
        f.write("\n")

    ab = sum(len(v["abilities"]) for v in out.values())
    scaled = sum(1 for v in out.values() for a in v["abilities"] if a.get("attrs"))
    eid = sum(len(v["eidolons"]) for v in out.values())
    print("%-34s %d characters" % (os.path.basename(args.out), len(out)))
    print("  abilities: %d (%d with a scaling table)" % (ab, scaled))
    print("  eidolons : %d" % eid)
    if problems:
        print("  !! %d problems:" % len(problems))
        for p in problems[:20]:
            print("     %s" % p)


if __name__ == "__main__":
    main()
