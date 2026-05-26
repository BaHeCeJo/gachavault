import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { getHomePageBundle } from "@/lib/seo";
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
  const featured = bundle.stats.slice(0, 8);

  return (
    <main className="min-h-[calc(100vh-57px)] flex flex-col">
      {/* Hero */}
      <section className="relative flex flex-col items-center justify-center flex-1 px-6 py-20 text-center overflow-hidden">
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="w-[600px] h-[400px] rounded-full bg-amber-500/15 blur-[120px]" />
        </div>

        <h1 className="relative text-5xl sm:text-6xl font-semibold tracking-tight mb-4">{t("title")}</h1>
        <p className="relative text-xl text-gray-400 mb-10 max-w-xl">{t("subtitle")}</p>

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
        <p className="relative text-xs text-gray-500 mt-3 max-w-md">{t("createAccountHint")}</p>
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
                  <p className="text-xs text-gray-500 mt-0.5">
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
    </main>
  );
}
