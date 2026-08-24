#!/usr/bin/env python3
"""Cache character ascension costs, base stats and trace totals, plus the
material pages they reference.

Unlike every other fetch here this one reads rendered HTML rather than
wikitext. It has to: a character page states its whole progression as two Lua
template calls,

    {{Character Ascensions and Stats|Acheron}}
    {{Trace Upgrades|Acheron}}

so the wikitext contains no numbers at all. `action=parse` renders them, and
the rendered tables carry the costs in a consistent card markup.

Two card layouts exist and both are handled — the ascension cells put the
quantity in the caption, the total-cost blocks put it in a `card-text` span and
the name in the caption. Either way the item name is taken from the anchor's
`title`, which is the same in both.

Writes seed_data/hsr_ascension_wiki.json:

    {"Acheron": {"stats": [{level, hp, atk, def, spd}, ...],
                 "ascension": [{"from": 0, "to": 1, "cost": [{item, qty}]}],
                 "trace_totals": [{"label": ..., "cost": [{item, qty}]}]},
     "_materials": {"Dream Collection Component": {rarity, type, description}}}

The material infoboxes are fetched in the same run, from the union of every
item any character references, so the catalog cannot name something no
character actually uses.

    python fetch_hsr_ascension_wiki.py
    python fetch_hsr_ascension_wiki.py --only Acheron --only Bronya
"""

import argparse
import html as htmllib
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
CHARS = os.path.join(DATA, "hsr_characters_wiki.json")
OUT = os.path.join(DATA, "hsr_ascension_wiki.json")

WIKI_API = "https://honkai-star-rail.fandom.com/api.php"
UA = "gachavault-seed/1.0 (ascension import)"
BATCH = 25

CARD_SPLIT = re.compile(r'<div class="card-container')
CARD_NAME = re.compile(r'title="([^"]+)"')
CARD_TEXT = re.compile(r'class="card-text card-font">\s*([^<]+)<')
CARD_CAPTION = re.compile(r'class="card-caption">\s*<a[^>]*>\s*([^<]+?)\s*</a>')
STEP = re.compile(r"\((\d) → (\d)\)")
TOTAL = re.compile(r"<b>Total Cost</b>\s*\(([^)]*)\)(.*?)(?=<div><b>Total Cost</b>|</div></div>|$)", re.S)
QTY = re.compile(r"^[\d,]+$")


def wiki(params):
    url = WIKI_API + "?" + urllib.parse.urlencode(dict(params, format="json"))
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    for attempt in range(3):
        try:
            return json.loads(urllib.request.urlopen(req, timeout=60).read().decode("utf-8"))
        except Exception:
            if attempt == 2:
                raise
            time.sleep(1.5 * (attempt + 1))


def strip_tags(fragment):
    return htmllib.unescape(re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", fragment))).strip()


def cards(fragment):
    """Every {item, qty} card in a fragment, in the order they are laid out.

    A caption that is a bracketed subtotal — "[11]" — is the running total the
    trace table prints beside each step, not a quantity to import, so a card
    whose only number is bracketed is skipped rather than counted twice."""
    out = []
    for chunk in CARD_SPLIT.split(fragment)[1:]:
        name = CARD_NAME.search(chunk)
        if not name:
            continue
        text = CARD_TEXT.search(chunk)
        caption = CARD_CAPTION.search(chunk)
        qty = (text.group(1) if text else (caption.group(1) if caption else "")).strip()
        if not QTY.match(qty):
            continue
        out.append({
            "item": htmllib.unescape(name.group(1)),
            "qty": int(qty.replace(",", "")),
        })
    return out


def ascension_table(page):
    i = page.find('<table class="wikitable ascension-stats"')
    if i < 0:
        return [], []
    table = page[i : page.find("</table>", i)]

    # Each step's cell is rendered twice, once for desktop and once inside a
    # mobile-only row. First occurrence wins; the second is the same numbers.
    steps, seen = [], set()
    for m in STEP.finditer(table):
        key = (int(m.group(1)), int(m.group(2)))
        if key in seen:
            continue
        seen.add(key)
        rest = table[m.end() : table.find("</td>", m.end())]
        steps.append({"from": key[0], "to": key[1], "cost": cards(rest)})

    stats = []
    for row in re.findall(r"<tr[^>]*>(.*?)</tr>", table, re.S):
        if "mobile-only" in row:
            continue
        cells = [strip_tags(c) for c in re.findall(r"<td[^>]*>(.*?)</td>", row, re.S)]
        # A phase's first row leads with the phase pill ("0✦"); its second row
        # starts straight at the level. Reading from the level cell onwards
        # handles both without tracking rowspans.
        level = next((c for c in cells[:2] if re.match(r"^\d+/\d+$", c)), None)
        if not level:
            continue
        nums = [c for c in cells[cells.index(level) + 1 :] if re.match(r"^[\d,]+$", c)]
        if len(nums) < 4:
            continue
        hp, atk, dfn, spd = (int(n.replace(",", "")) for n in nums[:4])
        stats.append({"level": level, "hp": hp, "atk": atk, "def": dfn, "spd": spd})

    return steps, stats


def trace_totals(page):
    out = []
    for m in TOTAL.finditer(page):
        cost = cards(m.group(2))
        if cost:
            out.append({"label": strip_tags(m.group(1)), "cost": cost})
    return out


def fetch_character(name):
    res = wiki({"action": "parse", "page": name, "prop": "text", "redirects": "1"})
    if "parse" not in res:
        return None
    page = res["parse"]["text"]["*"]
    steps, stats = ascension_table(page)
    return {
        "wiki_name": res["parse"]["title"],
        "ascension": steps,
        "stats": stats,
        "trace_totals": trace_totals(page),
    }


def fetch_materials(names):
    """Infoboxes for every material a character references."""
    out, titles = {}, sorted(names)
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
        back = {r["to"]: r["from"] for r in q.get("redirects", [])}
        for pg in q.get("pages", {}).values():
            if not pg.get("revisions"):
                continue
            text = pg["revisions"][0]["slots"]["main"]["*"]
            field = lambda k: (
                lambda m: m.group(1).strip() if m else None
            )(re.search(r"^\|\s*%s\s*=[ \t]*(.*?)[ \t]*$" % k, text, re.M))
            name = back.get(pg["title"], pg["title"])
            out[name] = {
                "title": pg["title"],
                "rarity": field("rarity"),
                "type": field("type"),
                "group": field("group"),
                "description": field("description"),
                "source": field("source1"),
            }
        sys.stderr.write("    materials %d/%d\n" % (min(i + BATCH, len(titles)), len(titles)))
        time.sleep(0.3)
    return out


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--chars", default=CHARS)
    ap.add_argument("--only", action="append", default=[])
    ap.add_argument("--out", default=OUT)
    args = ap.parse_args()

    known = json.load(io.open(args.chars, encoding="utf-8"))
    names = args.only or sorted(known)

    out, problems = {}, []
    for n, name in enumerate(names, 1):
        wiki_name = (known.get(name) or {}).get("wiki_name") or name
        try:
            entry = fetch_character(wiki_name)
        except Exception as exc:
            problems.append("%s: %s" % (name, exc))
            continue
        if not entry or not entry["ascension"]:
            problems.append("%s: no ascension table" % name)
            continue
        out[name] = entry
        sys.stderr.write("    %d/%d %s\n" % (n, len(names), name))
        time.sleep(0.3)

    referenced = {c["item"] for e in out.values()
                  for group in (e["ascension"] + e["trace_totals"])
                  for c in group["cost"]}
    out["_materials"] = fetch_materials(referenced)

    with io.open(args.out, "w", encoding="utf-8", newline="\n") as f:
        json.dump(out, f, ensure_ascii=False, indent=1, sort_keys=True)
        f.write("\n")

    chars = len(out) - 1
    print("%-30s %d characters" % (os.path.basename(args.out), chars))
    print("  ascension steps: %d" % sum(len(v["ascension"]) for k, v in out.items() if k != "_materials"))
    print("  stat rows:       %d" % sum(len(v["stats"]) for k, v in out.items() if k != "_materials"))
    print("  trace totals:    %d" % sum(len(v["trace_totals"]) for k, v in out.items() if k != "_materials"))
    print("  materials:       %d referenced, %d with an infobox"
          % (len(referenced), sum(1 for m in out["_materials"].values() if m.get("rarity"))))
    if problems:
        print("  !! %d problems:" % len(problems))
        for p in problems[:20]:
            print("     %s" % p)


if __name__ == "__main__":
    main()
