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
  // NOTE: static security headers (X-Frame-Options, X-Content-Type-Options,
  // HSTS, Referrer-Policy, Permissions-Policy, COOP, CORP) are intentionally
  // NOT set here. They are owned by the edge in nginx/nginx.conf so they apply
  // uniformly to every upstream — including api-gateway and media-service
  // responses that never pass through Next. Setting them in both places emitted
  // duplicate headers (and a conflicting HSTS max-age: 2y here vs 1y at nginx).
  // CSP is still generated per-request, with a nonce, in src/middleware.ts.
};

export default withNextIntl(nextConfig);
