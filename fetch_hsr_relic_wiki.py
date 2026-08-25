#!/usr/bin/env python3
"""Cache the relic set infoboxes from the Honkai: Star Rail wiki.

Relics are the third build pillar next to characters and light cones, and
unlike those two there is no pasted catalog to start from — the wiki is the
only source, so this script both discovers the set list and caches it.

Every set page carries one Relic Set Infobox:

    {{Relic Set Infobox
    |type         = Cavern Relic
    |head         = Musketeer's Wild Wheat Felt Hat
    ...
    |2pcBonus     = [[ATK]] increases by 12%.
    |4pcBonus     = The wearer's [[SPD]] increases by 6%...
    |rarity       = 2345
    |source5.1    = [[Cavern of Corrosion: Path of Drifting]]

The `type` field is what separates the two families: a Cavern Relic has four
pieces (head/hand/body/feet) and both a 2pc and a 4pc bonus, a Planar Ornament
has two (planarsphere/linkrope) and only a 2pc. Nothing else distinguishes
them, so the type is read rather than guessed from which piece fields exist.

Writes seed_data/hsr_relics_wiki.json so the build is reproducible offline and
reviewable in a diff; re-run only when the wiki gains new sets.

    python fetch_hsr_relic_wiki.py
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
OUT = os.path.join(HERE, "seed_data", "hsr_relics_wiki.json")

WIKI_API = "https://honkai-star-rail.fandom.com/api.php"
UA = "gachavault-seed/1.0 (relic import)"
CATEGORY = "Category:Relic Sets"
BATCH = 25

# Infobox field -> the slot the game shows it in. A set uses one family or the
# other, never both, so a missing field here is normal rather than a problem.
CAVERN_SLOTS = [("head", "Head"), ("hand", "Hands"), ("body", "Body"), ("feet", "Feet")]
ORNAMENT_SLOTS = [("planarsphere", "Planar Sphere"), ("linkrope", "Link Rope")]

RELEASE_CATEGORY = re.compile(r"^Category:Released in Version (\S+)$")

# {{Lightning}} and friends render as an icon plus the element name. Only the
# seven elements are substituted: any other bare template is something this
# script has not seen and should surface for review rather than silently unwrap.
ELEMENTS = ("Physical", "Fire", "Ice", "Lightning", "Wind", "Quantum", "Imaginary")


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


def infobox_field(text, key):
    """One `|key = value` line of the Relic Set Infobox.

    [ \t] not \\s: \\s matches newlines, so an empty "|key =" would capture the
    next line instead of an empty string."""
    m = re.search(r"^\|\s*%s\s*=[ \t]*(.*?)[ \t]*$" % re.escape(key), text, re.M)
    return m.group(1).strip() if m else None


def clean(text):
    """Wikitext -> plain sentence.

    The bonus fields lean on wikilinks to stat pages ([[ATK]], [[CRIT DMG]])
    far more than the light cone effects did, and otherwise use the same small
    set of constructs. Anything unhandled is left alone rather than guessed at,
    and shows up as leftover markup in the output for review."""
    if text is None:
        return None
    # {{Color|h|20%}} -> 20%  — the wrapper only carries highlighting.
    text = re.sub(r"\{\{Color\|[^|]*\|([^{}]*)\}\}", r"\1", text)
    text = re.sub(r"\{\{sic\|([^|{}]*)(?:\|[^{}]*)?\}\}", r"\1", text)
    text = re.sub(r"\{\{(%s)\}\}" % "|".join(ELEMENTS), r"\1", text)
    # [[Target|Label]] -> Label, [[Target]] -> Target
    text = re.sub(r"\[\[(?:[^\]|]*\|)?([^\]|]*)\]\]", r"\1", text)
    text = re.sub(r"<br\s*/?>", "\n", text)
    text = re.sub(r"</?[a-zA-Z][^>]*>", "", text)
    text = text.replace("'''", "").replace("''", "")
    return html.unescape(text).strip()


def set_titles():
    """Every page in Category:Relic Sets, paged through."""
    titles, cont = [], {}
    while True:
        res = wiki(dict({
            "action": "query",
            "list": "categorymembers",
            "cmtitle": CATEGORY,
            "cmlimit": "500",
            "cmnamespace": "0",
        }, **cont))
        titles += [m["title"] for m in res.get("query", {}).get("categorymembers", [])]
        if "continue" not in res:
            return sorted(titles)
        cont = res["continue"]


def sources(text, rarity):
    """`source5.1`, `source5.2`, ... for the set's highest rarity.

    The lower-rarity source lists are the same drops minus the endgame ones, so
    only the top tier is kept — that is the one a reader planning a farm needs.
    """
    out = []
    for i in range(1, 9):
        v = infobox_field(text, "source%s.%d" % (rarity, i))
        if not v:
            break
        out.append(clean(v))
    return out


def utilities(text):
    """The wiki's own tags for a set — "ATK Increase", "DMG Boost", ...

    Worth keeping because they are the closest thing the source has to the
    facets a filter would offer, and they are hand-curated per set."""
    out = []
    for i in range(1, 9):
        v = infobox_field(text, "utility%d" % i)
        if not v:
            break
        out.append(clean(v))
    return out


def fetch(titles):
    pages, cats, redirects = {}, {}, {}

    for i in range(0, len(titles), BATCH):
        res = wiki({
            "action": "query",
            "prop": "revisions|categories",
            "rvprop": "content",
            "rvslots": "main",
            "cllimit": "500",
            "redirects": "1",
            "titles": "|".join(titles[i : i + BATCH]),
        })
        q = res.get("query", {})
        for r in q.get("redirects", []):
            redirects[r["from"]] = r["to"]
        for pg in q.get("pages", {}).values():
            if pg.get("revisions"):
                pages[pg["title"]] = pg["revisions"][0]["slots"]["main"]["*"]
            cats[pg["title"]] = [c["title"] for c in pg.get("categories", [])]
        sys.stderr.write("    fetched %d/%d\n" % (min(i + BATCH, len(titles)), len(titles)))
        time.sleep(0.3)

    out, problems = {}, []
    for name in titles:
        title = redirects.get(name, name)
        text = pages.get(title)
        if text is None:
            problems.append("%s: no page content" % name)
            continue
        if "Relic Set Infobox" not in text:
            problems.append("%s: no Relic Set Infobox" % name)
            continue

        kind = infobox_field(text, "type")
        if kind not in ("Cavern Relic", "Planar Ornament"):
            problems.append("%s: unexpected type %r" % (name, kind))
            continue

        slots = CAVERN_SLOTS if kind == "Cavern Relic" else ORNAMENT_SLOTS
        pieces = []
        for field, label in slots:
            piece = infobox_field(text, field)
            if not piece:
                problems.append("%s: missing piece field %r" % (name, field))
                continue
            pieces.append({"slot": label, "name": clean(piece)})

        two = clean(infobox_field(text, "2pcBonus"))
        four = clean(infobox_field(text, "4pcBonus"))
        if not two:
            problems.append("%s: no 2pcBonus" % name)
        # Only Cavern Relics have a 4-piece bonus; an ornament without one is
        # correct, a cavern set without one is a parse failure.
        if kind == "Cavern Relic" and not four:
            problems.append("%s: cavern set with no 4pcBonus" % name)
        if kind == "Planar Ornament" and four:
            problems.append("%s: ornament unexpectedly has a 4pcBonus" % name)

        rarities = infobox_field(text, "rarity") or ""
        top = max(rarities) if rarities.isdigit() else ""

        version = None
        for c in cats.get(title, []):
            m = RELEASE_CATEGORY.match(c)
            if m:
                version = m.group(1)

        out[name] = {
            "title": title,
            "type": kind,
            "pieces": pieces,
            "bonus_2pc": two,
            "bonus_4pc": four,
            "rarities": [int(c) for c in rarities if c.isdigit()],
            "sources": sources(text, top) if top else [],
            "utilities": utilities(text),
            "release_version": version,
            "image": infobox_field(text, "image1"),
        }

    return out, problems


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--out", default=OUT)
    args = ap.parse_args()

    titles = set_titles()
    print("relic sets in %s: %d" % (CATEGORY, len(titles)))
    data, problems = fetch(titles)

    with io.open(args.out, "w", encoding="utf-8", newline="\n") as f:
        json.dump(data, f, ensure_ascii=False, indent=1, sort_keys=True)
        f.write("\n")

    cavern = sum(1 for v in data.values() if v["type"] == "Cavern Relic")
    ornament = sum(1 for v in data.values() if v["type"] == "Planar Ornament")
    leftover = [n for n, v in data.items()
                if any("{{" in (b or "") or "[[" in (b or "")
                       for b in (v["bonus_2pc"], v["bonus_4pc"]))]
    print("%-30s %d sets" % (os.path.basename(args.out), len(data)))
    print("  cavern relics:    %d" % cavern)
    print("  planar ornaments: %d" % ornament)
    print("  pieces:           %d" % sum(len(v["pieces"]) for v in data.values()))
    if leftover:
        print("  !! unhandled markup left in: %s" % ", ".join(leftover))
    if problems:
        print("  !! %d problems:" % len(problems))
        for p in problems[:20]:
            print("     %s" % p)


if __name__ == "__main__":
    main()
