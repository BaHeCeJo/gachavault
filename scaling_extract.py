#!/usr/bin/env python3
"""Lift per-level value runs out of an ability description.

A port of web/src/lib/skillScaling.ts (extractScalingRuns and its label
heuristic) for bulk seeding. Every wiki writes a scaling the same way — one
sentence with the per-level values slash-separated inline, "Increases CRIT Rate
by 12/14/16/18/20%" — so each run becomes a {label, values[]} scaling and leaves
a {token} behind. The site then splices the value for the selected level back
into the sentence.

The TypeScript copy runs in the admin editor ("Extract values"); this one runs
offline over a whole catalog. They must agree, or re-extracting a bulk-imported
entry in admin would renumber its tokens — so both sides are checked against
seed_data/scaling_extraction_fixtures.json. Run this file directly to verify:

    python scaling_extract.py
"""

import io
import json
import os
import re

HERE = os.path.dirname(os.path.abspath(__file__))
FIXTURES = os.path.join(HERE, "seed_data", "scaling_extraction_fixtures.json")

# Two or more numbers joined by "/", each optionally carrying a "%". Narrow on
# purpose: it must not swallow "24/7" or a fraction in prose.
RUN_RE = re.compile(r"\d+(?:\.\d+)?%?(?:/\d+(?:\.\d+)?%?)+")

# Glue words that never belong in a label ("…CRIT Rate by 12/14/16" -> "CRIT
# Rate", not "Rate by").
STOPWORDS = {
    "by", "to", "of", "for", "at", "as", "and", "or", "up", "a", "an", "the",
    "is", "are", "with", "plus", "additional", "that", "this", "equal", "each",
    "every",
}
LEADING_ONLY = {"wearer's", "wearers", "their", "its", "his", "her", "'s"}
# Effect verbs: a label made only of these names an action, not a stat.
VERBS = {
    "deal", "deals", "dealt", "increase", "increases", "increased", "restore",
    "restores", "regenerate", "regenerates", "recover", "recovers", "reduce",
    "reduces", "heal", "heals", "grant", "grants", "gain", "gains", "provide",
    "provides", "inflict", "inflicts", "apply", "applies", "boost", "boosts",
    "raise", "raises", "lower", "lowers", "add", "adds", "has", "have",
}

MAX_LABEL_WORDS = 3


def slugify(s):
    return re.sub(r"^_+|_+$", "", re.sub(r"[^a-z0-9]+", "_", s.strip().lower()))


def _words(s):
    # Mirror the TS class [^\p{L}\p{N}'\s-] -> keep letters, digits, apostrophe,
    # hyphen; everything else becomes a separator.
    cleaned = re.sub(r"[^\w'\s-]+", " ", s, flags=re.UNICODE).replace("_", " ")
    return [w for w in cleaned.split() if w]


def _is_stop(w):
    lw = w.lower()
    return lw in STOPWORDS or lw in LEADING_ONLY


def _is_verb(w):
    return w.lower() in VERBS


def _is_capitalized(w):
    return any(c.isupper() for c in w)


def _is_possessive(w):
    return w.lower().endswith("'s")


def _is_numeric(w):
    # A bare number is prose ("for 2 turn(s)"), never a stat name.
    return re.match(r"^\d+(?:\.\d+)?$", w) is not None


def _trim_edges(items):
    """A stat name never opens with a verb or a bare number ("increases the DMG"
    is the clause, "DMG" is the stat) and never closes with glue or a number."""
    out = list(items)
    while out and (_is_stop(out[0]) or _is_possessive(out[0]) or _is_verb(out[0]) or _is_numeric(out[0])):
        out.pop(0)
    while out and (_is_stop(out[-1]) or _is_numeric(out[-1])):
        out.pop()
    return out


def _phrase_before(before):
    items = _words(before)
    while items and _is_stop(items[-1]):
        items.pop()
    # A trailing verb names the action, not the stat ("…holder's DMG dealt").
    while items and _is_verb(items[-1]):
        items.pop()
    if not items:
        return ""

    tail = items[-MAX_LABEL_WORDS:]
    # Nothing capitalised nearby means we are looking at filler; reach further
    # back to the last capitalised word and take the phrase ending there.
    if not any(_is_capitalized(w) for w in tail):
        caps = [i for i, w in enumerate(items) if _is_capitalized(w)]
        if caps:
            at = caps[-1]
            tail = items[max(0, at - (MAX_LABEL_WORDS - 1)) : at + 1]
    return " ".join(_trim_edges(tail))


def _phrase_after(after):
    # Never cross a comma or sentence boundary — what follows those is a new
    # clause about something else ("…by 3/4/5%, stacking up to 3 times" does
    # not scale "stacking").
    items = _words(re.split(r"[.!?,\n]", after)[0])
    while items and _is_stop(items[0]):
        items.pop(0)
    out = []
    for w in items:
        if len(out) >= MAX_LABEL_WORDS or _is_stop(w):
            break
        out.append(w)
    return " ".join(_trim_edges(out))


def _label_from_context(before, after):
    """Which side names the stat is decided by the word butting up against the
    values. A verb there ("…regenerates 6/6.5/7/7.5/8 Energy") means the stat
    trails the numbers; reaching backwards would sail past the verb and grab
    whatever capitalised phrase came earlier. Everywhere else the stat leads."""
    lead = [w for w in _words(before) if not _is_stop(w)]
    if lead and _is_verb(lead[-1]):
        return _phrase_after(after) or _phrase_before(before)

    label = _phrase_before(before)
    only_verbs = label == "" or all(_is_verb(w) for w in _words(label))
    return (_phrase_after(after) or label) if only_verbs else label


def _normalize_units(parts):
    """A "%" written once at the end of a run applies to every value in it."""
    with_unit = [p for p in parts if p.endswith("%")]
    if len(with_unit) != 1 or not parts[-1].endswith("%"):
        return parts
    return [p if p.endswith("%") else p + "%" for p in parts]


def extract_scaling_runs(description, min_parts=3):
    """-> (text_with_tokens, [{"label":..., "values":[...]}, ...])"""
    scalings = []
    used = set()
    out = []
    last = 0

    for m in RUN_RE.finditer(description):
        raw = m.group(0)
        parts = _normalize_units(raw.split("/"))
        has_percent = any(p.endswith("%") for p in parts)
        if len(parts) < min_parts and not (len(parts) >= 2 and has_percent):
            continue

        start = m.start()
        label = _label_from_context(description[last:start], description[m.end():])

        # Tokens must be unique within an ability or two scalings would resolve
        # to the same value.
        token = slugify(label)
        if not token or token in used:
            token = str(len(scalings) + 1)
        used.add(token)

        out.append(description[last:start])
        out.append("{%s}" % token)
        last = m.end()
        scalings.append({"label": label or "Value %d" % (len(scalings) + 1), "values": parts})

    out.append(description[last:])
    return "".join(out), scalings


def check_fixtures(path=FIXTURES):
    """Assert parity with the TypeScript implementation. Returns the case count."""
    with io.open(path, encoding="utf-8") as f:
        cases = json.load(f)["cases"]
    for c in cases:
        text, scalings = extract_scaling_runs(c["description"])
        want = c["expected"]
        if text != want["text"]:
            raise AssertionError(
                "text mismatch for %r\n  py: %r\n  ts: %r" % (c["description"][:60], text, want["text"])
            )
        if scalings != want["scalings"]:
            raise AssertionError(
                "scalings mismatch for %r\n  py: %r\n  ts: %r"
                % (c["description"][:60], scalings, want["scalings"])
            )
    return len(cases)


if __name__ == "__main__":
    n = check_fixtures()
    print("scaling_extract: %d fixtures match the TypeScript implementation" % n)
