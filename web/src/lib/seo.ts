// Server-only helpers used by route `generateMetadata` and `sitemap`.
// Uses the Next.js native fetch (with built-in caching) rather than the
// axios client in `api.ts`, because that one is wired for browser cookies.

import { type PageLayout, parsePageLayout } from "@/lib/pageLayout";

const API_BASE =
  process.env.INTERNAL_API_URL ??
  process.env.NEXT_PUBLIC_API_URL ??
  "http://localhost:3000";

export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://hotarumi.com";

type ApiEnvelope<T> = { success: boolean; data: T };

function withLocale(path: string, locale?: string): string {
  if (!locale) return path;
  const sep = path.includes("?") ? "&" : "?";
  return `${path}${sep}locale=${encodeURIComponent(locale)}`;
}

async function apiGet<T>(path: string, revalidate = 300): Promise<T | null> {
  try {
    const res = await fetch(`${API_BASE}/api/v1${path}`, {
      next: { revalidate },
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return null;
    const json = (await res.json()) as ApiEnvelope<T>;
    return json?.data ?? null;
  } catch {
    return null;
  }
}

export interface SeoGame {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  banner_url: string | null;
  logo_url: string | null;
}

export interface SeoItem {
  id: string;
  slug: string;
  game_id: string;
  game_slug?: string;
  section_id: string;
  section_slug?: string;
  type_schema_id: string | null;
  data: Record<string, unknown>;
}

export interface SeoTierList {
  id: string;
  title: string;
  share_slug: string;
  game_id: string;
  // The /tierlists/share/<slug> endpoint returns these too; the index list
  // endpoint only returns the basics, hence everything below is optional.
  upvote_count?: number;
  created_at?: string;
  tiers?: { key: string; name: string; color: string }[];
  entries?: { item_id: string; tier: string }[];
  user_upvoted?: boolean;
  is_public?: boolean;
}

export interface SharedTierListBundle {
  tierList: SeoTierList;
  items: SeoItem[];
}

export async function getSharedTierListBundle(slug: string): Promise<SharedTierListBundle | null> {
  const tierList = await getTierListByShareSlug(slug);
  if (!tierList) return null;
  const entryIds = new Set((tierList.entries ?? []).map((e) => e.item_id));
  // The shared tier list only needs items referenced by entries — fetching the
  // whole game can be hundreds of rows; just fetch the ones in the list.
  const items = await fetchItemsByIds(Array.from(entryIds));
  return { tierList, items };
}

async function fetchItemsByIds(ids: string[]): Promise<SeoItem[]> {
  if (ids.length === 0) return [];
  // Items service has no bulk-by-id endpoint, so issue parallel GETs.
  const settled = await Promise.allSettled(
    ids.map((id) => apiGet<SeoItem>(`/items/${encodeURIComponent(id)}`)),
  );
  return settled
    .map((r) => (r.status === "fulfilled" ? r.value : null))
    .filter((it): it is SeoItem => it !== null);
}

export interface SeoPublicUser {
  id: string;
  username: string;
  avatar_url: string | null;
  created_at: string;
}

export function getGame(slug: string, locale?: string) {
  return apiGet<SeoGame>(withLocale(`/games/${encodeURIComponent(slug)}`, locale));
}

export function getItemBySlugs(
  gameSlug: string,
  sectionSlug: string,
  itemSlug: string,
  locale?: string,
) {
  return apiGet<SeoItem>(
    withLocale(
      `/items/by-slug/${encodeURIComponent(gameSlug)}/${encodeURIComponent(sectionSlug)}/${encodeURIComponent(itemSlug)}`,
      locale,
    ),
  );
}

export interface SeoSection {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  display_order: number;
}

export interface SeoSchemaField {
  key: string;
  label: string;
  type: string;
  attribute_type?: string;
  item_section?: string;
  qty_range?: boolean;
  source_section?: string;
  source_field?: string;
  sources?: { source_section: string; source_field: string }[];
  options?: string[];
}

export interface SeoSchemaCardLayout {
  border_color_attr?: string | null;
  badge_top_left?: string | null;
  badge_top_right?: string | null;
  watermark_attr?: string | null;
  watermark_opacity?: number;
}

export interface SeoSchema {
  id: string;
  section_id: string | null;
  name: string;
  fields: SeoSchemaField[];
  filter_attrs: string[] | null;
  card_layout: SeoSchemaCardLayout | null;
  is_collectable?: boolean;
  // Raw per-section detail-page template (arbitrary JSON); parsed at the edge
  // by parsePageLayout. Absent/null/malformed → legacy fixed layout.
  page_layout?: unknown;
}

export interface SeoGameAttribute {
  id: string;
  attr_type: string;
  key: string;
  name: string;
  icon_url: string | null;
  color: string | null;
}

export function listSections(gameSlug: string) {
  return apiGet<SeoSection[]>(`/games/${encodeURIComponent(gameSlug)}/sections`);
}

export function listSchemas(gameSlug: string) {
  return apiGet<SeoSchema[]>(`/games/${encodeURIComponent(gameSlug)}/schemas`);
}

export function listAttributes(gameSlug: string) {
  return apiGet<SeoGameAttribute[]>(`/games/${encodeURIComponent(gameSlug)}/attributes`);
}

async function listItemsForGame(gameId: string): Promise<SeoItem[]> {
  const PAGE = 200;
  const all: SeoItem[] = [];
  let offset = 0;
  while (all.length < 100_000) {
    const page = await apiGet<SeoItem[]>(
      `/items?game_id=${encodeURIComponent(gameId)}&limit=${PAGE}&offset=${offset}`,
    );
    if (!page || page.length === 0) break;
    all.push(...page);
    if (page.length < PAGE) break;
    offset += PAGE;
  }
  return all;
}

export interface GamePageBundle {
  game: SeoGame;
  sections: SeoSection[];
  attributes: SeoGameAttribute[];
  schemas: SeoSchema[];
  initialSectionId: string | null;
  initialItems: SeoItem[];
  itemCountsBySection: Record<string, number>;
  totalItems: number;
  locale: string;
}

export async function getGamePageBundle(
  gameSlug: string,
  locale: string,
): Promise<GamePageBundle | null> {
  const [game, sections, attributes, schemas] = await Promise.all([
    getGame(gameSlug, locale),
    listSections(gameSlug),
    listAttributes(gameSlug),
    listSchemas(gameSlug),
  ]);
  if (!game) return null;
  const sortedSections = (sections ?? []).slice().sort((a, b) => a.display_order - b.display_order);
  const firstSection = sortedSections[0] ?? null;
  // One fetch for the whole game — gives us per-section counts for the
  // Overview tab and the initial Sections-tab items in a single pass.
  const allItems = await listItemsForGame(game.id);
  const itemCountsBySection: Record<string, number> = {};
  for (const item of allItems) {
    itemCountsBySection[item.section_id] = (itemCountsBySection[item.section_id] ?? 0) + 1;
  }
  const initialItems = firstSection
    ? allItems.filter((it) => it.section_id === firstSection.id)
    : [];
  return {
    game,
    sections: sortedSections,
    attributes: attributes ?? [],
    schemas: schemas ?? [],
    initialSectionId: firstSection?.id ?? null,
    initialItems,
    itemCountsBySection,
    totalItems: allItems.length,
    locale,
  };
}

export interface ItemPageBundle {
  item: SeoItem;
  game: SeoGame | null;
  fields: SeoSchemaField[];
  attributes: SeoGameAttribute[];
  sectionName: string;
  locale: string;
  // Parsed detail-page template, or null = render the legacy fixed layout.
  pageLayout: PageLayout | null;
}

export async function getItemPageBundle(
  gameSlug: string,
  sectionSlug: string,
  itemSlug: string,
  locale: string,
): Promise<ItemPageBundle | null> {
  const [item, game, sections, schemas, attributes] = await Promise.all([
    getItemBySlugs(gameSlug, sectionSlug, itemSlug, locale),
    getGame(gameSlug, locale),
    listSections(gameSlug),
    listSchemas(gameSlug),
    listAttributes(gameSlug),
  ]);
  if (!item) return null;
  const schema = schemas?.find((s) => s.id === item.type_schema_id);
  const fields = schema?.fields ?? [];
  const section = sections?.find((s) => s.id === item.section_id);
  return {
    item,
    game,
    fields,
    attributes: attributes ?? [],
    sectionName: section?.name ?? "",
    locale,
    pageLayout: parsePageLayout(schema?.page_layout),
  };
}

export function getTierListByShareSlug(slug: string) {
  return apiGet<SeoTierList>(`/tierlists/share/${encodeURIComponent(slug)}`);
}

export function getPublicUserByUsername(username: string) {
  return apiGet<SeoPublicUser>(`/users/by-username/${encodeURIComponent(username)}`);
}

/** Aggregate owned counts for a public profile. Returns counts only, and only
 *  when the user opted in — this page renders with no token, so it can't use
 *  the owner-gated /users/:id/collections. */
function getPublicCollectionStats(userId: string) {
  return apiGet<{
    is_public: boolean;
    total_owned: number;
    games: { game_id: string; owned_count: number }[];
  }>(`/users/${encodeURIComponent(userId)}/collection-stats`);
}

export interface UserGameStat {
  game: { id: string; slug: string; name: string };
  ownedCount: number;
}

export interface PublicProfileBundle {
  user: SeoPublicUser;
  gameStats: UserGameStat[];
  totalOwned: number;
}

export interface HomeGameStat {
  game: SeoGame;
  /** Catalogue entries: every item except banner presets. Not "characters" —
   *  sections differ per game (operators, agents, resonators, light cones,
   *  materials), so the total only means "how much is catalogued here". */
  entryCount: number;
}

export interface HomePageBundle {
  stats: HomeGameStat[];
  totalEntries: number;
}

/** Banner presets describe availability rather than catalogue content, and the
 *  section exists for every game, so they're excluded from the entry counts
 *  that decide which games are worth featuring. */
const NON_CATALOGUE_SECTIONS = new Set(["banners"]);

export async function getHomePageBundle(): Promise<HomePageBundle> {
  const [games, items] = await Promise.all([listGames(), listAllItems()]);
  const gameList = games ?? [];
  const catalogue = items.filter(
    (item) => !item.section_slug || !NON_CATALOGUE_SECTIONS.has(item.section_slug),
  );
  const countsByGame = new Map<string, number>();
  for (const item of catalogue) {
    countsByGame.set(item.game_id, (countsByGame.get(item.game_id) ?? 0) + 1);
  }
  const stats = gameList.map((g) => ({
    game: g,
    entryCount: countsByGame.get(g.id) ?? 0,
  }));
  // Heaviest catalogues first, so the featured grid leads with real content.
  stats.sort((a, b) => b.entryCount - a.entryCount);
  return { stats, totalEntries: catalogue.length };
}

export async function getPublicProfileBundle(username: string): Promise<PublicProfileBundle | null> {
  const user = await getPublicUserByUsername(username);
  if (!user) return null;
  const [collection, games] = await Promise.all([
    getPublicCollectionStats(user.id),
    listGames(),
  ]);
  const stats: UserGameStat[] = [];
  for (const row of collection?.games ?? []) {
    const game = games?.find((g) => g.id === row.game_id);
    if (game)
      stats.push({
        game: { id: game.id, slug: game.slug, name: game.name },
        ownedCount: row.owned_count,
      });
  }
  stats.sort((a, b) => b.ownedCount - a.ownedCount);
  return { user, gameStats: stats, totalOwned: collection?.total_owned ?? 0 };
}

export function listGames() {
  return apiGet<SeoGame[]>(`/games`);
}

export function listAllItems(): Promise<SeoItem[]> {
  // Paginate; the backend caps each response at 200 rows.
  return (async () => {
    const PAGE = 200;
    const HARD_CAP = 100_000;
    const all: SeoItem[] = [];
    let offset = 0;
    while (all.length < HARD_CAP) {
      const page = await apiGet<SeoItem[]>(`/items?limit=${PAGE}&offset=${offset}`);
      if (!page || page.length === 0) break;
      all.push(...page);
      if (page.length < PAGE) break;
      offset += PAGE;
    }
    return all;
  })();
}

export function listPublicTierLists(): Promise<SeoTierList[]> {
  // The /tierlists/public endpoint takes a game_id; here we'd want all games.
  // Sitemap usage iterates games and aggregates per-game lists.
  return Promise.resolve([]);
}

export async function listPublicTierListsForGame(gameId: string) {
  return (await apiGet<SeoTierList[]>(`/tierlists/public?game_id=${encodeURIComponent(gameId)}`)) ?? [];
}

export function itemDisplayName(item: SeoItem): string {
  const name = item.data?.name;
  return typeof name === "string" && name.length > 0 ? name : item.slug;
}

export function truncate(s: string | null | undefined, n = 160): string | undefined {
  if (!s) return undefined;
  const trimmed = s.trim();
  if (trimmed.length === 0) return undefined;
  return trimmed.length <= n ? trimmed : trimmed.slice(0, n - 1).trimEnd() + "…";
}
