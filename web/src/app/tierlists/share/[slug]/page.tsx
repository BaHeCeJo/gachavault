import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getSharedTierListBundle } from "@/lib/seo";
import SharedTierListClient from "./SharedTierListClient";

interface RouteParams {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: RouteParams): Promise<Metadata> {
  const { slug } = await params;
  const bundle = await getSharedTierListBundle(slug);
  if (!bundle) {
    return {
      title: "Tier list not found",
      robots: { index: false, follow: false },
    };
  }
  const description = `A community tier list shared on Hotarumi: ${bundle.tierList.title}.`;
  const path = `/tierlists/share/${slug}`;
  const fullTitle = `${bundle.tierList.title} | Hotarumi`;
  return {
    title: { absolute: fullTitle },
    description,
    alternates: { canonical: path },
    openGraph: {
      title: fullTitle,
      description,
      url: path,
      type: "article",
    },
    twitter: {
      card: "summary",
      title: fullTitle,
      description,
    },
  };
}

export default async function Page({ params }: RouteParams) {
  const { slug } = await params;
  const bundle = await getSharedTierListBundle(slug);
  if (!bundle) notFound();
  return <SharedTierListClient initial={bundle} />;
}
