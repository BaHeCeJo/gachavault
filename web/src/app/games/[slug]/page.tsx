import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { getGamePageBundle, truncate } from "@/lib/seo";
import GamePageClient from "./GamePageClient";

interface RouteParams {
  params: Promise<{ slug: string }>;
}

async function readLocale(): Promise<string> {
  const store = await cookies();
  const raw = store.get("locale")?.value ?? "en";
  return raw === "fr" ? "fr" : "en";
}

export async function generateMetadata({ params }: RouteParams): Promise<Metadata> {
  const { slug } = await params;
  const locale = await readLocale();
  const bundle = await getGamePageBundle(slug, locale);
  if (!bundle) {
    return {
      title: "Game not found",
      robots: { index: false, follow: false },
    };
  }
  const { game } = bundle;
  const description =
    truncate(game.description) ??
    `Characters, tier lists and events for ${game.name} on Hotarumi.`;
  const path = `/games/${game.slug}`;
  const images = game.banner_url ? [{ url: game.banner_url }] : undefined;
  const fullTitle = `${game.name} | Hotarumi`;
  return {
    // Use absolute so the root template doesn't get a chance to double-apply
    // or get skipped. Observed in prod: a plain-string title here renders as
    // just "Arknights" without the Hotarumi suffix.
    title: { absolute: fullTitle },
    description,
    alternates: { canonical: path },
    openGraph: {
      title: fullTitle,
      description,
      url: path,
      type: "website",
      images,
    },
    twitter: {
      card: "summary_large_image",
      title: fullTitle,
      description,
      images: game.banner_url ? [game.banner_url] : undefined,
    },
  };
}

export default async function Page({ params }: RouteParams) {
  const { slug } = await params;
  const locale = await readLocale();
  const bundle = await getGamePageBundle(slug, locale);
  if (!bundle) notFound();
  return <GamePageClient initial={bundle} />;
}
