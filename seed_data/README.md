# Seed data

Files here are either a **source** we did not write, a **cache** of something
scraped, or an **output** meant for a person to upload.

**Nothing in this repo writes to the site.** Every pipeline ends at a JSON file
that you load in the admin bulk-import screen yourself, so a person is in front
of every write to production data. The scripts only ever read external sources
(the Honkai: Star Rail wiki) and write files.

**The data files are gitignored**, so a fresh clone finds this directory almost
empty. That is expected: the sources are scraped third-party content and the
outputs are large, so they stay local and you regenerate them with the scripts
below. Only this README and `scaling_extraction_fixtures.json` (a test fixture
`web/src/lib/skillScaling.test.ts` reads) are tracked.

## Importing

Upload an `*_import.json` at **Admin → Items → Import**.

Rows carry no item `id`, because ids belong to a database and not to a file, so
the create path would hit a slug clash and skip. Choose **Update them**, which
merges each row into the stored item field by field — the file's keys win, and
keys it does not mention are left alone. That is what lets an enrichment file
add a kit without touching a character's name, element or art.

## Honkai: Star Rail — light cones

```
hsr_light_cones_raw.txt ─┐
                         ├─> make_hsr_light_cones.py ─> hsr_light_cones_import.json
hsr_light_cones_wiki.json ┘        ^
        ^                          └── scaling_extract.py
        └── fetch_hsr_light_cone_wiki.py
```

| File | |
|---|---|
| `hsr_light_cones_raw.txt` | **Source.** The catalog as pasted from a listing site. Trusted for name, rarity and path — *not* for numbers: it rounds decimals, truncates them, and is in places simply wrong. |
| `hsr_light_cones_wiki.json` | **Cache.** Light Cone Infoboxes: the ability name, the effect sentence with a `(varN)` marker at each value, and the value at every superimposition rank. This is where the numbers come from. |
| `hsr_light_cones_import.json` | **Output.** 167 rows, each with an `effect` skilllist. |

Art is not cached here. The wiki names light cone images predictably —
`File:Light Cone <name>.png` for the full art and `File:Light Cone <name> Icon.png`
for the icon — so the URLs are a `prop=imageinfo&iiprop=url` query away when the
images are self-hosted. One name differs: the wiki spells "Shadowed By Night" as
"Shadowed by Night".

Two wiki values are corrected in `VALUE_OVERRIDES` in `make_hsr_light_cones.py`;
`arithmetic_breaks()` runs on every build so a new typo cannot slip in unnoticed.

## Honkai: Star Rail — characters

```
hsr_characters_wiki.json ─┐
                          ├─> make_hsr_characters.py ─> hsr_characters_import.json
hsr_characters_catalog.json ┘        ^
        ^                            └── scaling_extract.py
        └── fetch_hsr_character_wiki.py
```

| File | |
|---|---|
| `hsr_characters_wiki.json` | **Cache.** One entry per character: every ability, trace and eidolon page, with the source page title, the description, and the per-level scaling table scraped from the rendered page. ~1300 pages, so it is committed and builds read it offline. |
| `hsr_characters_catalog.json` | **Source.** `character name → item slug`, taken from the site so rows address the right items. |
| `hsr_characters_import.json` | **Output.** 85 rows, each with a `kit` skilllist. |

Two things the wiki does not state, reconstructed in `make_hsr_characters.py`:

- A `<name>/Enhanced` page is the **reworked** version of an ability (3.4, 4.0,
  4.2), not an enhanced state in combat. `current_kit()` drops the page it
  supersedes, so a character shows one kit rather than two.
- Where a character has two abilities of one type and the wiki distinguishes
  them only by `tag`, `infer_enhanced()` names the wider-hitting one as the
  enhanced form. Aglaea's Slash by a Thousandfold Kiss is the case it exists
  for.

## Honkai: Star Rail — banners and events

```
hsr_warps.json ─> make_hsr_import.py ─> hsr_banners_import.json
                                        hsr_events_import.json
                                        hsr_banner_art.txt
```

`hsr_warps.json` is a cached scrape of the wiki's warp history. Run times are
converted from the wiki's GMT+8 to UTC and characters resolved to item slugs.

Upload the banners at **Admin → Items → Import** first and the events at
**Admin → Events → Import** second: every run points at a banner preset by slug.

**The cache is behind its own output.** `hsr_warps.json` holds 108 character
warps; `hsr_events_import.json` holds 136, because it was built from a scrape
that also covered the light cone warps. Re-running `make_hsr_import.py` today
silently drops those 42 runs. Re-scrape the warp history first, or read the
built file instead — which is what `make_hsr_versions.py` does.

## Honkai: Star Rail — versions

```
hsr_events_import.json ─> make_hsr_versions.py ─> hsr_versions_import.json
```

The calendar has filtered on an `event_type` of `version` since it shipped, with
nothing ever writing one. Each run already carries its version and phase, so one
row per version is derivable: it opens with its first phase and closes with its
last. Upload at **Admin → Events → Import**; it references nothing, so the order
against the runs does not matter.

The start is knowingly approximate — a patch goes live a few hours before its
first warp, after maintenance — so every row records `data.derived_from`, and a
real patch-note time can replace it later without guessing which were estimates.

Open-ended runs are excluded. The wiki publishes collaboration warps with
`time_end = none` and no version of their own, so the version they carry was
inferred by the scraper and is wrong: the two Fate collab runs starting
2025-07-11 are labelled 4.4, a patch a year later. The build prints which runs
it skipped, and asserts no two versions overlap.

## Honkai: Star Rail — relics

```
hsr_relics_wiki.json ─> make_hsr_relics.py ─> hsr_relics_import.json
        ^
        └── fetch_hsr_relic_wiki.py
```

| File | |
|---|---|
| `hsr_relics_wiki.json` | **Cache.** Relic Set Infoboxes for the 60 sets in `Category:Relic Sets`: type, pieces, 2pc/4pc bonuses, rarity span, drop sources and the wiki's own utility tags. |
| `hsr_relics_import.json` | **Output.** 60 rows — 32 Cavern Relics, 28 Planar Ornaments — for a `relics` section using a `Relic Sets` schema. |

Unlike the other two sections there is no pasted catalog, so the fetch both
discovers the set list and caches it.

`type` is what separates the two families, and it is read rather than inferred:
a Cavern Relic has four pieces and both bonuses, a Planar Ornament has two and
only a 2-piece. The build treats a cavern set missing its 4-piece as a failure
and an ornament missing one as correct.

`set_bonus` and `pieces` are lists of `{type, name, description}` rows, the same
shape as the character `kit` and light cone `effect` fields, so the detail-page
block that renders those renders relics with no new component.

The section and its schema do not exist yet — create them in admin before the
first upload, with `relic_type`, `rarity`, `rarity_range`, `set_bonus`,
`pieces`, `release_version`, `sources` and `tags`.

## Honkai: Star Rail — materials and ascension

```
hsr_ascension_wiki.json ─> make_hsr_materials.py ─> hsr_materials_import.json
        ^                                           hsr_ascension_import.json
        └── fetch_hsr_ascension_wiki.py             hsr_stats_import.json (parked)
```

| File | |
|---|---|
| `hsr_ascension_wiki.json` | **Cache.** Per character: base stats at every breakpoint, the six ascension costs, and the two trace totals. Plus `_materials`, the infobox of every item any character references. |
| `hsr_materials_import.json` | **Output.** 132 rows for a `materials` section — 102 Trace Materials, 29 Character Ascension Materials, Credits. |
| `hsr_ascension_import.json` | **Output.** 85 enrichment rows adding `ascension_cost` and `trace_cost` to characters that already exist. Import with **Update them**. |
| `hsr_stats_import.json` | **Parked.** 85 rows of base HP/ATK/DEF/SPD. Needs the table field from `feature/leveling-table-field`; uploading before that merges stores opaque JSON. |

**This is the only fetch that reads rendered HTML.** A character page states its
whole progression as two Lua template calls — `{{Character Ascensions and
Stats|Acheron}}` and `{{Trace Upgrades|Acheron}}` — so the wikitext holds no
numbers at all and `action=parse` is the only way to reach them. That makes it
the most fragile of the pipelines: a skin change on the wiki breaks it where a
wikitext change would not.

Two card layouts exist in that HTML and both are handled: ascension cells put
the quantity in the caption, total-cost blocks put it in a `card-text` span and
the name in the caption. The item name comes from the anchor `title` either way.
Each step is also rendered twice, once for desktop and once in a `mobile-only`
row, so the first occurrence wins.

There are exactly two trace totals per character — one for the Basic ATK trace,
one for any other trace — because that is what the wiki states, not because the
parse stops early.

The build asserts that every material a character asks for has a catalog row, so
an ascension cost can never name an item the site has no page for.

Upload the materials before the character enrichment, so the names the costs
mention already resolve. The `materials` section and its `Materials` schema
(`rarity`, `material_type`, `description`, `source`) need creating in admin
first.

## Profile text — both sections

```
hsr_profiles.json ─> merged into both import files by their make_ scripts
        ^
        └── fetch_hsr_profiles.py
```

One pass over the item pages themselves, for the fields describing what an item
*is* rather than what it does: the blurb, the flavour quote, the release version
and date, and the four voice actors. These sit behind the Overview, Lore,
Release and Voice Actors blocks, which rendered empty on every character but one.

`release_version` comes from the "Released in Version X" categories rather than
from each page's own category list — the API caps categories per request, not
per page, so a bulk query returns almost none. Walking the ~30 version
categories is both complete and cheaper.

The file also carries `_faction`, `_species` and `_world` for a later pass.
Those three are **attribute** fields, and an attribute value that does not exist
on the game renders as raw text rather than a pill, so they need their values
creating in admin before they can be imported.

## Shared

`scaling_extract.py` lifts per-level values out of prose and leaves a `{token}`
where each one sat. It is a port of `web/src/lib/skillScaling.ts`, which powers
the **Extract values** button in the admin skill editor. The two must agree, or
re-extracting an imported ability in admin would renumber its tokens — so both
read `scaling_extraction_fixtures.json` and assert the same output, and the
Python side checks it before any build writes a file.

Run it directly to verify: `python scaling_extract.py`

## Re-running

The caches change only when the wiki does, and the character scrape takes about
ten minutes. Rebuilding from cache is instant:

```bash
python make_hsr_light_cones.py     # -> hsr_light_cones_import.json
python make_hsr_characters.py      # -> hsr_characters_import.json
python make_hsr_import.py          # -> banners + events  (see the caution above)
python make_hsr_relics.py          # -> hsr_relics_import.json
python make_hsr_versions.py        # -> hsr_versions_import.json
python make_hsr_materials.py       # -> materials + ascension costs (+ parked stats)

python fetch_hsr_light_cone_wiki.py                       # refresh the cone cache
python fetch_hsr_character_wiki.py --chars <names.json>    # refresh the kit cache
python fetch_hsr_relic_wiki.py                            # refresh the relic cache
python fetch_hsr_ascension_wiki.py                        # refresh the ascension cache
```
