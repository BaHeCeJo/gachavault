import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/seo";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        // The Allow lines re-permit specific subpaths beneath disallowed
        // prefixes — Google honours the longer prefix match, so
        // /tierlists is blocked but /tierlists/share/<id> is crawlable.
        allow: ["/", "/tierlists/share/"],
        disallow: [
          "/admin",
          "/admin/",
          "/auth/",
          "/profile",
          "/collections",
          "/search",
          "/items/",
          "/tierlists",
        ],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
