import type { Metadata } from "next";
import { getPublicUserByUsername } from "@/lib/seo";
import PublicProfileClient from "./PublicProfileClient";

interface RouteParams {
  params: Promise<{ username: string }>;
}

export async function generateMetadata({ params }: RouteParams): Promise<Metadata> {
  const { username } = await params;
  const user = await getPublicUserByUsername(username);
  if (!user) {
    return {
      title: "User not found",
      robots: { index: false, follow: false },
    };
  }
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
      card: user.avatar_url ? "summary" : "summary",
      title: `${title} | Hotarumi`,
      description,
      images: user.avatar_url ? [user.avatar_url] : undefined,
    },
  };
}

export default function Page() {
  return <PublicProfileClient />;
}
