import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin();

const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";
const apiHost = new URL(apiUrl).hostname;

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  // Strip the `X-Powered-By: Next.js` response header — it leaks the framework
  // (minor info disclosure) and SEO crawlers flag its presence.
  poweredByHeader: false,
  productionBrowserSourceMaps: false,
  eslint: { ignoreDuringBuilds: true },
  images: {
    formats: ["image/avif", "image/webp"],
    remotePatterns: [
      {
        protocol: "https",
        hostname: "hotarumi.com",
      },
      {
        protocol: "http",
        hostname: "localhost",
      },
      {
        protocol: apiUrl.startsWith("https") ? "https" : "http",
        hostname: apiHost,
      },
    ],
  },
  async headers() {
    // CSP is generated per-request in middleware.ts with a unique nonce so that
    // 'unsafe-inline' is no longer needed for scripts.  The headers here are
    // static security headers that don't need to change per request.
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          // DENY is consistent with frame-ancestors 'none' in the CSP (middleware).
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-XSS-Protection", value: "1; mode=block" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
        ],
      },
    ];
  },
};

export default withNextIntl(nextConfig);
