import type { Metadata } from "next";
import { getTierListByShareSlug } from "@/lib/seo";
import SharedTierListClient from "./SharedTierListClient";

interface RouteParams {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: RouteParams): Promise<Metadata> {
  const { slug } = await params;
  const list = await getTierListByShareSlug(slug);
  if (!list) {
    return {
      title: "Tier list not found",
      robots: { index: false, follow: false },
    };
  }
  const title = list.title;
  const description = `A community tier list shared on Hotarumi: ${list.title}.`;
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

export default function Page() {
  return <SharedTierListClient />;
}
