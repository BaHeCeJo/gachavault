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
  const title = bundle.tierList.title;
  const description = `A community tier list shared on Hotarumi: ${bundle.tierList.title}.`;
  const path = `/tierlists/share/${slug}`;
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: {
      title: `${title} | Hotarumi`,
      description,
      url: path,
      type: "article",
    },
    twitter: {
      card: "summary",
      title: `${title} | Hotarumi`,
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
