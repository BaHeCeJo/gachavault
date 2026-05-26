// Server-only helpers used by route `generateMetadata` and `sitemap`.
// Uses the Next.js native fetch (with built-in caching) rather than the
// axios client in `api.ts`, because that one is wired for browser cookies.

const API_BASE =
  process.env.INTERNAL_API_URL ??
  process.env.NEXT_PUBLIC_API_URL ??
  "http://localhost:3000";

export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://hotarumi.com";

type ApiEnvelope<T> = { success: boolean; data: T };

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
  data: Record<string, unknown>;
}

export interface SeoTierList {
  id: string;
  title: string;
  share_slug: string;
  game_id: string;
}

export interface SeoPublicUser {
  id: string;
  username: string;
  avatar_url: string | null;
  created_at: string;
}

export function getGame(slug: string) {
  return apiGet<SeoGame>(`/games/${encodeURIComponent(slug)}`);
}

export function getItemBySlugs(gameSlug: string, sectionSlug: string, itemSlug: string) {
  return apiGet<SeoItem>(
    `/items/by-slug/${encodeURIComponent(gameSlug)}/${encodeURIComponent(sectionSlug)}/${encodeURIComponent(itemSlug)}`,
  );
}

export function getTierListByShareSlug(slug: string) {
  return apiGet<SeoTierList>(`/tierlists/share/${encodeURIComponent(slug)}`);
}

export function getPublicUserByUsername(username: string) {
  return apiGet<SeoPublicUser>(`/users/by-username/${encodeURIComponent(username)}`);
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
