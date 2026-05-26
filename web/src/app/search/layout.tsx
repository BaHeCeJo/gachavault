import type { Metadata } from "next";

export const metadata: Metadata = {
  // Absolute so the root template doesn't add a redundant suffix.
  title: { absolute: "Search | Hotarumi" },
  // Search results pages are noindex by convention — they're query-dependent
  // and would dilute SERP relevance against the actual entity pages.
  robots: { index: false, follow: true },
};

export default function SearchLayout({ children }: { children: React.ReactNode }) {
  return children;
}
