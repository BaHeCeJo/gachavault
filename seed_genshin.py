import urllib.request
import urllib.error
import json

BASE = "http://localhost:3000/api/v1"
def get_token():
    r = api_raw("POST", "/auth/login", {"email": "octobrainacgame@gmail.com", "password": "Admin1234!"})
    return r["data"]["access_token"]

def api_raw(method, path, body=None, token=None):
    url = BASE + path
    data = json.dumps(body).encode() if body else None
    headers = {"Content-Type": "application/json"}
    if token: headers["Authorization"] = f"Bearer {token}"
    req = urllib.request.Request(url, data=data, method=method, headers=headers)
    try:
        with urllib.request.urlopen(req) as r:
            return json.loads(r.read())
    except urllib.error.HTTPError as e:
        return json.loads(e.read())

TOKEN = get_token()
print(f"Logged in, token acquired.")

GAME_ID       = "ff1d930a-167d-4da0-9788-1c48ce512577"
CHARS_ID      = "02c78dae-e609-4494-91d9-4b6b98761442"
WEAP_ID       = "030bcec0-34e5-4e0b-85b4-d5773f42e938"
CHAR_SCHEMA   = "3b82c0df-1e85-4a8d-ad55-6a0cdc294e25"
WEAP_SCHEMA   = "c556e9f0-f37c-4569-86bf-72e8bfec77ce"

def api(method, path, body=None):
    return api_raw(method, path, body, TOKEN)

# ── Characters ────────────────────────────────────────────────────────────────
characters = [
    {
        "slug": "hu-tao",
        "name": "Hu Tao",
        "rarity": 5,
        "element": "Pyro",
        "weapon_type": "Polearm",
        "role": "DPS",
        "region": "Liyue",
        "description": "The 77th Director of the Wangsheng Funeral Parlor. Converts HP into Pyro DMG at the cost of her own life force.",
        "image_url": "https://rerollcdn.com/GENSHIN/Characters/new/Hu_Tao.png",
        "tier": "S",
        "release_version": "1.3",
    },
    {
        "slug": "raiden-shogun",
        "name": "Raiden Shogun",
        "rarity": 5,
        "element": "Electro",
        "weapon_type": "Polearm",
        "role": "Support/DPS",
        "region": "Inazuma",
        "description": "The Electro Archon who rules Inazuma with absolute authority. Her Elemental Burst restores Energy for the entire party.",
        "image_url": "https://rerollcdn.com/GENSHIN/Characters/new/Raiden_Shogun.png",
        "tier": "S",
        "release_version": "2.1",
    },
    {
        "slug": "zhongli",
        "name": "Zhongli",
        "rarity": 5,
        "element": "Geo",
        "weapon_type": "Polearm",
        "role": "Support",
        "region": "Liyue",
        "description": "A consultant for the Wangsheng Funeral Parlor. Provides the strongest shield in the game, shredding enemy resistances.",
        "image_url": "https://rerollcdn.com/GENSHIN/Characters/new/Zhongli.png",
        "tier": "S",
        "release_version": "1.1",
    },
    {
        "slug": "kazuha",
        "name": "Kaedehara Kazuha",
        "rarity": 5,
        "element": "Anemo",
        "weapon_type": "Sword",
        "role": "Support",
        "region": "Inazuma",
        "description": "A wandering samurai whose blade dances with the wind. Boosts team Elemental DMG and groups enemies with Swirl.",
        "image_url": "https://rerollcdn.com/GENSHIN/Characters/new/Kaedehara_Kazuha.png",
        "tier": "S",
        "release_version": "1.6",
    },
    {
        "slug": "furina",
        "name": "Furina",
        "rarity": 5,
        "element": "Hydro",
        "weapon_type": "Sword",
        "role": "Support",
        "region": "Fontaine",
        "description": "The former Hydro Archon of Fontaine. Her Salon Members deal off-field Hydro DMG scaled on the whole party HP changes.",
        "image_url": "https://rerollcdn.com/GENSHIN/Characters/new/Furina.png",
        "tier": "S",
        "release_version": "4.2",
    },
    {
        "slug": "nahida",
        "name": "Nahida",
        "rarity": 5,
        "element": "Dendro",
        "weapon_type": "Catalyst",
        "role": "Support/DPS",
        "region": "Sumeru",
        "description": "The Lesser Lord Kusanali, God of Wisdom. Applies Dendro to multiple enemies simultaneously and buffs Elemental Mastery.",
        "image_url": "https://rerollcdn.com/GENSHIN/Characters/new/Nahida.png",
        "tier": "S",
        "release_version": "3.2",
    },
    {
        "slug": "arlecchino",
        "name": "Arlecchino",
        "rarity": 5,
        "element": "Pyro",
        "weapon_type": "Polearm",
        "role": "DPS",
        "region": "Snezhnaya",
        "description": "The Knave, fourth of the Fatui Harbingers. Drains her HP to stack Bond of Life, converting it into massive Pyro DMG.",
        "image_url": "https://rerollcdn.com/GENSHIN/Characters/new/Arlecchino.png",
        "tier": "S",
        "release_version": "4.6",
    },
    {
        "slug": "yelan",
        "name": "Yelan",
        "rarity": 5,
        "element": "Hydro",
        "weapon_type": "Bow",
        "role": "Support",
        "region": "Liyue",
        "description": "A mysterious woman from Liyue with ties to the Ministry of Civil Affairs. Applies off-field Hydro and buffs active character DMG.",
        "image_url": "https://rerollcdn.com/GENSHIN/Characters/new/Yelan.png",
        "tier": "S",
        "release_version": "2.7",
    },
    {
        "slug": "bennett",
        "name": "Bennett",
        "rarity": 4,
        "element": "Pyro",
        "weapon_type": "Sword",
        "role": "Support",
        "region": "Mondstadt",
        "description": "An adventurer from Mondstadt burdened with terrible luck. His Elemental Burst heals and grants a massive ATK bonus.",
        "image_url": "https://rerollcdn.com/GENSHIN/Characters/new/Bennett.png",
        "tier": "S",
        "release_version": "1.0",
    },
    {
        "slug": "xingqiu",
        "name": "Xingqiu",
        "rarity": 4,
        "element": "Hydro",
        "weapon_type": "Sword",
        "role": "Support",
        "region": "Liyue",
        "description": "Second son of the Feiyun Commerce Guild. Summons Rain Swords that deal Hydro DMG and reduce incoming damage.",
        "image_url": "https://rerollcdn.com/GENSHIN/Characters/new/Xingqiu.png",
        "tier": "S",
        "release_version": "1.0",
    },
    {
        "slug": "neuvillette",
        "name": "Neuvillette",
        "rarity": 5,
        "element": "Hydro",
        "weapon_type": "Catalyst",
        "role": "DPS",
        "region": "Fontaine",
        "description": "Chief Justice of Fontaine and true sovereign of the waters. His Charged Attack unleashes a devastating Hydro torrent.",
        "image_url": "https://rerollcdn.com/GENSHIN/Characters/new/Neuvillette.png",
        "tier": "S",
        "release_version": "4.1",
    },
    {
        "slug": "wanderer",
        "name": "Wanderer",
        "rarity": 5,
        "element": "Anemo",
        "weapon_type": "Catalyst",
        "role": "DPS",
        "region": "Sumeru",
        "description": "The sixth Fatui Harbinger, now wandering Teyvat without identity. Hovers in the air and deals powerful Anemo Catalyst DMG.",
        "image_url": "https://rerollcdn.com/GENSHIN/Characters/new/Wanderer.png",
        "tier": "A",
        "release_version": "3.3",
    },
    {
        "slug": "xiao",
        "name": "Xiao",
        "rarity": 5,
        "element": "Anemo",
        "weapon_type": "Polearm",
        "role": "DPS",
        "region": "Liyue",
        "description": "An Adeptus who has guarded Liyue for millennia. Transforms into a yaksha to deal massive Anemo Plunge DMG.",
        "image_url": "https://rerollcdn.com/GENSHIN/Characters/new/Xiao.png",
        "tier": "A",
        "release_version": "1.3",
    },
    {
        "slug": "fischl",
        "name": "Fischl",
        "rarity": 4,
        "element": "Electro",
        "weapon_type": "Bow",
        "role": "Support",
        "region": "Mondstadt",
        "description": "An investigator for the Adventurers Guild who claims to be an Otherworldly Princess. Oz provides constant off-field Electro damage.",
        "image_url": "https://rerollcdn.com/GENSHIN/Characters/new/Fischl.png",
        "tier": "A",
        "release_version": "1.0",
    },
    {
        "slug": "sucrose",
        "name": "Sucrose",
        "rarity": 4,
        "element": "Anemo",
        "weapon_type": "Catalyst",
        "role": "Support",
        "region": "Mondstadt",
        "description": "An alchemist assistant at the Knights of Favonius. A budget Kazuha who still provides strong Elemental Mastery sharing.",
        "image_url": "https://rerollcdn.com/GENSHIN/Characters/new/Sucrose.png",
        "tier": "A",
        "release_version": "1.0",
    },
]

# ── Weapons ───────────────────────────────────────────────────────────────────
weapons = [
    {
        "slug": "staff-of-homa",
        "name": "Staff of Homa",
        "rarity": 5,
        "weapon_type": "Polearm",
        "base_atk": 608,
        "substat": "CRIT DMG",
        "substat_value": "66.2%",
        "passive": "HP increased by 20%. Grants an ATK bonus based on 0.8% of max HP. When HP is below 50%, this ATK bonus is increased by an additional 1% of max HP.",
        "best_for": ["Hu Tao", "Zhongli"],
        "image_url": "https://rerollcdn.com/GENSHIN/Weapons/Staff_of_Homa.png",
        "tier": "S",
    },
    {
        "slug": "engulfing-lightning",
        "name": "Engulfing Lightning",
        "rarity": 5,
        "weapon_type": "Polearm",
        "base_atk": 608,
        "substat": "Energy Recharge",
        "substat_value": "55.1%",
        "passive": "ATK increased by 28% of Energy Recharge over the base 100%. Max 80% bonus ATK. Gain 30% Energy Recharge for 12s after using Elemental Burst.",
        "best_for": ["Raiden Shogun"],
        "image_url": "https://rerollcdn.com/GENSHIN/Weapons/Engulfing_Lightning.png",
        "tier": "S",
    },
    {
        "slug": "freedom-sworn",
        "name": "Freedom-Sworn",
        "rarity": 5,
        "weapon_type": "Sword",
        "base_atk": 608,
        "substat": "Elemental Mastery",
        "substat_value": "198",
        "passive": "Triggers on Elemental Reactions to grant Sigils. At 2 Sigils, consume them to grant ATK SPD +10% and Normal/Charged/Plunging Attack DMG +16% for 12s to all party members.",
        "best_for": ["Kazuha"],
        "image_url": "https://rerollcdn.com/GENSHIN/Weapons/Freedom-Sworn.png",
        "tier": "S",
    },
    {
        "slug": "aqua-simulacra",
        "name": "Aqua Simulacra",
        "rarity": 5,
        "weapon_type": "Bow",
        "base_atk": 542,
        "substat": "CRIT DMG",
        "substat_value": "88.2%",
        "passive": "HP is increased by 16%. When there are opponents nearby, DMG dealt is increased by 20%. This effect is always active whether the wielder is on-field or not.",
        "best_for": ["Yelan"],
        "image_url": "https://rerollcdn.com/GENSHIN/Weapons/Aqua_Simulacra.png",
        "tier": "S",
    },
    {
        "slug": "haran-geppaku-futsu",
        "name": "Haran Geppaku Futsu",
        "rarity": 5,
        "weapon_type": "Sword",
        "base_atk": 608,
        "substat": "CRIT Rate",
        "substat_value": "33.1%",
        "passive": "Obtain 2 Wavespike stacks on other party members using their Elemental Skills. Consume stacks to gain 20% Normal Attack DMG for 8s on Elemental Skill use.",
        "best_for": ["Ayato", "Furina"],
        "image_url": "https://rerollcdn.com/GENSHIN/Weapons/Haran_Geppaku_Futsu.png",
        "tier": "S",
    },
    {
        "slug": "the-catch",
        "name": "The Catch",
        "rarity": 4,
        "weapon_type": "Polearm",
        "base_atk": 510,
        "substat": "Energy Recharge",
        "substat_value": "45.9%",
        "passive": "Elemental Burst DMG +16% and Elemental Burst CRIT Rate +6%.",
        "best_for": ["Raiden Shogun", "Xiangling"],
        "image_url": "https://rerollcdn.com/GENSHIN/Weapons/The_Catch.png",
        "tier": "S",
    },
    {
        "slug": "sacrificial-sword",
        "name": "Sacrificial Sword",
        "rarity": 4,
        "weapon_type": "Sword",
        "base_atk": 454,
        "substat": "Energy Recharge",
        "substat_value": "61.3%",
        "passive": "After dealing DMG with Elemental Skill, 40% chance to end its own CD. Can only occur once every 30s.",
        "best_for": ["Xingqiu", "Kazuha"],
        "image_url": "https://rerollcdn.com/GENSHIN/Weapons/Sacrificial_Sword.png",
        "tier": "A",
    },
]

print("=== Creating Characters ===")
for c in characters:
    res = api("POST", "/items", {
        "game_id": GAME_ID,
        "section_id": CHARS_ID,
        "type_schema_id": CHAR_SCHEMA,
        "slug": c["slug"],
        "data": c,
    })
    if res.get("success"):
        print(f"  OK {c['name']} ({c['element']}, {c['rarity']}*)")
    else:
        print(f"  FAIL {c['name']}: {res}")

print("\n=== Creating Weapons ===")
for w in weapons:
    res = api("POST", "/items", {
        "game_id": GAME_ID,
        "section_id": WEAP_ID,
        "type_schema_id": WEAP_SCHEMA,
        "slug": w["slug"],
        "data": w,
    })
    if res.get("success"):
        print(f"  OK {w['name']} ({w['weapon_type']}, {w['rarity']}*)")
    else:
        print(f"  FAIL {w['name']}: {res}")

print("\nDone! Visit http://localhost:3009/games/genshin-impact")
