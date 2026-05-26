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
        <NextIntlClientProvider messages={messages}>
          <Providers>
            <Navbar />
            {children}
          </Providers>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
