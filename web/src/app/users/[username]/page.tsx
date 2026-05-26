import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getPublicProfileBundle } from "@/lib/seo";
import PublicProfileClient from "./PublicProfileClient";

interface RouteParams {
  params: Promise<{ username: string }>;
}

export async function generateMetadata({ params }: RouteParams): Promise<Metadata> {
  const { username } = await params;
  const bundle = await getPublicProfileBundle(username);
  if (!bundle) {
    return {
      title: "User not found",
      robots: { index: false, follow: false },
    };
  }
  const { user } = bundle;
  const title = `@${user.username}`;
  const description = `${user.username}'s public collection on Hotarumi.`;
  const path = `/users/${encodeURIComponent(user.username)}`;
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: {
      title: `${title} | Hotarumi`,
      description,
      url: path,
      type: "profile",
      images: user.avatar_url ? [{ url: user.avatar_url }] : undefined,
    },
    twitter: {
      card: "summary",
      title: `${title} | Hotarumi`,
      description,
      images: user.avatar_url ? [user.avatar_url] : undefined,
    },
  };
}

export default async function Page({ params }: RouteParams) {
  const { username } = await params;
  const bundle = await getPublicProfileBundle(username);
  if (!bundle) notFound();
  return <PublicProfileClient initial={bundle} />;
}
