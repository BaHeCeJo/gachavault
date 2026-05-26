import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Games",
  description: "Every gacha game tracked on Hotarumi.",
  alternates: { canonical: "/games" },
  openGraph: {
    title: "Games | Hotarumi",
    description: "Every gacha game tracked on Hotarumi.",
    url: "/games",
    type: "website",
  },
};

export default function GamesLayout({ children }: { children: React.ReactNode }) {
  return children;
}
