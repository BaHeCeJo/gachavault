# GachaVault — Feature Checklist

Legend: ✅ Done · ⚠️ Partial · ❌ Not done · 💡 Extra idea

---

## Authentication

| Status | Feature | Notes |
|--------|---------|-------|
| ✅ | Register with email + password | |
| ✅ | Login / logout | |
| ✅ | JWT access tokens (15 min) + refresh tokens (7 days) | |
| ✅ | Email verification on register | Emails sent via Mailhog in dev |
| ✅ | Forgot password / reset password | |
| ⚠️ | Google OAuth | Backend skeleton exists, needs Google Console credentials |
| ✅ | Profile page | Avatar upload, email verified status, provider shown |
| ✅ | Avatar upload | Stored in media-service |
| ✅ | Change username | PATCH /api/v1/auth/me/username + profile page UI |
| ✅ | Change password (while logged in) | POST /api/v1/auth/me/password + profile page UI |
| ✅ | Delete account | DELETE /api/v1/auth/me + profile page UI |

---

## Role System

| Status | Feature | Notes |
|--------|---------|-------|
| ✅ | Superadmin role | Full access to everything |
| ✅ | Admin role | Can manage games, items, sections |
| ✅ | Editor role | Can add/edit items and skills |
| ✅ | User role | Default — can use collections and tier lists |
| ✅ | Per-game roles | Backend enforcement in items-service + admin UI at /admin/users/[id] |
| ✅ | Per-section roles | Backend enforcement in items-service + admin UI at /admin/users/[id] |
| ❌ | Contributor role | Planned: submit items for review, not live yet |
| ❌ | Review/approval queue | Contributors submit → admin approves before publishing |
| ✅ | Admin panel → user management | Search users, change roles via dropdown |

---

## Games

| Status | Feature | Notes |
|--------|---------|-------|
| ✅ | Create game (slug, name, description, logo, banner) | Via admin panel or API |
| ✅ | List all active games | Public, no login needed |
| ✅ | Game detail page | Banner, sections tabs, items grid, community tier lists |
| ✅ | Sections (tabs inside a game) | Characters, Weapons, etc. — ordered |
| ✅ | Item type schemas | Define fields per section (name, rarity, element…) |
| ✅ | Edit / delete game | Admin panel modal + confirm dialog |
| ✅ | Game-level i18n | API endpoints + admin UI at /admin/games/[slug]/translations |
| ✅ | Featured/pinned games on home page | Home page loads and displays up to 8 games |

---

## Items (wiki content)

| Status | Feature | Notes |
|--------|---------|-------|
| ✅ | Create item (any game, any section) | Via admin panel with JSON data editor |
| ✅ | Edit item | Via admin panel |
| ✅ | Delete item | Via admin panel |
| ✅ | Item detail page | Image, name, rarity, element, role, description |
| ✅ | Skills tab | List skills/abilities, admin can add inline |
| ✅ | Builds tab | Community builds (raw JSON for now) |
| ✅ | Changelog tab | Version history with patch name and date |
| ✅ | Search indexing | Auto-indexed in Meilisearch on create/update |
| ✅ | Item data entry | Schema-driven form with per-field inputs; raw JSON toggle for power users |
| ❌ | Item lore/story section | Planned but no field or UI |
| ✅ | Item-level i18n | API endpoints; translated fields merged over item.data at GET time |
| ✅ | Image upload on item create | Upload widget in item form — injects URL into JSON |
| ✅ | Bulk import | JSON file upload at /admin/items/import — preview, import, error report |
| ❌ | Item version history / diffs | `version` counter exists in DB, no history viewer |
| ❌ | Related items | No "similar characters" or "works well with" links |

---

## Search

| Status | Feature | Notes |
|--------|---------|-------|
| ✅ | Full-text search across all games | Powered by Meilisearch (typo-tolerant) |
| ✅ | Search page at /search | |
| ✅ | Home page search bar | Redirects to /search |
| ✅ | Filter by game | Dropdown on search page, persisted in URL |
| ✅ | Filter by section | Dropdown on search page (loads sections for selected game) |
| ❌ | Faceted filtering | e.g. "show only 5★ Pyro characters" |
| ❌ | Sort results | By rarity, name, release date, etc. |

---

## Collections

| Status | Feature | Notes |
|--------|---------|-------|
| ✅ | Track owned items per game | Toggle on item detail page |
| ✅ | Collection page | Browse owned items per game |
| ✅ | Level / ascension / constellation tracking | Edit modal on collection page |
| ✅ | Collection statistics | Overall completion % bar + per-section breakdown |
| ❌ | Public collection profiles | Share your collection with others |
| ❌ | Import from game (e.g. Enka.network for Genshin) | Would need game-specific integration |

---

## Tier Lists

| Status | Feature | Notes |
|--------|---------|-------|
| ✅ | Create tier list | Pick game, title, public/private |
| ✅ | Edit tier list | Drag items into S/A/B/C/D tiers |
| ✅ | Delete tier list | |
| ✅ | Public / private toggle | |
| ✅ | Shareable link | /tierlists/share/[slug] — no login needed to view |
| ✅ | Community tier lists on game page | Shows top 6 public lists |
| ✅ | Custom tier names | Stored as JSONB per tier list; editable inline in editor |
| ✅ | Custom tier colors | Color picker per tier; inline styles applied everywhere |
| ✅ | Filter tier list by section | Optional section_id on tier list; editor loads only that section's items |
| ✅ | Upvote / like tier lists | Backend + UI on share page |
| ✅ | Comments on tier lists | Backend + UI on share page |

---

## Media / Images

| Status | Feature | Notes |
|--------|---------|-------|
| ✅ | File upload endpoint | POST /api/v1/media/upload |
| ✅ | Avatar upload on profile page | |
| ✅ | Files served publicly | Via media-service at /uploads/* |
| ✅ | Files stored in Docker volume | Persists across restarts |
| ✅ | Image upload widget in item form | ImageUploadField component, injects into JSON |
| ✅ | Image upload widget in game/section forms | ImageUploadField on logo + banner fields |
| ❌ | Cloudflare R2 storage backend | Local disk for now, swap later |
| ❌ | Image resizing / optimization | No thumbnail generation |

---

## Admin Panel

| Status | Feature | Notes |
|--------|---------|-------|
| ✅ | Admin home | Links to Games, Items, Users |
| ✅ | Manage games | Create game, view list |
| ✅ | Manage sections | Add sections to a game |
| ✅ | Manage schemas | Define item fields per section |
| ✅ | Manage items | Create, edit, delete items with JSON editor |
| ✅ | Manage users | List all users, change roles |
| ✅ | Edit game details | Admin panel edit modal |
| ✅ | Delete game | Admin panel delete with confirmation |
| ✅ | Edit / delete sections | Admin panel — rename, reorder, delete |
| ✅ | Edit / delete schemas | Admin panel — rename, edit fields JSON, delete |
| ✅ | Item form generated from schema | Auto-generates inputs from schema fields; image handled separately |
| ✅ | Media library | Grid view at /admin/media — preview, view, delete |
| ✅ | Site statistics | Accurate counts for users, games, sections, items, tier lists, collectors |

---

## Infrastructure / Deployment

| Status | Feature | Notes |
|--------|---------|-------|
| ✅ | Docker Compose (dev) | All 14 containers, one command |
| ✅ | Docker Compose (prod) | Internal network, no exposed DB ports |
| ✅ | Nginx reverse proxy config | HTTP→HTTPS redirect, rate limiting |
| ✅ | Let's Encrypt SSL | Auto-renewing via certbot container |
| ✅ | GitHub Actions CI | Rust lint + build, Next.js build |
| ✅ | GitHub Actions deploy | Build images → GHCR → SSH deploy |
| ✅ | VPS setup script | Ubuntu 24.04, Docker, UFW firewall |
| ✅ | Production secrets generated | .env.prod ready to copy to server |
| ✅ | Sequential build script | Avoids RAM exhaustion on Windows |
| ✅ | WSL2 memory cap | .wslconfig — 6GB limit |
| ✅ | Database backups | db-backup container runs daily pg_dump → db_backups volume, 7-day retention (14d prod) |
| ❌ | Monitoring / alerting | No uptime checks, no error alerts |
| ❌ | Log aggregation | Logs go to stdout only |

---

## i18n (Internationalization)

| Status | Feature | Notes |
|--------|---------|-------|
| ✅ | next-intl wired up | getRequestConfig, messages loaded |
| ✅ | English strings | All UI text in en.json |
| ✅ | French (or other) translation | fr.json fully translated |
| ✅ | Language switcher UI | LanguageSwitcher component in Navbar; sets locale cookie |
| ✅ | Content translations | Admin UI for games + API for items; locale param on public GET endpoints |

---

## Extra ideas (not planned, could be added)

| Idea | What it would do |
|------|-----------------|
| 💡 Team builder | Input your owned characters → AI/algorithm suggests best team (you already have a Rust simulated annealing algo for this) |
| 💡 Public API with API keys | Let third-party sites query your wiki data |
| 💡 Patch notes page | Global timeline of all changelogs across all games |
| 💡 Character comparison | Side-by-side stat comparison of 2–4 items |
| 💡 Resin/stamina tracker | Game-specific daily resource calculator |
| 💡 Banner/pull history tracker | Log your gacha pulls, track pity |
| 💡 Discord bot | Query the wiki from Discord with slash commands |
| 💡 Mobile app | React Native or PWA wrapper |
| 💡 Comments on item pages | Community discussion per character/weapon |
| 💡 Notifications | Email/push when a character you own gets a buff/nerf |
| 💡 Wiki edit history | See who changed what and when, revert changes |
| 💡 Contributor leaderboard | Gamify wiki contributions |
