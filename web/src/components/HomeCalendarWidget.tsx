"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useAuth } from "@/context/AuthContext";
import { useMyCalendar, useEventFollows } from "@/hooks/queries";
import { CalendarView } from "@/components/CalendarView";
import type { CalendarEvent } from "@/lib/events";

// The personalized calendar on the home page. Renders nothing for anonymous
// visitors (the landing page is unchanged for them) and only fetches once we
// know the visitor is signed in.
export default function HomeCalendarWidget() {
  const { user, isLoading } = useAuth();
  const t = useTranslations("calendar");
  const locale = useLocale();
  const loggedIn = !!user;

  const nowIso = useMemo(() => new Date().toISOString(), []);
  const { data: follows = [] } = useEventFollows(loggedIn);
  const { data: events = [] as CalendarEvent[], isLoading: eventsLoading } = useMyCalendar(
    { from: nowIso },
    locale,
    loggedIn,
  );

  if (isLoading || !loggedIn) return null;

  return (
    <section className="max-w-7xl mx-auto w-full px-6 pb-16">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold">{t("myCalendar")}</h2>
        <Link href="/calendar/tracked" className="text-sm text-gray-400 hover:text-amber-300 transition">
          {t("manageTracked")} →
        </Link>
      </div>

      {follows.length === 0 ? (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-6 text-center">
          <p className="text-sm text-gray-300 mb-4 max-w-md mx-auto">{t("noFollows")}</p>
          <Link
            href="/calendar/tracked"
            className="inline-block px-5 py-2.5 bg-amber-500 text-black rounded-lg text-sm font-semibold hover:bg-amber-400 transition"
          >
            {t("trackCTA")}
          </Link>
        </div>
      ) : (
        <CalendarView events={events} isLoading={eventsLoading} defaultView="list" />
      )}
    </section>
  );
}
