import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { getHomePageBundle, SITE_URL } from "@/lib/seo";
import { SafeImage } from "@/components/SafeImage";
import HomeSearchForm from "@/components/HomeSearchForm";
import { cardGradient } from "@/lib/theme";

function FeatureCard({ title, description, icon }: { title: string; description: string; icon: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900/60 p-5 hover:border-amber-500/40 transition">
      <div className="w-10 h-10 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-300 mb-3">
        {icon}
      </div>
      <h3 className="text-base font-semibold mb-1">{title}</h3>
      <p className="text-sm text-gray-400 leading-relaxed">{description}</p>
    </div>
  );
}

export default async function HomePage() {
  const [t, bundle] = await Promise.all([
    getTranslations("home"),
    getHomePageBundle(),
  ]);
  // Only feature games that actually have characters — empty slots advertise
  // an unfinished site and the audit explicitly called this out as proof rot.
  const featured = bundle.stats.filter((s) => s.characterCount > 0).slice(0, 8);

  // Visible FAQ + its matching FAQPage structured data are built from the same
  // strings so the markup never drifts from what users read.
  const faqs = [1, 2, 3, 4].map((n) => ({ q: t(`faqQ${n}`), a: t(`faqA${n}`) }));

  // Organization + WebSite schema. The Organization entry gives Google the
  // canonical site name + logo for the knowledge panel; WebSite + the
  // SearchAction declares a Sitelinks searchbox pointing at /search so
  // SERPs can render a search input directly under the result.
  const jsonLd = [
    {
      "@context": "https://schema.org",
      "@type": "Organization",
      name: "Hotarumi",
      url: SITE_URL,
      logo: `${SITE_URL}/logo.png`,
    },
    {
      "@context": "https://schema.org",
      "@type": "WebSite",
      name: "Hotarumi",
      url: SITE_URL,
      potentialAction: {
        "@type": "SearchAction",
        target: `${SITE_URL}/search?q={search_term_string}`,
        "query-input": "required name=search_term_string",
      },
    },
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: faqs.map(({ q, a }) => ({
        "@type": "Question",
        name: q,
        acceptedAnswer: { "@type": "Answer", text: a },
      })),
    },
  ];

  return (
    <main className="min-h-[calc(100vh-57px)] flex flex-col">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      {/* Hero */}
      <section className="relative flex flex-col items-center justify-center flex-1 px-6 py-20 text-center overflow-hidden">
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="w-[600px] h-[400px] rounded-full bg-amber-500/15 blur-[120px]" />
        </div>

        {/* Brand + value-prop in a single H1. The descriptive second line is
            what makes the heading meaningful to search engines (a brand-only
            "Hotarumi" H1 is 8 chars / one word and reads as content-less);
            the visual hierarchy is unchanged from the previous h1 + p. */}
        <h1 className="relative mb-10 max-w-xl">
          <span className="block text-5xl sm:text-6xl font-semibold tracking-tight">{t("title")}</span>
          <span className="block text-xl text-gray-400 font-normal mt-4">{t("subtitle")}</span>
        </h1>

        <HomeSearchForm placeholder={t("searchPlaceholder")} buttonLabel={t("searchButton")} />

        <div className="relative flex gap-4 mt-8">
          <Link
            href="/games"
            className="px-5 py-2.5 border border-gray-700 rounded-lg text-sm hover:border-amber-400 hover:text-amber-300 transition"
          >
            {t("browseGames")}
          </Link>
          <Link
            href="/auth/register"
            className="px-5 py-2.5 bg-amber-500 text-black rounded-lg text-sm font-semibold hover:bg-amber-400 transition shadow-lg shadow-amber-500/20"
          >
            {t("createAccount")}
          </Link>
        </div>
        <p className="relative text-xs text-gray-400 mt-3 max-w-md">{t("createAccountHint")}</p>
      </section>

      {/* Tracked games grid with counts */}
      {featured.length > 0 && (
        <section className="max-w-7xl mx-auto w-full px-6 pb-16">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold">{t("gamesSection")}</h2>
            <Link href="/games" className="text-sm text-gray-400 hover:text-amber-300 transition">
              {t("viewAll")} →
            </Link>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {featured.map(({ game, characterCount }) => (
              <Link
                key={game.id}
                href={`/games/${game.slug}`}
                className="group relative rounded-xl border border-gray-800 bg-gray-900 overflow-hidden hover:border-amber-500/60 hover:shadow-lg hover:shadow-amber-500/10 hover:scale-[1.02] transition-all duration-200"
              >
                <div className="relative h-28 w-full">
                  <SafeImage
                    src={game.banner_url}
                    alt={game.name}
                    fill
                    sizes="(min-width: 768px) 25vw, 50vw"
                    className="object-cover group-hover:brightness-110 transition duration-200"
                    fallback={
                      <div className={`h-28 w-full bg-gradient-to-br ${cardGradient(game.name)} flex items-center justify-center text-3xl font-semibold text-white/60`}>
                        {game.name[0]}
                      </div>
                    }
                  />
                </div>
                <div className="p-3">
                  <p className="font-semibold text-sm group-hover:text-amber-300 transition">{game.name}</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {t("charactersCount", { count: characterCount })}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Feature cards — moat-led: track / build / share */}
      <section className="max-w-7xl mx-auto w-full px-6 pb-20">
        <h2 className="text-xl font-semibold mb-4">{t("featuresTitle")}</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <FeatureCard
            title={t("featureRosterTitle")}
            description={t("featureRosterDesc")}
            icon={
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 7l9-4 9 4-9 4-9-4zM3 17l9 4 9-4M3 12l9 4 9-4" />
              </svg>
            }
          />
          <FeatureCard
            title={t("featureTierTitle")}
            description={t("featureTierDesc")}
            icon={
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h10M4 18h6" />
              </svg>
            }
          />
          <FeatureCard
            title={t("featureShareTitle")}
            description={t("featureShareDesc")}
            icon={
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 12v7a2 2 0 002 2h12a2 2 0 002-2v-7M16 6l-4-4m0 0L8 6m4-4v13" />
              </svg>
            }
          />
        </div>
      </section>

      {/* About + FAQ — gives the landing page real indexable prose (it was
          under the ~250-word threshold) and answers the questions a first-time
          visitor actually has. Mirrored by FAQPage JSON-LD above. */}
      <section className="max-w-3xl mx-auto w-full px-6 pb-24">
        <h2 className="text-xl font-semibold mb-3">{t("aboutTitle")}</h2>
        <p className="text-sm text-gray-400 leading-relaxed mb-12">{t("aboutBody")}</p>

        <h2 className="text-xl font-semibold mb-4">{t("faqTitle")}</h2>
        <div className="space-y-3">
          {faqs.map(({ q, a }, i) => (
            <div key={i} className="rounded-xl border border-gray-800 bg-gray-900/60 p-5">
              <h3 className="text-base font-semibold mb-1">{q}</h3>
              <p className="text-sm text-gray-400 leading-relaxed">{a}</p>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
