# Seed data

Files here are either a **source** we did not write, a **cache** of something
scraped, or an **output** meant for a person to upload.

**Nothing in this repo writes to the site.** Every pipeline ends at a JSON file
that you load in the admin bulk-import screen yourself, so a person is in front
of every write to production data. The scripts only ever read external sources
(the Honkai: Star Rail wiki) and write files.

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
python make_hsr_import.py          # -> banners + events

python fetch_hsr_light_cone_wiki.py                       # refresh the cone cache
python fetch_hsr_character_wiki.py --chars <names.json>    # refresh the kit cache
```
