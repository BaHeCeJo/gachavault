import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import {
  getItemPageBundle,
  itemDisplayName,
  truncate,
} from "@/lib/seo";
import ItemPageClient from "./ItemPageClient";

interface RouteParams {
  params: Promise<{ slug: string; sectionSlug: string; itemSlug: string }>;
}

async function readLocale(): Promise<string> {
  const store = await cookies();
  const raw = store.get("locale")?.value ?? "en";
  return raw === "fr" ? "fr" : "en";
}

export async function generateMetadata({ params }: RouteParams): Promise<Metadata> {
  const { slug, sectionSlug, itemSlug } = await params;
  const locale = await readLocale();
  const bundle = await getItemPageBundle(slug, sectionSlug, itemSlug, locale);
  if (!bundle) {
    return {
      title: "Item not found",
      robots: { index: false, follow: false },
    };
  }
  const name = itemDisplayName(bundle.item);
  const gameName = bundle.game?.name ?? slug;
  const dataDesc =
    typeof bundle.item.data?.description === "string"
      ? (bundle.item.data.description as string)
      : null;
  const dataLore =
    typeof bundle.item.data?.lore === "string" ? (bundle.item.data.lore as string) : null;
  const description =
    truncate(dataDesc) ??
    truncate(dataLore) ??
    `${name} stats, skills and builds for ${gameName} on Hotarumi.`;
  const imageUrl =
    typeof bundle.item.data?.image_url === "string"
      ? (bundle.item.data.image_url as string)
      : typeof bundle.item.data?.icon_url === "string"
        ? (bundle.item.data.icon_url as string)
        : null;
  const path = `/games/${slug}/${sectionSlug}/${itemSlug}`;
  const fullTitle = `${name} — ${gameName} | Hotarumi`;
  return {
    title: { absolute: fullTitle },
    description,
    alternates: { canonical: path },
    openGraph: {
      title: fullTitle,
      description,
      url: path,
      type: "article",
      images: imageUrl ? [{ url: imageUrl }] : undefined,
    },
    twitter: {
      card: imageUrl ? "summary_large_image" : "summary",
      title: fullTitle,
      description,
      images: imageUrl ? [imageUrl] : undefined,
    },
  };
}

export default async function Page({ params }: RouteParams) {
  const { slug, sectionSlug, itemSlug } = await params;
  const locale = await readLocale();
  const bundle = await getItemPageBundle(slug, sectionSlug, itemSlug, locale);
  if (!bundle) notFound();
  return <ItemPageClient initial={bundle} />;
}
