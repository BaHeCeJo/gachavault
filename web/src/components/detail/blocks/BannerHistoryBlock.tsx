"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useBannerRuns, useItemBannerHistory } from "@/hooks/queries";
import {
  BANNER_SECTION_SLUG,
  bannerHref,
  bannerName,
  featuredIcon,
  formatDateRange,
  relativeTime,
  availabilityOf,
  effectiveTimes,
  type CalendarEvent,
  type FeaturedItem,
} from "@/lib/events";
import type { ItemPageBundle } from "@/lib/seo";

/**
 * Pull history, from either end of the banner↔item link:
 *
 *  - on a banner item ("Words of Yore") → every run of that banner;
 *  - on a collectable ("Acheron")       → every run of every banner whose
 *    preset roster features them.
 *
 * Each row shows that run's own lineup, so the 4★s that rode along on a
 * specific rerun are visible even though they never touched the preset.
 * Renders nothing when there's no history, so items that have never been on a
 * banner are unaffected.
 */
export function BannerHistoryBlock({ bundle }: { bundle: ItemPageBundle }) {
  const t = useTranslations("bannerHistory");
  const locale = useLocale();
  const item = bundle.item;
  const isBanner = item.section_slug === BANNER_SECTION_SLUG;

  // Only one of these runs — the other is disabled by an empty id.
  const runsQuery = useBannerRuns(isBanner ? item.id : "", locale);
  const historyQuery = useItemBannerHistory(isBanner ? "" : item.id, locale);
  const query = isBanner ? runsQuery : historyQuery;
  const runs: CalendarEvent[] = query.data ?? [];

  // Stable "now" for the component's lifetime: keeps the server and client
  // renders agreeing, and stops the relative label churning mid-session.
  const now = useMemo(() => new Date().getTime(), []);

  if (query.isLoading || runs.length === 0) return null;

  return (
    <section className="mb-8">
      <div className="flex items-baseline justify-between gap-3 mb-3">
        <h2 className="text-xl font-semibold">{t("title")}</h2>
        <span className="text-xs text-gray-400">{t("count", { count: runs.length })}</span>
      </div>

      <AvailabilityPill runs={runs} now={now} />


      <ol className="space-y-2">
        {runs.map((run) => (
          <li
            key={run.id}
            className="rounded-lg border border-gray-800 bg-gray-900 px-4 py-3"
          >
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              {/* On a collectable's page the banner name is the useful label;
                  on the banner's own page it would just repeat the title. */}
              {!isBanner && run.banner ? (
                <Link
                  href={bannerHref(run.banner)}
                  className="font-medium hover:text-amber-300 transition"
                >
                  {bannerName(run.banner)}
                </Link>
              ) : (
                <span className="font-medium">{run.title}</span>
              )}
              <span className="text-xs text-gray-400">
                {formatDateRange(run, locale)}
              </span>
            </div>

            <RunLineup items={run.featured_items} />
          </li>
        ))}
      </ol>
    </section>
  );
}

// A run's roster, split by role: the rate-ups that define the banner first,
// then the extras that were only pullable on this run.
function RunLineup({ items }: { items: FeaturedItem[] }) {
  if (items.length === 0) return null;
  const featured = items.filter((i) => i.role === "featured");
  const alsoRan = items.filter((i) => i.role !== "featured");

  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5">
      {featured.map((f) => (
        <ItemChip key={f.item_id} item={f} highlight />
      ))}
      {alsoRan.length > 0 && featured.length > 0 && (
        <span className="mx-1 h-4 w-px bg-gray-700" aria-hidden />
      )}
      {alsoRan.map((f) => (
        <ItemChip key={f.item_id} item={f} />
      ))}
    </div>
  );
}

function ItemChip({ item, highlight = false }: { item: FeaturedItem; highlight?: boolean }) {
  const name =
    typeof item.data.name === "string" && item.data.name ? item.data.name : item.slug;
  const icon = featuredIcon(item.data);

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs ${
        highlight
          ? "border-amber-700/60 bg-amber-900/20 text-amber-200"
          : "border-gray-700 bg-gray-800/60 text-gray-300"
      }`}
    >
      {icon && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={icon} alt="" className="h-4 w-4 rounded-full object-cover" />
      )}
      {name}
    </span>
  );
}

/** Day-precision date for the availability line — a rate-up window is a
 *  multi-week thing, so the hour is noise, but the year matters when the last
 *  run was two years ago. */
function formatDay(iso: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(new Date(iso));
}

/**
 * "Can I pull this right now, and if not, when could I last?" — the question a
 * collectable page has to answer at a glance, without reading the run list.
 *
 * Three states, because checking only whether the newest run has ended reads a
 * scheduled future banner as live.
 */
function AvailabilityPill({ runs, now }: { runs: CalendarEvent[]; now: number }) {
  const t = useTranslations("bannerHistory");
  const locale = useLocale();

  const current = availabilityOf(runs, now);
  if (!current) return null;
  const { start, end } = effectiveTimes(current.run);

  let tone = "border-gray-700 bg-gray-800/60 text-gray-300";
  let label: string;
  if (current.state === "active") {
    tone = "border-amber-500/60 bg-amber-500/10 text-amber-200";
    label = end
      ? t("availableUntil", { date: formatDay(end, locale), rel: relativeTime(end, locale, now) })
      : t("availableOngoing");
  } else if (current.state === "upcoming") {
    tone = "border-blue-500/50 bg-blue-500/10 text-blue-200";
    label = t("availableFrom", {
      date: formatDay(start, locale),
      rel: relativeTime(start, locale, now),
    });
  } else {
    const when = end ?? start;
    label = t("lastAvailableOn", {
      date: formatDay(when, locale),
      rel: relativeTime(when, locale, now),
    });
  }

  return (
    <p className={`mb-3 inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm ${tone}`}>
      {current.state === "active" && (
        <span className="inline-block h-2 w-2 rounded-full bg-amber-400 animate-pulse" aria-hidden />
      )}
      {label}
    </p>
  );
}
