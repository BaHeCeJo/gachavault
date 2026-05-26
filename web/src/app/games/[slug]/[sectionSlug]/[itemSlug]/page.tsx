import type { Metadata } from "next";
import { getGame, getItemBySlugs, itemDisplayName, truncate } from "@/lib/seo";
import ItemPageClient from "./ItemPageClient";

interface RouteParams {
  params: Promise<{ slug: string; sectionSlug: string; itemSlug: string }>;
}

export async function generateMetadata({ params }: RouteParams): Promise<Metadata> {
  const { slug, sectionSlug, itemSlug } = await params;
  const [item, game] = await Promise.all([
    getItemBySlugs(slug, sectionSlug, itemSlug),
    getGame(slug),
  ]);
  if (!item) {
    return {
      title: "Item not found",
      robots: { index: false, follow: false },
    };
  }
  const name = itemDisplayName(item);
  const gameName = game?.name ?? slug;
  const title = `${name} — ${gameName}`;
  const dataDesc =
    typeof item.data?.description === "string" ? (item.data.description as string) : null;
  const dataLore = typeof item.data?.lore === "string" ? (item.data.lore as string) : null;
  const description =
    truncate(dataDesc) ??
    truncate(dataLore) ??
    `${name} stats, skills and builds for ${gameName} on Hotarumi.`;
  const imageUrl =
    typeof item.data?.image_url === "string"
      ? (item.data.image_url as string)
      : typeof item.data?.icon_url === "string"
        ? (item.data.icon_url as string)
        : null;
  const path = `/games/${slug}/${sectionSlug}/${itemSlug}`;
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: {
      title: `${title} | Hotarumi`,
      description,
      url: path,
      type: "article",
      images: imageUrl ? [{ url: imageUrl }] : undefined,
    },
    twitter: {
      card: imageUrl ? "summary_large_image" : "summary",
      title: `${title} | Hotarumi`,
      description,
      images: imageUrl ? [imageUrl] : undefined,
    },
  };
}

export default function Page() {
  return <ItemPageClient />;
}
