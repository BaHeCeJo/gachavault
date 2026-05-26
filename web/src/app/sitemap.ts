import type { MetadataRoute } from "next";
import {
  SITE_URL,
  listGames,
  listAllItems,
  listPublicTierListsForGame,
} from "@/lib/seo";

export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();
  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${SITE_URL}/`, lastModified: now, changeFrequency: "daily", priority: 1.0 },
    { url: `${SITE_URL}/games`, lastModified: now, changeFrequency: "weekly", priority: 0.8 },
    { url: `${SITE_URL}/search`, lastModified: now, changeFrequency: "weekly", priority: 0.5 },
    { url: `${SITE_URL}/tierlists`, lastModified: now, changeFrequency: "weekly", priority: 0.7 },
  ];

  const [games, items] = await Promise.all([listGames(), listAllItems()]);
  const gameRoutes: MetadataRoute.Sitemap =
    games?.map((g) => ({
      url: `${SITE_URL}/games/${g.slug}`,
      lastModified: now,
      changeFrequency: "daily",
      priority: 0.9,
    })) ?? [];

  const itemRoutes: MetadataRoute.Sitemap = items
    .filter((it) => it.game_slug && it.section_slug)
    .map((it) => ({
      url: `${SITE_URL}/games/${it.game_slug}/${it.section_slug}/${it.slug}`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.7,
    }));

  let tierRoutes: MetadataRoute.Sitemap = [];
  if (games?.length) {
    const lists = await Promise.all(games.map((g) => listPublicTierListsForGame(g.id)));
    tierRoutes = lists.flat().map((tl) => ({
      url: `${SITE_URL}/tierlists/share/${tl.share_slug}`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.5,
    }));
  }

  return [...staticRoutes, ...gameRoutes, ...itemRoutes, ...tierRoutes];
}
