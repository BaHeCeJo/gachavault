import requests, json

TOKEN = "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJlMzQ2MDIwZC1jOTE3LTRlNmMtODk4Ny1jNDU3MDQxMjdiOGQiLCJlbWFpbCI6Im9jdG9icmFpbmFjZ2FtZUBnbWFpbC5jb20iLCJ1c2VybmFtZSI6Ik9jdG9icmFpbiIsInJvbGUiOiJzdXBlcmFkbWluIiwiZXhwIjoxNzc5MTkyMzkzLCJpYXQiOjE3NzkxOTE0OTMsImp0aSI6IjY1YWRiMWU5LWRlYWItNDIxMy05YjYzLTVhMjJlMTg1ZDI3YyJ9.Yf5OYYMIQjj-wT6O-VVaM87c6OCMv4qD53xbGVurOqw"
BASE = "http://localhost:3000"
H = {"Authorization": f"Bearer {TOKEN}", "Content-Type": "application/json"}

GAMES = {
    "genshin-impact":       "afbb623a-32ee-4f6f-b154-5b061b6510c9",
    "honkai-star-rail":     "5cf70795-995d-4306-be89-0ab7b18b3799",
    "wuthering-waves":      "bb02793f-dc73-42c0-9ae1-da96485b846e",
    "nikke":                "a3a97ba7-5758-4860-ab27-eef1e14b1d2b",
    "arknights":            "d4a5d3ba-e895-4ff1-a0b0-36a0131ca87a",
    "blue-archive":         "345dfac9-5a9d-4a61-887b-fbcf9ca8b983",
    "punishing-gray-raven": "eb8b7b0b-afb7-4d12-86d0-dc7483075ba9",
    "zenless-zone-zero":    "c6ec5f02-8599-42ba-a66a-31c231fcb6b7",
}

ENEMY_SECTIONS = {
    "genshin-impact":       "bf31d591-0c3c-4203-ae9d-7a1e5ef6f825",
    "honkai-star-rail":     "44818deb-bde7-4808-aaa9-b908bb053b8c",
    "wuthering-waves":      "e9f09433-1fad-4dbd-94cc-dea7dc504d63",
    "nikke":                "acde0ceb-51cb-4568-9c72-8e3abc41ea0c",
    "arknights":            "e2f4bbe4-0b71-4ffb-8b39-215416750ee3",
    "blue-archive":         "d9dcd0ac-9c9f-432a-bbe3-d7e3393e7af9",
    "punishing-gray-raven": "f3343cd9-f6c5-4be8-adf1-0fab828586c2",
    "zenless-zone-zero":    "a3ec51ef-dae7-423a-bab9-3ec6d1b1e463",
}

ENEMY_SCHEMAS = {
    "genshin-impact":       "adce02f6-924d-468b-8766-a698b40616a2",
    "honkai-star-rail":     "45098e7e-c796-4830-bbf9-8d16bc2af492",
    "wuthering-waves":      "21a0eb18-8258-4553-8773-ea7ed335dd37",
    "nikke":                "4430087a-3a29-48f2-aab5-274b4b1b3ae6",
    "arknights":            "827670ba-96de-4b96-a989-675da0419820",
    "blue-archive":         "e1ecbd36-aeb5-47ff-ac4d-c88e29efb985",
    "punishing-gray-raven": "4ad3675b-42a4-49a7-af2f-3eabe8f17912",
    "zenless-zone-zero":    "5fec621e-5f30-49b5-881b-07fb81bf3943",
}

attr_created = attr_skipped = 0

def add_attr(game_slug, attr_type, key, name, color, sort_order=0):
    global attr_created, attr_skipped
    r = requests.post(f"{BASE}/api/v1/games/{game_slug}/attributes", headers=H, json={
        "attr_type": attr_type, "key": key, "name": name,
        "color": color, "sort_order": sort_order,
    })
    d = r.json()
    if d.get("success"):
        attr_created += 1
    elif "already exists" in str(d.get("message", "")):
        attr_skipped += 1
    else:
        print(f"  ATTR ERR {game_slug}/{attr_type}/{key}: {d.get('message')}")

def bulk(game_slug, section_key, schema_key, rows):
    items = [{"game_id": GAMES[game_slug], "section_id": ENEMY_SECTIONS[section_key],
               "type_schema_id": ENEMY_SCHEMAS[schema_key], "slug": "", "data": d} for d in rows]
    for i in range(0, len(items), 200):
        chunk = items[i:i+200]
        r = requests.post(f"{BASE}/api/v1/items/bulk-import", headers=H, json=chunk)
        d = r.json()
        if d.get("success"):
            res = d["data"]
            print(f"  {game_slug} enemies: created={res['created']} skipped={res['skipped']} errors={len(res['errors'])}")
        else:
            print(f"  {game_slug} enemies FAILED: {d}")

# ═══════════════════════════════════════════════════════════════════════════
# 1. MISSING RARITY ATTRIBUTES
# ═══════════════════════════════════════════════════════════════════════════
print("=== Adding missing rarity attributes ===")
for game in ["genshin-impact", "honkai-star-rail", "wuthering-waves"]:
    add_attr(game, "rarity", "5", "5 Stars", "#FFB300", 0)
    add_attr(game, "rarity", "4", "4 Stars", "#AB47BC", 1)

# ═══════════════════════════════════════════════════════════════════════════
# 2. ENEMIES
# ═══════════════════════════════════════════════════════════════════════════
print("\n=== Enemies ===")

# ── Genshin Impact ──────────────────────────────────────────────────────────
bulk("genshin-impact", "genshin-impact", "genshin-impact", [
    {"name": "Pyro Hypostasis", "enemy_type": "Hypostasis", "element": "Pyro", "drop": "Smoldering Pearl", "description": "A Hypostasis formed entirely of Pyro energy. Its core is protected by Pyro constructs that must be destroyed when it opens."},
    {"name": "Hydro Hypostasis", "enemy_type": "Hypostasis", "element": "Hydro", "drop": "Dew of Repudiation", "description": "A Hypostasis formed of concentrated Hydro energy. It submerges itself in water and attacks with liquid constructs."},
    {"name": "Cryo Hypostasis", "enemy_type": "Hypostasis", "element": "Cryo", "drop": "Crystalline Bloom", "description": "A Hypostasis of pure Cryo energy that encases itself in ice and launches freezing attacks."},
    {"name": "Electro Hypostasis", "enemy_type": "Hypostasis", "element": "Electro", "drop": "Lightning Prism", "description": "A geometric Electro Hypostasis that transforms into various shapes to attack. One of the earlier elite bosses."},
    {"name": "Anemo Hypostasis", "enemy_type": "Hypostasis", "element": "Anemo", "drop": "Hurricane Seed", "description": "An Anemo Hypostasis that levitates and attacks with powerful gusts. Requires Anemo attacks to break its shield."},
    {"name": "Geo Hypostasis", "enemy_type": "Hypostasis", "element": "Geo", "drop": "Basalt Pillar", "description": "A Geo Hypostasis that erects three pillars for protection. They must be destroyed to expose its core."},
    {"name": "Dendro Hypostasis", "enemy_type": "Hypostasis", "element": "Dendro", "drop": "Quelled Creeper", "description": "A Hypostasis of Dendro energy found in Sumeru. It uses vines and spores to attack and heal itself."},
    {"name": "Cryo Regisvine", "enemy_type": "Regisvine", "element": "Cryo", "drop": "Hoarfrost Core", "description": "A massive ice plant boss that must have its corolla and base attacked to stun it. It revives repeatedly."},
    {"name": "Pyro Regisvine", "enemy_type": "Regisvine", "element": "Pyro", "drop": "Everflame Seed", "description": "A towering fire plant in Mondstadt that attacks with flame petals and must be stunned by hitting its weak points."},
    {"name": "Primo Geovishap", "enemy_type": "Vishap", "element": "Geo", "drop": "Juvenile Jade", "description": "An ancient Geo dragon that absorbs an element from the active party and uses it against them."},
    {"name": "Stormterror Dvalin", "enemy_type": "Boss", "element": "Anemo", "drop": "Dvalin's Claw, Dvalin's Plume, Dvalin's Sigh", "description": "The Dragon of the East and one of the Four Winds of Mondstadt. A story boss that must be freed from Abyss corruption."},
    {"name": "Tartaglia (Childe)", "enemy_type": "Boss", "element": "Hydro", "drop": "Shadow of the Warrior", "description": "The Eleventh of the Fatui Harbingers. He fights in three phases: bow, melee, and a powerful Hydro Foul Legacy form."},
    {"name": "Azhdaha", "enemy_type": "Boss", "element": "Geo", "drop": "Dragon Lord's Crown, Bloodjade Branch, Gilded Scale", "description": "An ancient dragon sealed beneath Liyue who has lost his memories. He absorbs elemental energy to power his attacks."},
    {"name": "Raiden Shogun (Boss)", "enemy_type": "Boss", "element": "Electro", "drop": "Molten Moment", "description": "The Shogun's puppet fights the Traveler with relentless Electro attacks, including a devastating Musou Isshin phase."},
    {"name": "Signora", "enemy_type": "Boss", "element": "Cryo", "drop": "Hellfire Butterfly, Molten Moment", "description": "The Eighth Fatui Harbinger who fights in two phases: Cryo and Pyro, representing her past and present selves."},
    {"name": "Maguu Kenki", "enemy_type": "Mechanical", "element": "Anemo", "drop": "Marionette Core", "description": "A mechanical training dummy gone rogue. It wields both a sword and a spear, using Anemo and Cryo techniques."},
    {"name": "Ruin Guard", "enemy_type": "Ruin Machine", "element": "Physical", "drop": "Chaos Device", "description": "An ancient combat automaton found throughout Teyvat. It overheats after a burst attack, exposing its core."},
    {"name": "Rifthound", "enemy_type": "Rifthound", "element": "Electro", "drop": "Riftborn Regalia", "description": "Wolf-like creatures from the Abyss that afflict the Traveler with Corrosion, draining the whole party's HP."},
    {"name": "Thunderhelm Lawachurl", "enemy_type": "Hilichurl", "element": "Electro", "drop": "Damaged Mask, Stained Mask, Ominous Mask", "description": "The most powerful type of Lawachurl, clad in an Electro-charged stone helm that supercharges its attacks."},
    {"name": "Fatui Mirror Maiden", "enemy_type": "Fatui", "element": "Hydro", "drop": "Recruit's Insignia", "description": "A female Fatui agent who uses mirrors and Hydro energy to trap and attack her targets."},
])

# ── Honkai: Star Rail ────────────────────────────────────────────────────────
bulk("honkai-star-rail", "honkai-star-rail", "honkai-star-rail", [
    {"name": "Cocolia, Mother of Deception", "enemy_type": "Boss", "element": "Ice", "description": "The Supreme Guardian of Belobog who was corrupted by the Stellaron. She fights by summoning ice storms and barriers."},
    {"name": "Kafka (Boss)", "enemy_type": "Boss", "element": "Lightning", "description": "A Stellaron Hunter who fights using powerful Lightning DoT. Defeating her advances the main storyline."},
    {"name": "Phantom: Imbibitor Lunae", "enemy_type": "Boss", "element": "Imaginary", "description": "An Imaginary phantasm of Dan Heng's past identity. It uses powerful Imaginary attacks and reality-warping techniques."},
    {"name": "Abundant Ebon Deer", "enemy_type": "Boss", "element": "Physical", "description": "A massive deer-like creature found in the Simulated Universe. It charges repeatedly and deals massive Physical damage."},
    {"name": "Stagnant Shadow: Shape of Blaze", "enemy_type": "Stagnant Shadow", "element": "Fire", "description": "A Stagnant Shadow boss that drops Fire character ascension materials. It uses eruption attacks."},
    {"name": "Stagnant Shadow: Shape of Icicle", "enemy_type": "Stagnant Shadow", "element": "Ice", "description": "An Ice-element Stagnant Shadow that drops ascension materials for Ice characters."},
    {"name": "Stagnant Shadow: Shape of Abomination", "enemy_type": "Stagnant Shadow", "element": "Quantum", "description": "A Quantum-element Stagnant Shadow dropping materials for Quantum characters like Seele and Silver Wolf."},
    {"name": "Voidranger: Trampler", "enemy_type": "Voidranger", "element": "Physical", "description": "A hulking Voidranger that charges at targets and has high Physical resistance. Common in later-game content."},
    {"name": "Imaginary Weaver", "enemy_type": "Swarm", "element": "Imaginary", "description": "A swarm creature from the Swarm Disaster universe. It deals Imaginary damage and can distort action order."},
    {"name": "Aurumaton Gatekeeper", "enemy_type": "Automaton", "element": "Lightning", "description": "A mechanical guardian automaton found in Xianzhou Luofu that uses Lightning-based gating mechanics."},
    {"name": "Frigid Prowler", "enemy_type": "Wildlife", "element": "Ice", "description": "An Ice-type enemy found in cold regions. It buffs nearby allies and enrages when allies are defeated."},
    {"name": "Shock Egg (Lightning-Proof Mushroom)", "enemy_type": "Nature", "element": "Lightning", "description": "A mushroom-like creature that absorbs Lightning attacks and uses them to power devastating counterattacks."},
    {"name": "Decaying Shadow", "enemy_type": "Abomination", "element": "Wind", "description": "A Wind-element shadow creature that splits into multiple copies when damaged, requiring AoE attacks to clear."},
    {"name": "Svarog (Boss)", "enemy_type": "Boss", "element": "Lightning", "description": "The mechanical guardian created to protect Clara. He fights with massive drill arms and powerful Lightning blasts."},
    {"name": "Mara-Struck Soldier", "enemy_type": "Human", "element": "Physical", "description": "A Xianzhou soldier driven mad by Mara. They deal Physical damage and regenerate HP if not killed quickly."},
])

# ── Wuthering Waves ──────────────────────────────────────────────────────────
bulk("wuthering-waves", "wuthering-waves", "wuthering-waves", [
    {"name": "Crownless", "enemy_type": "Tacet Discords", "element": "Havoc", "description": "A powerful Tacet Discord boss that uses rapid Havoc strikes. Its Echo is highly sought after by Havoc resonators."},
    {"name": "Mech Abomination", "enemy_type": "Construct", "element": "Fusion", "description": "A massive mechanical boss that deals devastating Fusion damage with missiles and laser arrays."},
    {"name": "Thundering Mephis", "enemy_type": "Tacet Discords", "element": "Electro", "description": "A boss Tacet Discord that channels Electro energy. Its echo is used by Electro resonators for their builds."},
    {"name": "Inferno Rider", "enemy_type": "Tacet Discords", "element": "Fusion", "description": "A fiery boss Tacet Discord that rides flames into battle. Its echo can be used by Changli and other Fusion DPS."},
    {"name": "Impermanence Heron", "enemy_type": "Tacet Discords", "element": "Havoc", "description": "An elegant but deadly Havoc bird Tacet Discord. Its echo provides powerful off-field Havoc damage."},
    {"name": "Bell-Borne Geochelone", "enemy_type": "Tacet Discords", "element": "Glacio", "description": "A turtle-like boss Tacet Discord covered in crystalline Glacio armor. It provides team-wide shields when its echo is used."},
    {"name": "Jué (Sentinel)", "enemy_type": "Sentinel", "element": "Spectro", "description": "The ancient dragon Sentinel of Jinzhou, an overwhelmingly powerful Spectro boss tied to the main story."},
    {"name": "Dreamless", "enemy_type": "Tacet Discords", "element": "Havoc", "description": "A shadowy Havoc Tacet Discord that mirrors the Traveler's attacks. Its echo is invaluable for Havoc builds."},
    {"name": "Fallacy of No Return", "enemy_type": "Tacet Discords", "element": "Spectro", "description": "A ghostly Spectro boss that phases in and out of reality, attacking with spectral clones."},
    {"name": "Mourning Aix", "enemy_type": "Tacet Discords", "element": "Aero", "description": "A winged Aero Tacet Discord that creates massive wind vortexes. Its echo supports Aero resonators."},
    {"name": "Sabyr Boar", "enemy_type": "Wildlife", "element": "Physical", "description": "A common enemy found throughout Solaris-3. It charges at targets and can be used to collect resources."},
    {"name": "Electro Cacti", "enemy_type": "Flora", "element": "Electro", "description": "Electro-infused cacti that launch electric needles. They are stationary but have a wide attack radius."},
    {"name": "Tactics Squad: Suppressor", "enemy_type": "Human", "element": "Physical", "description": "Armed human enemies from the Tactics Squad. They coordinate with other enemies and use suppressing fire."},
    {"name": "Fusion Prism", "enemy_type": "Construct", "element": "Fusion", "description": "A floating Fusion-element construct that fires concentrated beams. Destroying its arms disables its main cannon."},
    {"name": "Havoc Prism", "enemy_type": "Construct", "element": "Havoc", "description": "A Havoc-infused prism construct that spreads darkness around itself, dealing area-of-effect Havoc damage."},
])

# ── NIKKE ────────────────────────────────────────────────────────────────────
bulk("nikke", "nikke", "nikke", [
    {"name": "Grunt Rapture", "enemy_type": "Rapture", "description": "The most common type of Rapture encountered on the surface. They appear in large numbers and are easily dispatched by a well-trained NIKKE."},
    {"name": "Shield Rapture", "enemy_type": "Rapture", "description": "A defensive Rapture that protects itself and allies with a deployable energy shield. The shield must be destroyed first."},
    {"name": "Sniper Rapture", "enemy_type": "Rapture", "description": "A long-range Rapture equipped with a high-caliber rifle. It targets the rearmost NIKKE to bypass defensive formations."},
    {"name": "Blitzkrieg Rapture", "enemy_type": "Rapture", "description": "A fast-moving Rapture that rushes the squad's position. It has low defense but deals high burst damage on contact."},
    {"name": "Destroyer", "enemy_type": "Rapture", "description": "A heavily armored Rapture with immense firepower. It requires focused fire on its weak points to defeat efficiently."},
    {"name": "Missile Rapture", "enemy_type": "Rapture", "description": "A support-type Rapture that launches salvos of missiles from a distance. Its launcher must be targeted directly."},
    {"name": "Stalker", "enemy_type": "Rapture", "description": "A stealth-capable Rapture that cloaks itself and ambushes NIKKEs. It can only be targeted when it de-cloaks to attack."},
    {"name": "Juggernaut", "enemy_type": "Boss Rapture", "description": "A massive boss-tier Rapture with overwhelming armor plating. It is one of the most fearsome frontline enemies humanity faces."},
    {"name": "Modernia (Rapture Form)", "enemy_type": "Pilgrim Boss", "description": "Modernia's true Rapture form is an overwhelming force that decimates entire squads. She is the commander of the Rapture invasion."},
    {"name": "Alice (Corrupted)", "enemy_type": "Corrupted Nikke", "description": "A Nikke who has turned against humanity. Encountering a corrupted NIKKE is rare but devastating, as they retain all their combat capabilities."},
    {"name": "Gravedigger", "enemy_type": "Boss Rapture", "description": "A colossal subterranean Rapture that burrows beneath the battlefield. It surfaces unexpectedly to swallow NIKKEs whole."},
    {"name": "Chatterbox", "enemy_type": "Boss Rapture", "description": "A deceptively small Rapture boss that splits into multiple copies and overwhelms NIKKEs with sheer numbers."},
])

# ── Arknights ────────────────────────────────────────────────────────────────
bulk("arknights", "arknights", "arknights", [
    {"name": "Originium Slug", "enemy_type": "Infected Wildlife", "attack_type": "Physical", "description": "A slug-like creature infected with Originium. It moves slowly but explodes on death, dealing area damage."},
    {"name": "Infested Originium Slug", "enemy_type": "Infected Wildlife", "attack_type": "Physical", "description": "A larger, more dangerous variant of the Originium Slug that releases multiple smaller slugs when defeated."},
    {"name": "Possessed Soldier", "enemy_type": "Infected Human", "attack_type": "Physical", "description": "A Reunion member who has given themselves fully to Originium infection. They have enhanced strength at the cost of sanity."},
    {"name": "Catastrophe Messenger", "enemy_type": "Reunion", "attack_type": "Arts", "description": "A Reunion Arts user who launches long-range Originium projectiles. They must be blocked or sniped quickly."},
    {"name": "Heavy Defender", "enemy_type": "Infected Human", "attack_type": "Physical", "description": "A heavily armored Reunion soldier with very high DEF. Arts damage is far more effective than physical damage."},
    {"name": "Sarkaz Lancer", "enemy_type": "Sarkaz", "attack_type": "Physical", "description": "A Sarkaz warrior armed with a spear who can attack from one tile away. They often appear in groups."},
    {"name": "Withered Knight", "enemy_type": "Undead", "attack_type": "Physical", "description": "An undead knight from the ruins of an ancient civilization. It revives once after being defeated."},
    {"name": "Possessed Caster", "enemy_type": "Infected Human", "attack_type": "Arts", "description": "An Originium-infected Arts user who launches ranged Arts attacks. They prioritize operators with ranged placement."},
    {"name": "Logistics Drone", "enemy_type": "Drone", "attack_type": "Arts", "description": "A flying drone that deals Arts damage and bypasses ground-based blocks. Anti-air operators are required."},
    {"name": "Invisible Caster", "enemy_type": "Elite", "attack_type": "Arts", "description": "An elite enemy that turns invisible periodically, making it immune to attacks. Only revealed by certain operators or tiles."},
    {"name": "Flamebringer", "enemy_type": "Boss", "attack_type": "Physical", "description": "The terrifying enforcer of Reunion. He wields dual blades and charges through defenses, dealing massive damage."},
    {"name": "Patriot", "enemy_type": "Boss", "attack_type": "Physical", "description": "The unstoppable general of Reunion. He is coated in Originium armor and fires devastating artillery from his arm cannon."},
    {"name": "Mudrock (Enemy)", "enemy_type": "Boss", "attack_type": "Arts", "description": "Before joining Rhodes Island, Mudrock was encountered as an immovable boss, blocking entire lanes with her Originium shields."},
    {"name": "Skadi (Corrupted)", "enemy_type": "Boss", "attack_type": "Physical", "description": "The corrupted form of Skadi consumed by her Abyssal nature. She appears as an overwhelming boss in Under Tides events."},
    {"name": "Hoederer", "enemy_type": "Elite", "attack_type": "Physical", "description": "A highly skilled Sarkaz mercenary who serves as an elite enemy before joining Rhodes Island as an operator."},
])

# ── Blue Archive ─────────────────────────────────────────────────────────────
bulk("blue-archive", "blue-archive", "blue-archive", [
    {"name": "Hovercraft Drone", "enemy_type": "Mechanical", "armor_type": "Heavy", "description": "Autonomous patrol drones deployed by various Kivotos factions. They have high HP but slow movement speed."},
    {"name": "POM Squad Grunt", "enemy_type": "Student", "armor_type": "Light", "description": "Low-ranked members of the Problem Solver 68, Gehenna's delinquent club. They fight with reckless abandon."},
    {"name": "FIN Cultist", "enemy_type": "Cultist", "armor_type": "Special", "description": "A member of the FIN cult who worships and seeks to awaken the ancient Plana lurking beneath Kivotos."},
    {"name": "Hieronymus Disciple", "enemy_type": "Cultist", "armor_type": "Special", "description": "An armored cultist serving the Hieronymus faction, wielding powered exosuits that boost their combat effectiveness."},
    {"name": "Cleanup Committee Officer", "enemy_type": "Student", "armor_type": "Heavy", "description": "An officer from Millennium's Cleanup Committee. They enforce order with riot shields and heavy equipment."},
    {"name": "SCHALE Security Drone", "enemy_type": "Mechanical", "armor_type": "Heavy", "description": "Security drones deployed within SCHALE facilities. They have high armor but limited maneuverability."},
    {"name": "Plana (Kagari)", "enemy_type": "Plana", "armor_type": "Elastic", "description": "An ancient Plana deity in the form of Kagari. One of the most powerful enemies in the game, fought during the main story."},
    {"name": "Hieronymus (Boss)", "enemy_type": "Boss", "armor_type": "Special", "description": "The mysterious villain behind the FIN cult's schemes. He wields reality-warping powers granted by the Plana."},
    {"name": "Peroro Mech", "enemy_type": "Mechanical", "armor_type": "Heavy", "description": "A giant robotic Peroro (the Kivotos mascot) that has been weaponized. It appears in limited event content."},
    {"name": "Gehenna Delinquent", "enemy_type": "Student", "armor_type": "Light", "description": "Standard Gehenna troublemakers encountered in story missions. They have low stats but appear in large groups."},
    {"name": "Arius Squad Member", "enemy_type": "Student", "armor_type": "Light", "description": "Elite members of the Arius Squad, a powerful faction that serves as antagonists in the Millennium chapter."},
    {"name": "Kurokage", "enemy_type": "Ninja", "armor_type": "Light", "description": "Shadow operatives trained by Hyakkiyako. They use stealth and precision attacks to eliminate targets."},
])

# ── Punishing: Gray Raven ────────────────────────────────────────────────────
bulk("punishing-gray-raven", "punishing-gray-raven", "punishing-gray-raven", [
    {"name": "Corrupted (Standard)", "enemy_type": "Corrupted", "element": "Physical", "description": "Standard-tier infected humans driven mad by the Punishing Virus. They attack in swarms and are easily dispatched by constructs."},
    {"name": "Infected: Berserker", "enemy_type": "Corrupted", "element": "Physical", "description": "A large, muscular Corrupted variant that trades speed for devastating melee power. They charge relentlessly at constructs."},
    {"name": "Infected: Shielder", "enemy_type": "Corrupted", "element": "Physical", "description": "A defensive Corrupted variant wielding a reinforced shield. The shield must be bypassed with combo attacks or dodge skills."},
    {"name": "Mechanical Watcher", "enemy_type": "Machine", "element": "Thunder", "description": "An automated security drone that patrols restricted areas. It fires precise Thunder blasts and calls reinforcements when damaged."},
    {"name": "Kamui (Black): Ablaze", "enemy_type": "Corrupted Construct", "element": "Dark", "description": "The corrupted form of Kamui, consumed entirely by the virus. He is one of the most powerful boss enemies in the game."},
    {"name": "Lucia: Bloom (Enemy)", "enemy_type": "Corrupted Construct", "element": "Ice", "description": "A corrupted version of Lucia encountered as a boss. She represents the constant threat of virus infection for all constructs."},
    {"name": "Watcher Alpha", "enemy_type": "Elite Machine", "element": "Ice", "description": "An upgraded Watcher with enhanced Ice weaponry. It deploys cryo traps and area-denial ice walls."},
    {"name": "Prototype: War Chariot", "enemy_type": "Heavy Machine", "element": "Fire", "description": "A massive experimental war machine infected by the Punishing Virus. It uses heavy artillery and firestorm weapons."},
    {"name": "Blade Spawn", "enemy_type": "Corrupted", "element": "Dark", "description": "A fast, blade-armed Corrupted variant that dashes rapidly between targets. Requires quick dodges and counter-attacks."},
    {"name": "Wanderer: Vagrant", "enemy_type": "Wanderer", "element": "Physical", "description": "A lightly armored Wanderer (former human soldier) who chose the battlefield over evacuating. They retain tactical combat skills."},
    {"name": "Alpha Gorge Worm", "enemy_type": "Wildlife", "element": "Physical", "description": "A massive worm-like creature mutated by Originium exposure (PGR equivalent). It burrows underground to ambush constructs."},
    {"name": "Corrupted: Neural Disruptor", "enemy_type": "Elite Corrupted", "element": "Thunder", "description": "An elite Corrupted variant with a Thunder-based neural device that disrupts construct control systems, reducing their effectiveness."},
])

# ── Zenless Zone Zero ────────────────────────────────────────────────────────
bulk("zenless-zone-zero", "zenless-zone-zero", "zenless-zone-zero", [
    {"name": "Corrupted Goblin", "enemy_type": "Hollow Entity", "element": "Physical", "description": "Small humanoid Ethereal creatures common in most Hollows. They swarm in groups and can be quickly dispatched."},
    {"name": "Inferno Goblin", "enemy_type": "Hollow Entity", "element": "Fire", "description": "A fire-type Goblin that self-destructs on defeat, dealing area Fire damage. Keep your distance when eliminating them."},
    {"name": "Thunder Goblin", "enemy_type": "Hollow Entity", "element": "Electric", "description": "An Electric-type Goblin that calls lightning strikes on its target's position. It telegraphs its attacks clearly."},
    {"name": "Nightmare Phaethon", "enemy_type": "Nightmare", "element": "Fire", "description": "A powerful Nightmare-tier Hollow entity that commands Inferno-type subordinates and uses wide-area Fire attacks."},
    {"name": "Metal Rust Crab", "enemy_type": "Hollow Entity", "element": "Physical", "description": "A crab-like Hollow creature with extremely high Physical defense. Its soft underbelly is exposed when it attacks."},
    {"name": "Hollow Special: Override", "enemy_type": "Hollow Soldier", "element": "Electric", "description": "A soldier-type Hollow entity equipped with Electric weaponry. It coordinates with other Hollow soldiers in combat."},
    {"name": "Phantom: Pompey", "enemy_type": "Phantom", "element": "Physical", "description": "A phantom recreated within the Hollow, based on a powerful figure from New Eridu's past. It fights with extreme precision."},
    {"name": "Ethereal: Blaze Wing", "enemy_type": "Ethereal", "element": "Fire", "description": "A large winged Ethereal creature that swoops across the battlefield dealing Fire damage to everyone in its path."},
    {"name": "Corrupt Judge", "enemy_type": "Corrupt", "element": "Ether", "description": "An Ether-type Corrupt entity that uses reality-warping abilities to confuse and disorient agents in the Hollow."},
    {"name": "Resurgence Faction Soldier", "enemy_type": "Human", "element": "Physical", "description": "A member of the anti-establishment Resurgence Faction who fights Hollow Hunters and the authorities of New Eridu."},
    {"name": "Soldier 11 (Rogue)", "enemy_type": "Rogue Agent", "element": "Fire", "description": "A rogue version of Soldier 11 encountered in a specific Hollow scenario. She uses her full combat capabilities against the player."},
    {"name": "Notorious: Pompey (Boss)", "enemy_type": "Boss", "element": "Physical", "description": "The fully realized Notorious boss version of Pompey. He is one of the game's major story bosses with multiple dangerous phases."},
    {"name": "Ethereal: Ice Spike", "enemy_type": "Ethereal", "element": "Ice", "description": "A crystalline Hollow creature that projects Ice spikes across the arena, creating hazardous zones that restrict movement."},
    {"name": "Hollow Butcher", "enemy_type": "Elite Hollow", "element": "Physical", "description": "A large melee Hollow entity with a massive cleaver. It deals enormous burst damage and must be dodged or parried precisely."},
])

print(f"\nRarity attrs: created={attr_created} skipped={attr_skipped}")
print("Done!")
