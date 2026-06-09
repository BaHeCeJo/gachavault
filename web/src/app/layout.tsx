import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import { Providers } from "@/components/Providers";
import { Navbar } from "@/components/Navbar";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://hotarumi.com";
// ~55 chars — long enough to fill the SERP title slot and carry the primary
// keywords ("gacha", "tier lists", game names live elsewhere), short enough
// that Google won't truncate it with an ellipsis.
const defaultTitle = "Hotarumi — Track Your Gacha Characters & Tier Lists";
// ~150 chars — sits inside Google's ~155-char description window while naming
// the concrete things people search for (roster tracking, tier lists, the
// flagship games) instead of a vague one-liner.
const defaultDescription =
  "Track every character you own across Arknights, Honkai: Star Rail, Genshin Impact and more — build and share gacha tier lists. Free, synced, in EN & FR.";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: defaultTitle,
    template: "%s | Hotarumi",
  },
  description: defaultDescription,
  applicationName: "Hotarumi",
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    siteName: "Hotarumi",
    title: defaultTitle,
    description: defaultDescription,
    url: siteUrl,
  },
  twitter: {
    card: "summary_large_image",
    title: defaultTitle,
    description: defaultDescription,
  },
  robots: { index: true, follow: true },
};

// Without this, mobile browsers assume a ~980px desktop viewport and render
// the whole site zoomed out — and the Tailwind sm:/md: breakpoints never fire
// because the layout viewport never matches the device width. This single
// export is what makes the existing responsive classes actually take effect
// on phones.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [locale, messages] = await Promise.all([getLocale(), getMessages()]);

  return (
    <html lang={locale} className="dark">
      <body className={`${inter.className} bg-background text-foreground min-h-screen`}>
        {/* Skip link — only visible to keyboard users on focus. Lets them
            jump past the navbar (logo + 5+ links + language switcher +
            profile menu) directly to the page content. */}
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:px-4 focus:py-2 focus:bg-amber-500 focus:text-black focus:rounded-lg focus:font-semibold"
        >
          Skip to main content
        </a>
        <NextIntlClientProvider messages={messages}>
          <Providers>
            <Navbar />
            <div id="main-content">{children}</div>
          </Providers>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
