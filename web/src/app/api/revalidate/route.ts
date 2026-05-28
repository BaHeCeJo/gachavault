import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

// On-demand ISR invalidation. Called from admin pages after every successful
// save/delete so the public pages (which fetch with `revalidate: 300` in
// lib/seo.ts) don't have to wait out the 5-minute window.
//
// Body:
//   { gameSlug?: string, paths?: string[] }
// gameSlug invalidates the whole /games/<slug> subtree, the games list, and
// the home page. paths invalidates each explicitly. Both are optional and
// can be combined.
//
// Auth: not gated. The endpoint can only force-refresh already-public
// content — nothing destructive and nothing private. Rate-limiting can be
// added at nginx if abuse ever shows up.
export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON" }, { status: 400 });
  }

  const obj = (body ?? {}) as { gameSlug?: unknown; paths?: unknown };
  const revalidated: string[] = [];

  if (typeof obj.gameSlug === "string" && obj.gameSlug) {
    // 'layout' propagates the invalidation to nested routes (section + item
    // pages live under /games/<slug>/...).
    revalidatePath(`/games/${obj.gameSlug}`, "layout");
    revalidatePath("/games", "layout");
    revalidatePath("/");
    revalidated.push(`/games/${obj.gameSlug} (layout)`, "/games (layout)", "/");
  }

  if (Array.isArray(obj.paths)) {
    for (const p of obj.paths) {
      if (typeof p === "string" && p.startsWith("/")) {
        revalidatePath(p);
        revalidated.push(p);
      }
    }
  }

  return NextResponse.json({ ok: true, revalidated });
}
