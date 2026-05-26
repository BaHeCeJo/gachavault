import type { Metadata } from "next";
import { getGame, truncate } from "@/lib/seo";
import GamePageClient from "./GamePageClient";

interface RouteParams {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: RouteParams): Promise<Metadata> {
  const { slug } = await params;
  const game = await getGame(slug);
  if (!game) {
    return {
      title: "Game not found",
      robots: { index: false, follow: false },
    };
  }
  const title = game.name;
  const description =
    truncate(game.description) ??
    `Characters, tier lists and events for ${game.name} on Hotarumi.`;
  const path = `/games/${game.slug}`;
  const images = game.banner_url ? [{ url: game.banner_url }] : undefined;
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: {
      title: `${title} | Hotarumi`,
      description,
      url: path,
      type: "website",
      images,
    },
    twitter: {
      card: "summary_large_image",
      title: `${title} | Hotarumi`,
      description,
      images: game.banner_url ? [game.banner_url] : undefined,
    },
  };
}

export default function Page() {
  return <GamePageClient />;
}
