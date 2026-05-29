import Link from "next/link";
import type { Metadata } from "next";

// Tells crawlers not to index the 404 itself. Next's default 404 page
// otherwise looks like a 200-with-empty-content to some crawlers (soft-404),
// which wastes crawl budget.
export const metadata: Metadata = {
  title: "Not found",
  robots: { index: false, follow: false },
};

export default function NotFound() {
  return (
    <main className="flex min-h-[calc(100vh-57px)] flex-col items-center justify-center px-6 text-center">
      <p className="text-sm font-mono text-amber-500">404</p>
      <h1 className="mt-2 text-3xl font-semibold">Page not found</h1>
      <p className="mt-3 max-w-md text-gray-300">
        The item, game, tier list, or user you were looking for doesn&apos;t
        exist — or it may have moved.
      </p>
      <div className="mt-8 flex gap-3">
        <Link
          href="/"
          className="px-5 py-2 rounded-lg bg-amber-500 text-black text-sm font-semibold hover:bg-amber-400 transition"
        >
          Home
        </Link>
        <Link
          href="/games"
          className="px-5 py-2 rounded-lg border border-gray-700 text-sm hover:border-white transition"
        >
          Browse games
        </Link>
      </div>
    </main>
  );
}
