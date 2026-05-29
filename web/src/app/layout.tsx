import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import { Providers } from "@/components/Providers";
import { Navbar } from "@/components/Navbar";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://hotarumi.com";
const defaultDescription =
  "Hotarumi tracks characters, items, tier lists and events across multiple gacha games — in English and French.";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "Hotarumi — Multi-game gacha tracker",
    template: "%s | Hotarumi",
  },
  description: defaultDescription,
  applicationName: "Hotarumi",
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    siteName: "Hotarumi",
    title: "Hotarumi — Multi-game gacha tracker",
    description: defaultDescription,
    url: siteUrl,
  },
  twitter: {
    card: "summary_large_image",
    title: "Hotarumi — Multi-game gacha tracker",
    description: defaultDescription,
  },
  robots: { index: true, follow: true },
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
