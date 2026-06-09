import { SITE_URL } from "@/lib/seo";

// Serves /llms.txt — the emerging convention for telling LLM-based agents and
// answer engines what a site is and where its canonical, crawlable content
// lives. Kept static (no DB calls) so it can't fail or slow down; it mirrors
// the public surface declared in robots.ts (games + shared tier lists public,
// everything account-gated private).
export const dynamic = "force-static";

export function GET() {
  const body = `# Hotarumi

> Hotarumi is a free, multi-game gacha tracker. Players record which characters
> they own across games like Arknights, Honkai: Star Rail, Zenless Zone Zero,
> Wuthering Waves and Genshin Impact, build drag-and-drop tier lists, and share
> them via public profiles. The site is available in English and French.

## Public content

- [Games](${SITE_URL}/games): browse every tracked game and its characters/items
- [Search](${SITE_URL}/search): search characters and items across all games
- [Shared tier lists](${SITE_URL}/tierlists/share/): community tier lists shared by link

## Account features (not crawlable)

- Collection tracking (ownership, levels, constellations) — requires sign-in
- Private tier list building and editing — requires sign-in
- Public user profiles

## Notes

- Sitemap: ${SITE_URL}/sitemap.xml
- Languages: English (en), French (fr)
- Admin, auth, profile, collection and search routes are private and excluded from indexing.
`;

  return new Response(body, {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      // Cache at the edge/CDN for a day; the content is static.
      "cache-control": "public, max-age=86400",
    },
  });
}
