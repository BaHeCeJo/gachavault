#!/usr/bin/env python3
"""Cache the light cone infoboxes from the Honkai: Star Rail wiki.

The pasted catalog in seed_data/hsr_light_cones_raw.txt states each effect as
prose with the per-superimposition numbers run together — "by 12/14/16/18/20%".
That text is lossy: comparing it against the wiki showed the source had rounded
decimals (31.25 -> 31), truncated them (6.25 -> 6.3) and in places was simply
wrong (28 rendered as 2). Values a reader is meant to plan around cannot come
from a source that approximates them.

The wiki states the same effects in machine-readable form:

    |passive        = Longing
    |effect         = Increases the wearer's CRIT Rate by {{Color|h|(var1)%}}.
    |eff_rank1_var1 = 12
    ...
    |eff_rank5_var1 = 20

which gives three things the prose cannot: the exact value at every rank, the
exact position each value occupies in the sentence, and the ability's name.

Writes seed_data/hsr_light_cones_wiki.json so the build is reproducible offline
and reviewable in a diff; re-run only when the wiki gains new light cones.

    python fetch_hsr_light_cone_wiki.py
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
CATALOG = os.path.join(HERE, "seed_data", "hsr_light_cones_import.json")
RAW_NAMES = os.path.join(HERE, "seed_data", "hsr_light_cones_raw.txt")
OUT = os.path.join(HERE, "seed_data", "hsr_light_cones_wiki.json")

WIKI_API = "https://honkai-star-rail.fandom.com/api.php"
UA = "gachavault-seed/1.0 (light cone import)"
BATCH = 25
RANKS = 5

# Catalog name -> wiki title, where the wiki disambiguates or cases it
# differently. Plain redirects are followed by the API and need no entry here.
TITLE_OVERRIDES = {
    "Shadowed By Night": "Shadowed by Night",
    # Both of these are taken on the wiki by a different subject, so the light
    # cone lives at a disambiguated title.
    "Amber": "Amber (Light Cone)",
    "Data Bank": "Data Bank (Light Cone)",
}


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
    """One `|key = value` line of the Light Cone Infobox.

    [ 	] not \s: \s matches newlines, so an empty "|key =" would capture the
    next line instead of an empty string."""
    m = re.search(r"^\|\s*%s\s*=[ \t]*(.*?)[ \t]*$" % re.escape(key), text, re.M)
    return m.group(1).strip() if m else None


def clean_effect(text):
    """Wikitext -> plain sentence, with the (varN) markers left in place.

    Only the constructs the effect fields actually use are handled — a survey of
    all 167 found {{Color}} (once per value), {{sic}}, wikilinks, <br /> and the
    odd bold/italic. Anything else is left alone rather than guessed at, and
    shows up as leftover braces in the output for review."""
    # {{Color|h|(var1)%}} -> (var1)%  — the wrapper only carries highlighting.
    text = re.sub(r"\{\{Color\|[^|]*\|([^{}]*)\}\}", r"\1", text)
    # {{sic|CRIT rate|hide=1}} -> CRIT rate  — the wiki flagging the game's typo.
    text = re.sub(r"\{\{sic\|([^|{}]*)(?:\|[^{}]*)?\}\}", r"\1", text)
    # [[Target|Label]] -> Label, [[Target]] -> Target
    text = re.sub(r"\[\[(?:[^\]|]*\|)?([^\]|]*)\]\]", r"\1", text)
    text = re.sub(r"<br\s*/?>", "\n", text)
    text = re.sub(r"</?[a-zA-Z][^>]*>", "", text)
    text = text.replace("'''", "").replace("''", "")
    return html.unescape(text).strip()


def catalog_names():
    """Light cone names, from the import file if built, else the raw catalog."""
    if os.path.exists(CATALOG):
        rows = json.load(io.open(CATALOG, encoding="utf-8"))
        return [r["data"]["name"] for r in rows]
    names, lines = [], io.open(RAW_NAMES, encoding="utf-8").read().splitlines()
    for i, line in enumerate(lines):
        if re.match(r"^Rarity:\s*\d★$", line.strip()) and i >= 2:
            names.append(lines[i - 2].strip())
    return names


def fetch(names):
    title_of = {n: TITLE_OVERRIDES.get(n, n) for n in names}
    titles = sorted(set(title_of.values()))
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
    for name in names:
        title = title_of[name]
        text = pages.get(redirects.get(title, title))
        if text is None:
            problems.append("%s: no page at %r" % (name, title))
            continue

        effect = infobox_field(text, "effect")
        if not effect:
            problems.append("%s: no effect field" % name)
            continue
        effect = clean_effect(effect)

        # Variables in order of first appearance, so scaling order matches
        # reading order.
        seen, order = set(), []
        for v in re.findall(r"\(var(\d+)\)", effect):
            if v not in seen:
                seen.add(v)
                order.append(int(v))

        variables = {}
        for k in order:
            values = [infobox_field(text, "eff_rank%d_var%d" % (r, k)) for r in range(1, RANKS + 1)]
            if any(v is None or v == "" for v in values):
                problems.append("%s: var%d missing a rank value" % (name, k))
                continue
            variables[str(k)] = values

        out[name] = {
            "title": redirects.get(title, title),
            "passive": infobox_field(text, "passive"),
            "effect": effect,
            "var_order": order,
            "variables": variables,
        }

    return out, problems


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--out", default=OUT)
    args = ap.parse_args()

    names = catalog_names()
    print("light cones in catalog: %d" % len(names))
    data, problems = fetch(names)

    with io.open(args.out, "w", encoding="utf-8", newline="\n") as f:
        json.dump(data, f, ensure_ascii=False, indent=1, sort_keys=True)
        f.write("\n")

    named = sum(1 for v in data.values() if v.get("passive"))
    varred = sum(len(v["variables"]) for v in data.values())
    leftover = [n for n, v in data.items() if "{{" in v["effect"] or "[[" in v["effect"]]
    print("%-34s %d cones" % (os.path.basename(args.out), len(data)))
    print("  ability names: %d" % named)
    print("  scaling variables: %d" % varred)
    if leftover:
        print("  !! unhandled markup left in: %s" % ", ".join(leftover))
    if problems:
        print("  !! %d problems:" % len(problems))
        for p in problems[:20]:
            print("     %s" % p)


if __name__ == "__main__":
    main()
