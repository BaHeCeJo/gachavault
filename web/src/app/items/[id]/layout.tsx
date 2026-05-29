import type { Metadata } from "next";
import { SITE_URL } from "@/lib/seo";

// The same item is reachable at /items/[id] AND at the game-scoped path
// /games/<game_slug>/<section_slug>/<item_slug> — and the game-scoped path
// is the one we set metadata for and link to from cards. Tell crawlers
// which URL to index by emitting a noindex + canonical on the id route.
// Without this, Google sees two URLs for one entity and splits link equity.

const API_BASE =
  process.env.INTERNAL_API_URL ??
  process.env.NEXT_PUBLIC_API_URL ??
  "http://localhost:3000";

interface ItemSlugTriple {
  gameSlug: string;
  sectionSlug: string;
  itemSlug: string;
}

async function fetchItemSlugs(id: string): Promise<ItemSlugTriple | null> {
  try {
    const res = await fetch(`${API_BASE}/api/v1/items/${encodeURIComponent(id)}`, {
      next: { revalidate: 300 },
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      data?: { slug?: string; game_slug?: string; section_slug?: string };
    };
    const item = json?.data;
    if (!item?.game_slug || !item?.section_slug || !item?.slug) return null;
    return {
      gameSlug: item.game_slug,
      sectionSlug: item.section_slug,
      itemSlug: item.slug,
    };
  } catch {
    return null;
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const slugs = await fetchItemSlugs(id);
  if (!slugs) {
    return {
      title: "Item not found",
      robots: { index: false, follow: false },
    };
  }
  const canonical = `/games/${slugs.gameSlug}/${slugs.sectionSlug}/${slugs.itemSlug}`;
  return {
    title: "Item",
    alternates: { canonical: `${SITE_URL}${canonical}` },
    // The canonical lives elsewhere — discourage indexing this duplicate URL.
    robots: { index: false, follow: true },
  };
}

export default function ItemByIdLayout({ children }: { children: React.ReactNode }) {
  return children;
}
