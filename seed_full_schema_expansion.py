"""
Full schema expansion for all 8 GachaVault games.
Adds missing sections, schemas, schema field patches, and attribute types.
"""
import requests

r = requests.post("http://localhost:3000/api/v1/auth/login",
    json={"email": "octobrainacgame@gmail.com", "password": "!Admin1234"})
TOKEN = r.json()["data"]["access_token"]
BASE = "http://localhost:3000"
H = {"Authorization": f"Bearer {TOKEN}", "Content-Type": "application/json"}

st = {"sections": 0, "schemas": 0, "attrs": 0, "skip": 0, "err": 0}

# ── helpers ──────────────────────────────────────────────────────────────────

def _sections(slug):
    return {s["slug"]: s for s in
            requests.get(f"{BASE}/api/v1/games/{slug}/sections", headers=H).json().get("data", [])}

def _schemas(slug):
    return {s["name"]: s for s in
            requests.get(f"{BASE}/api/v1/games/{slug}/schemas", headers=H).json().get("data", [])}

def section(slug, name, sec_slug, sort_order=99):
    ex = _sections(slug)
    if sec_slug in ex:
        st["skip"] += 1
        return ex[sec_slug]["id"]
    d = requests.post(f"{BASE}/api/v1/games/{slug}/sections", headers=H,
        json={"name": name, "slug": sec_slug, "sort_order": sort_order}).json()
    if d.get("success"):
        st["sections"] += 1
        print(f"  + section  [{slug}] {name}")
        return d["data"]["id"]
    st["err"] += 1
    print(f"  ✗ section  [{slug}] {name}: {d.get('message')}")

def schema(slug, name, section_id, fields):
    ex = _schemas(slug)
    if name in ex:
        st["skip"] += 1
        return ex[name]["id"]
    d = requests.post(f"{BASE}/api/v1/games/{slug}/schemas", headers=H,
        json={"name": name, "section_id": section_id, "fields": fields}).json()
    if d.get("success"):
        st["schemas"] += 1
        print(f"  + schema   [{slug}] {name}")
        return d["data"]["id"]
    st["err"] += 1
    print(f"  ✗ schema   [{slug}] {name}: {d.get('message')}")

def patch_schema(slug, schema_name, new_fields):
    ex = _schemas(slug)
    s = ex.get(schema_name)
    if not s:
        print(f"  ✗ patch    [{slug}] schema '{schema_name}' not found")
        return
    cur = s.get("fields", [])
    cur = cur if isinstance(cur, list) else []
    existing_keys = {f["key"] for f in cur}
    to_add = [f for f in new_fields if f["key"] not in existing_keys]
    if not to_add:
        st["skip"] += 1
        return
    d = requests.patch(f"{BASE}/api/v1/games/{slug}/schemas/{s['id']}", headers=H,
        json={"fields": cur + to_add}).json()
    if d.get("success"):
        print(f"  ~ patched  [{slug}] {schema_name}: +{[f['key'] for f in to_add]}")
    else:
        st["err"] += 1
        print(f"  ✗ patch    [{slug}] {schema_name}: {d.get('message')}")

def attr(slug, attr_type, key, name, color=None, sort_order=0):
    p = {"attr_type": attr_type, "key": key.lower(), "name": name, "sort_order": sort_order}
    if color:
        p["color"] = color
    d = requests.post(f"{BASE}/api/v1/games/{slug}/attributes", headers=H, json=p).json()
    if d.get("success"):
        st["attrs"] += 1
    elif "already" in str(d.get("message", "")).lower():
        st["skip"] += 1
    else:
        st["err"] += 1
        print(f"  ✗ attr     [{slug}] {attr_type}/{key}: {d.get('message')}")

# shorthand field constructors
def f(key, label, ftype="string", required=False):
    return {"key": key, "label": label, "type": ftype, "required": required}

def freq(key, label, ftype="string"):
    return f(key, label, ftype, required=True)

def ftext(key, label):
    return f(key, label, "text")

def fnum(key, label):
    return f(key, label, "number")

def fimg():
    return f("image_url", "Image URL")

# ═══════════════════════════════════════════════════════════════════════════════
# GENSHIN IMPACT
# ═══════════════════════════════════════════════════════════════════════════════
print("\n=== Genshin Impact ===")
G = "genshin-impact"

# New section: Materials
mat_sec = section(G, "Materials", "materials", sort_order=5)
if mat_sec:
    schema(G, "Material", mat_sec, [
        freq("name",          "Name"),
        f("material_type",    "Material Type"),   # Boss Drop / Talent Book / Local Specialty / Gemstone / Common
        f("source",           "Source"),
        f("region",           "Region"),
        fnum("rarity",        "Rarity"),
        ftext("description",  "Description"),
        fimg(),
    ])

# Patch existing schemas
patch_schema(G, "Character", [
    f("availability", "Availability"),     # limited / standard
    f("constellation", "Constellation"),
])
patch_schema(G, "Enemy", [
    f("location", "Location"),
    f("weak_element", "Weak Element"),
])
patch_schema(G, "Weapon", [
    f("availability", "Availability"),
])

# New attribute types
for i, (key, name, color) in enumerate([
    ("limited",  "Limited",  "#FFB300"),
    ("standard", "Standard", "#78909C"),
]):
    attr(G, "availability", key, name, color, i)

# ═══════════════════════════════════════════════════════════════════════════════
# HONKAI: STAR RAIL
# ═══════════════════════════════════════════════════════════════════════════════
print("\n=== Honkai: Star Rail ===")
H2 = "honkai-star-rail"

mat_sec = section(H2, "Materials", "materials", sort_order=5)
if mat_sec:
    schema(H2, "Material", mat_sec, [
        freq("name",          "Name"),
        f("material_type",    "Material Type"),   # Trace / Ascension / EXP / Credits
        f("source",           "Source"),
        ftext("description",  "Description"),
        fimg(),
    ])

patch_schema(H2, "Character", [
    f("availability", "Availability"),
    fnum("base_speed", "Base Speed"),
    f("world",         "World"),              # Belobog / Xianzhou Luofu / Penacony / etc.
])
patch_schema(H2, "Light Cone", [
    f("availability", "Availability"),
])
patch_schema(H2, "Relic Set", [
    f("set_type", "Set Type"),                # cavern_relic / planar_ornament
])
patch_schema(H2, "Enemy", [
    f("location",     "Location"),
    f("weakness",     "Weakness"),
])

for i, (key, name, color) in enumerate([
    ("limited",  "Limited",  "#FFB300"),
    ("standard", "Standard", "#78909C"),
]):
    attr(H2, "availability", key, name, color, i)

for i, (key, name, color) in enumerate([
    ("astral_express",          "Astral Express",             "#F9A825"),
    ("ipc",                     "IPC",                        "#1565C0"),
    ("stellaron_hunters",       "Stellaron Hunters",          "#6A1B9A"),
    ("cloud_knights",           "Cloud Knights",              "#00838F"),
    ("intelligentsia_guild",    "Intelligentsia Guild",       "#2E7D32"),
    ("order_of_fuxi",           "Order of Fuxi",              "#BF360C"),
    ("followers_of_sanctus_medicus", "Followers of Sanctus Medicus", "#4A148C"),
    ("shape_of_quanta",         "Shape of Quanta",            "#5C6BC0"),
    ("galaxy_rangers",          "Galaxy Rangers",             "#FF6F00"),
    ("clockwork_boys",          "Clockwork Boys",             "#558B2F"),
]):
    attr(H2, "faction", key, name, color, i)

for i, (key, name, color) in enumerate([
    ("cavern_relic",     "Cavern Relic",     "#F57F17"),
    ("planar_ornament",  "Planar Ornament",  "#6A1B9A"),
]):
    attr(H2, "set_type", key, name, color, i)

# ═══════════════════════════════════════════════════════════════════════════════
# WUTHERING WAVES
# ═══════════════════════════════════════════════════════════════════════════════
print("\n=== Wuthering Waves ===")
WW = "wuthering-waves"

mat_sec = section(WW, "Materials", "materials", sort_order=5)
if mat_sec:
    schema(WW, "Material", mat_sec, [
        freq("name",          "Name"),
        f("material_type",    "Material Type"),   # Boss Drop / Local Specialty / Shell Credit
        f("source",           "Source"),
        f("nation",           "Nation"),
        fnum("rarity",        "Rarity"),
        ftext("description",  "Description"),
        fimg(),
    ])

patch_schema(WW, "Resonator", [
    f("nation",       "Nation"),
    f("availability", "Availability"),
])
patch_schema(WW, "Echo", [
    f("sonata",       "Sonata Effect"),       # echo set / sonata name
])
patch_schema(WW, "Enemy", [
    f("class",        "Class"),               # Common / Elite / Boss / Calamity / Overlord
    f("location",     "Location"),
])

# 3-star rarity
attr(WW, "rarity", "3", "3 Stars", "#9E9E9E", 2)

for i, (key, name, color) in enumerate([
    ("limited",  "Limited",  "#FFB300"),
    ("standard", "Standard", "#78909C"),
]):
    attr(WW, "availability", key, name, color, i)

for i, (key, name, color) in enumerate([
    ("jinzhou",    "Jinzhou",    "#FF7043"),
    ("huanglong",  "Huanglong", "#AB47BC"),
    ("rinascita",  "Rinascita", "#42A5F5"),
    ("mt_firmament","Mt. Firmament", "#26C6DA"),
]):
    attr(WW, "nation", key, name, color, i)

for i, (key, name, color) in enumerate([
    ("overlord",  "Overlord",  "#E91E63"),
    ("calamity",  "Calamity",  "#9C27B0"),
    ("elite",     "Elite",     "#F44336"),
    ("common",    "Common",    "#9E9E9E"),
]):
    attr(WW, "echo_class", key, name, color, i)

for i, (key, name, color) in enumerate([
    ("freezing_frost",    "Freezing Frost",    "#42A5F5"),
    ("molten_rift",       "Molten Rift",       "#FF5722"),
    ("void_thunder",      "Void Thunder",      "#7E57C2"),
    ("sierra_gale",       "Sierra Gale",       "#26C6DA"),
    ("celestial_light",   "Celestial Light",   "#FFEE58"),
    ("sun_sinking_eclipse","Sun-sinking Eclipse","#78909C"),
    ("rejuvenating_glow", "Rejuvenating Glow", "#EC407A"),
    ("moonlit_clouds",    "Moonlit Clouds",    "#5C6BC0"),
    ("lingering_tunes",   "Lingering Tunes",   "#66BB6A"),
]):
    attr(WW, "sonata", key, name, color, i)

# ═══════════════════════════════════════════════════════════════════════════════
# NIKKE: GODDESS OF VICTORY
# ═══════════════════════════════════════════════════════════════════════════════
print("\n=== NIKKE ===")
NK = "nikke"

bonds_sec = section(NK, "Bonds", "bonds", sort_order=4)
if bonds_sec:
    schema(NK, "Bond Story", bonds_sec, [
        freq("nikke_name",    "NIKKE Name"),
        fnum("bond_level",    "Bond Level"),
        f("story_title",      "Story Title"),
        ftext("description",  "Description"),
        fimg(),
    ])

outpost_sec = section(NK, "Outpost", "outpost", sort_order=5)
if outpost_sec:
    schema(NK, "Outpost Building", outpost_sec, [
        freq("name",          "Name"),
        f("building_type",    "Building Type"),
        fnum("max_level",     "Max Level"),
        ftext("effect",       "Effect"),
        ftext("description",  "Description"),
        fimg(),
    ])

patch_schema(NK, "NIKKE", [
    f("core_count", "Core Count"),
])
patch_schema(NK, "Enemy", [
    f("weakness",   "Weakness"),
    f("location",   "Location"),
])

for i, (key, name, color) in enumerate([
    ("counters",      "Counters",      "#F44336"),
    ("missilis_company","Missilis Company","#1565C0"),
    ("crown",         "Crown",         "#FFD700"),
    ("biscuit_corps", "Biscuit Corps", "#FF9800"),
    ("unlimited",     "Unlimited",     "#6A1B9A"),
    ("rouge_hammer",  "Rouge Hammer",  "#880E4F"),
    ("underworld_guild","Underworld Guild","#212121"),
    ("think_tank",    "Think Tank",    "#00695C"),
]):
    attr(NK, "squad", key, name, color, i)

# ═══════════════════════════════════════════════════════════════════════════════
# ARKNIGHTS
# ═══════════════════════════════════════════════════════════════════════════════
print("\n=== Arknights ===")
AK = "arknights"

modules_sec = section(AK, "Modules", "modules", sort_order=5)
if modules_sec:
    schema(AK, "Module", modules_sec, [
        freq("name",          "Name"),
        freq("operator",      "Operator"),
        f("module_type",      "Module Type"),   # X / Y / D / Δ
        f("stage_req",        "Stage Requirement"),
        ftext("stat_bonus",   "Stat Bonus"),
        ftext("trait_upgrade","Trait Upgrade"),
        ftext("talent_upgrade","Talent Upgrade"),
        ftext("description",  "Description"),
        fimg(),
    ])

patch_schema(AK, "Operator", [
    f("attack_type", "Attack Type"),     # physical / arts / true
    f("range",       "Attack Range"),
    f("deploy_time", "Redeploy Time"),
])
patch_schema(AK, "Item", [
    f("category",    "Category"),        # Upgrade Material / EXP / Furniture / etc.
    f("obtain",      "How to Obtain"),
])
patch_schema(AK, "Stage", [
    f("chapter",     "Chapter"),
    f("reward",      "Primary Reward"),
    f("is_event",    "Event Stage"),
])

for i, (key, name, color) in enumerate([
    ("physical", "Physical", "#9E9E9E"),
    ("arts",     "Arts",     "#7E57C2"),
    ("true",     "True",     "#F44336"),
]):
    attr(AK, "attack_type", key, name, color, i)

for i, (key, name, color) in enumerate([
    ("rhodes_island",   "Rhodes Island",      "#2196F3"),
    ("reunion",         "Reunion",            "#F44336"),
    ("lungmen",         "Lungmen",            "#FF9800"),
    ("ursus",           "Ursus",              "#B71C1C"),
    ("yan",             "Yan",                "#E91E63"),
    ("leithania",       "Leithania",          "#9C27B0"),
    ("kjerag",          "Kjerag",             "#00ACC1"),
    ("sarkaz",          "Sarkaz",             "#6D4C41"),
    ("laterano",        "Laterano",           "#F9A825"),
    ("siesta",          "Siesta",             "#FF7043"),
    ("columbia",        "Columbia",           "#558B2F"),
    ("iberia",          "Iberia",             "#0277BD"),
    ("higashi",         "Higashi",            "#C62828"),
    ("minos",           "Minos",              "#37474F"),
    ("rim_billiton",    "Rim Billiton",       "#4E342E"),
    ("kazdel",          "Kazdel",             "#212121"),
]):
    attr(AK, "faction", key, name, color, i)

# Arknights subclasses (by class)
SUBCLASSES = [
    # Guards
    ("dualstrike_guard",    "Dualstrike Guard",    "#EF5350"),
    ("ranged_guard",        "Ranged Guard",        "#EF9A9A"),
    ("arts_fighter",        "Arts Fighter",        "#CE93D8"),
    ("centurion",           "Centurion",           "#F44336"),
    ("instructor",          "Instructor",          "#FF8A65"),
    ("lord",                "Lord",                "#C62828"),
    ("musha",               "Musha",               "#D32F2F"),
    ("swordmaster",         "Swordmaster",         "#E57373"),
    ("fighter",             "Fighter",             "#FFCDD2"),
    ("liberator",           "Liberator",           "#B71C1C"),
    # Snipers
    ("marksman",            "Marksman",            "#66BB6A"),
    ("fastshot",            "Fastshot",            "#A5D6A7"),
    ("besieger",            "Besieger",            "#388E3C"),
    ("heavyshooter",        "Heavyshooter",        "#2E7D32"),
    ("deadeye",             "Deadeye",             "#81C784"),
    ("spreadshooter",       "Spreadshooter",       "#4CAF50"),
    ("flinger",             "Flinger",             "#C8E6C9"),
    ("artilleryman",        "Artilleryman",        "#1B5E20"),
    # Casters
    ("core_caster",         "Core Caster",         "#CE93D8"),
    ("splash_caster",       "Splash Caster",       "#BA68C8"),
    ("mech_accord_caster",  "Mech-Accord Caster",  "#8E24AA"),
    ("phalanx_caster",      "Phalanx Caster",      "#AB47BC"),
    ("chainsaw_caster",     "Chainsaw Caster",     "#6A1B9A"),
    ("blast_caster",        "Blast Caster",        "#9C27B0"),
    ("pioneer_caster",      "Pioneer Caster",      "#E1BEE7"),
    # Defenders
    ("protector",           "Protector",           "#42A5F5"),
    ("guardian",            "Guardian",            "#64B5F6"),
    ("juggernaut",          "Juggernaut",          "#1565C0"),
    ("arts_protector",      "Arts Protector",      "#7986CB"),
    ("duelist",             "Duelist",             "#1976D2"),
    ("fortress",            "Fortress",            "#0D47A1"),
    ("sentinel_protector",  "Sentinel Protector",  "#BBDEFB"),
    ("longstrike",          "Longstrike",          "#90CAF9"),
    # Medics
    ("medic",               "Medic",               "#80CBC4"),
    ("multi_target_medic",  "Multi-Target Medic",  "#4DB6AC"),
    ("wandering_medic",     "Wandering Medic",     "#00897B"),
    ("therapist",           "Therapist",           "#26A69A"),
    ("incantation_medic",   "Incantation Medic",   "#00695C"),
    ("enmity_medic",        "Enmity Medic",        "#B2DFDB"),
    ("linkage_medic",       "Linkage Medic",       "#004D40"),
    # Supporters
    ("aura",                "Aura",                "#FFD54F"),
    ("decel_binder",        "Decel Binder",        "#FFCA28"),
    ("summoner",            "Summoner",            "#FF8F00"),
    ("hexer",               "Hexer",               "#FFB300"),
    ("bard",                "Bard",                "#FFF176"),
    ("artificer",           "Artificer",           "#FFA000"),
    ("mechanic",            "Mechanic",            "#FFECB3"),
    ("instructed_supporter","Instructed Supporter", "#E65100"),
    # Vanguards
    ("pioneer_vanguard",    "Pioneer",             "#A5D6A7"),
    ("warrior_vanguard",    "Warrior",             "#C8E6C9"),
    ("tactician",           "Tactician",           "#66BB6A"),
    ("standard_bearer",     "Standard Bearer",     "#2E7D32"),
    ("charger",             "Charger",             "#43A047"),
    # Specialists
    ("executor",            "Executor",            "#FFAB91"),
    ("push_stroker",        "Push Stroker",        "#FF7043"),
    ("ambusher",            "Ambusher",            "#E64A19"),
    ("hookmaster",          "Hookmaster",          "#D84315"),
    ("trapmaster",          "Trapmaster",          "#BF360C"),
    ("merchant",            "Merchant",            "#FF8A65"),
    ("geek",                "Geek",                "#FFCCBC"),
    ("dollkeeper",          "Dollkeeper",          "#FF5722"),
    ("loopshooter",         "Loopshooter",         "#F4511E"),
]
for i, (key, name, color) in enumerate(SUBCLASSES):
    attr(AK, "subclass", key, name, color, i)

# ═══════════════════════════════════════════════════════════════════════════════
# BLUE ARCHIVE
# ═══════════════════════════════════════════════════════════════════════════════
print("\n=== Blue Archive ===")
BA = "blue-archive"

raids_sec = section(BA, "Raids", "raids", sort_order=4)
if raids_sec:
    schema(BA, "Raid Boss", raids_sec, [
        freq("name",          "Name"),
        f("raid_type",        "Raid Type"),       # Total Assault / Grand Assault / Elimination
        f("armor_type",       "Armor Type"),
        f("terrain",          "Terrain"),         # Urban / Outdoor / Indoor
        f("difficulty",       "Max Difficulty"),  # Torment / Insane / Hardcore / Normal
        f("recommended_attack_type", "Recommended Attack Type"),
        f("release_date",     "Release Date"),
        ftext("description",  "Description"),
        fimg(),
    ])

patch_schema(BA, "Student", [
    f("affinity",     "Combat Affinity"),    # urban / outdoor / indoor
    f("use_cover",    "Uses Cover"),
])
patch_schema(BA, "Equipment", [
    fnum("tier", "Tier"),
    f("category", "Category"),              # Hat / Gloves / Shoes / Bag / Badge / Hairpin
])
patch_schema(BA, "Enemy", [
    f("location", "Location / Faction"),
])

for i, (key, name, color) in enumerate([
    ("striker", "Striker", "#F44336"),
    ("special", "Special", "#9C27B0"),
]):
    attr(BA, "position", key, name, color, i)

for i, (key, name, color) in enumerate([
    ("urban",   "Urban",   "#607D8B"),
    ("outdoor", "Outdoor", "#4CAF50"),
    ("indoor",  "Indoor",  "#FF9800"),
]):
    attr(BA, "affinity", key, name, color, i)

# Missing schools
for i, (key, name, color) in enumerate([
    ("red_winter",        "Red Winter",        "#D32F2F"),
    ("valkyrie",          "Valkyrie",          "#1565C0"),
    ("arius",             "Arius Squad",       "#6A1B9A"),
    ("tokiwadai",         "Tokiwadai",         "#00838F"),
    ("gehenna_faculty",   "Gehenna Faculty",   "#FF6F00"),
    ("etc",               "ETC",               "#546E7A"),
], start=len(["abydos","gehenna","millennium","trinity","hyakkiyako","srt_special_forces","desert_railroad","shanhaijing_senior_high"])):
    attr(BA, "school", key, name, color, i)

# Clubs
CLUBS = [
    ("cleaning_clearing",       "Cleaning & Clearing",     "#42A5F5"),
    ("justice_task_force",      "Justice Task Force",      "#EF5350"),
    ("game_development",        "Game Development Dept.",  "#66BB6A"),
    ("tea_party",               "Tea Party",               "#F48FB1"),
    ("problem_solver_68",       "Problem Solver 68",       "#FF7043"),
    ("pandemonium_society",     "Pandemonium Society",     "#AB47BC"),
    ("engineering_dept",        "Engineering Dept.",       "#FFA726"),
    ("seminar",                 "Seminar",                 "#26C6DA"),
    ("rabbit_squad",            "Rabbit Squad",            "#EC407A"),
    ("foreclosure_task_force",  "Foreclosure Task Force",  "#8D6E63"),
    ("sisterhood",              "Sisterhood",              "#F06292"),
    ("countermeasure_committee","Countermeasure Committee","#29B6F6"),
    ("library_committee",       "Library Committee",       "#5C6BC0"),
    ("c_c",                     "C&C",                     "#EF9A9A"),
    ("workshop",                "Workshop",                "#FFD54F"),
    ("hyakkiyako_ninpocho",     "Ninpocho",                "#FF8A65"),
    ("srt_s",                   "SRT Special Forces",      "#546E7A"),
    ("trinity_vigilance_corps", "Vigilance Corps",         "#90A4AE"),
    ("valkyrie_police_squad",   "Police Squad",            "#1E88E5"),
]
for i, (key, name, color) in enumerate(CLUBS):
    attr(BA, "club", key, name, color, i)

# ═══════════════════════════════════════════════════════════════════════════════
# PUNISHING: GRAY RAVEN
# ═══════════════════════════════════════════════════════════════════════════════
print("\n=== Punishing: Gray Raven ===")
PGR = "punishing-gray-raven"

coatings_sec = section(PGR, "Coatings", "coatings", sort_order=5)
if coatings_sec:
    schema(PGR, "Coating", coatings_sec, [
        freq("name",           "Name"),
        freq("construct",      "Construct"),
        f("skin_type",         "Type"),           # Story / Crossover / Limited / Standard
        f("obtain_method",     "How to Obtain"),
        ftext("description",   "Description"),
        fimg(),
    ])

orbs_sec = section(PGR, "Orbs", "orbs", sort_order=6)
if orbs_sec:
    schema(PGR, "Orb", orbs_sec, [
        freq("name",           "Name"),
        f("orb_type",          "Orb Type"),       # Attack / Support / Special
        f("element",           "Element"),
        ftext("effect",        "Effect"),
        ftext("description",   "Description"),
        fimg(),
    ])

patch_schema(PGR, "Construct", [
    f("variant",      "Variant"),                  # e.g. Crimson Abyss / Tempest Blades
    f("availability", "Availability"),
])
patch_schema(PGR, "Weapon", [
    f("construct",    "Compatible Construct"),
])
patch_schema(PGR, "Memory", [
    f("element",      "Element"),
])
patch_schema(PGR, "Enemy", [
    f("location",     "Location"),
])

for i, (key, name, color) in enumerate([
    ("sword",         "Sword",         "#EF5350"),
    ("katana",        "Katana",        "#E91E63"),
    ("blade",         "Blade",         "#F44336"),
    ("scythe",        "Scythe",        "#9C27B0"),
    ("bow",           "Bow",           "#42A5F5"),
    ("cannon",        "Cannon",        "#FF9800"),
    ("lance",         "Lance",         "#00BCD4"),
    ("shotgun",       "Shotgun",       "#FF7043"),
    ("hammer",        "Hammer",        "#795548"),
]):
    attr(PGR, "weapon_type", key, name, color, i)

attr(PGR, "rarity", "ss", "SS", "#FF6F00", 0)   # SS rank (higher than S in some contexts)

for i, (key, name, color) in enumerate([
    ("limited",   "Limited",   "#FFB300"),
    ("standard",  "Standard",  "#78909C"),
    ("crossover", "Crossover", "#E91E63"),
]):
    attr(PGR, "availability", key, name, color, i)

# ═══════════════════════════════════════════════════════════════════════════════
# ZENLESS ZONE ZERO
# ═══════════════════════════════════════════════════════════════════════════════
print("\n=== Zenless Zone Zero ===")
ZZZ = "zenless-zone-zero"

discs_sec = section(ZZZ, "Drive Discs", "drive-discs", sort_order=4)
if discs_sec:
    schema(ZZZ, "Drive Disc Set", discs_sec, [
        freq("name",          "Name"),
        f("two_piece",        "2-Piece Bonus"),
        ftext("four_piece",   "4-Piece Bonus"),
        ftext("description",  "Description"),
        fimg(),
    ])

patch_schema(ZZZ, "Agent", [
    f("availability", "Availability"),
])
patch_schema(ZZZ, "W-Engine", [
    f("availability", "Availability"),
])
patch_schema(ZZZ, "Bangboo", [
    f("rarity",       "Rarity"),
])
patch_schema(ZZZ, "Enemy", [
    f("location",     "Location / Hollow"),
    f("weakness",     "Weakness"),
])

for i, (key, name, color) in enumerate([
    ("slash",   "Slash",   "#EF5350"),
    ("pierce",  "Pierce",  "#42A5F5"),
    ("strike",  "Strike",  "#FF9800"),
]):
    attr(ZZZ, "attack_type", key, name, color, i)

for i, (key, name, color) in enumerate([
    ("limited",  "Limited",  "#FFB300"),
    ("standard", "Standard", "#78909C"),
    ("w_engine", "W-Engine", "#78909C"),
]):
    attr(ZZZ, "availability", key, name, color, i)

# Missing element: frost is same as ice in ZZZ, skip
# Missing factions added in 1.x patches
for i, (key, name, color) in enumerate([
    ("hollow_special_forces", "Hollow Special Forces", "#546E7A"),
    ("stars_of_lyra",         "Stars of Lyra",         "#5C6BC0"),
    ("gentle_house",          "Gentle House",           "#F48FB1"),
    ("criminal_investigation_special_response_team", "CIST", "#1565C0"),
], start=len(["victoria_housekeeping","new_eridu_city_hall","sons_of_calydon",
              "belobog_industries","cunning_hares","obol_squad","section_6"])):
    attr(ZZZ, "faction", key, name, color, i)

# ═══════════════════════════════════════════════════════════════════════════════
print(f"""
Done!
  Sections created : {st['sections']}
  Schemas created  : {st['schemas']}
  Attrs created    : {st['attrs']}
  Skipped (exist)  : {st['skip']}
  Errors           : {st['err']}
""")
