"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usersApi } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";

interface SiteStats {
  total_users: number;
  verified_users: number;
  google_users: number;
  new_users_30d: number;
  games: number;
  sections: number;
  items: number;
  tierlists: number;
  public_tierlists: number;
  collectors: number;
}

function StatCard({
  label,
  value,
  sub,
  href,
}: {
  label: string;
  value: number | string;
  sub?: string;
  href?: string;
}) {
  const inner = (
    <div className="rounded-xl border border-gray-800 bg-gray-900 p-5 hover:border-gray-600 transition">
      <p className="text-sm text-gray-400 mb-1">{label}</p>
      <p className="text-3xl font-bold">{typeof value === "number" ? value.toLocaleString() : value}</p>
      {sub && <p className="text-xs text-gray-500 mt-1">{sub}</p>}
    </div>
  );
  return href ? <Link href={href}>{inner}</Link> : inner;
}

export default function AdminStatsPage() {
  const { user, isLoading } = useAuth();
  const router = useRouter();
  const [stats, setStats] = useState<SiteStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isLoading && (!user || (user.role !== "admin" && user.role !== "superadmin"))) {
      router.replace("/");
    }
  }, [isLoading, user, router]);

  useEffect(() => {
    if (!user) return;
    usersApi
      .getAdminStats()
      .then((r) => setStats(r.data.data))
      .finally(() => setLoading(false));
  }, [user]);

  if (isLoading || loading) {
    return (
      <main className="max-w-5xl mx-auto px-6 py-10">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="h-28 rounded-xl bg-gray-800 animate-pulse" />
          ))}
        </div>
      </main>
    );
  }

  const verifiedPct = stats
    ? Math.round((stats.verified_users / Math.max(stats.total_users, 1)) * 100)
    : 0;
  const publicPct = stats
    ? Math.round((stats.public_tierlists / Math.max(stats.tierlists, 1)) * 100)
    : 0;

  return (
    <main className="max-w-5xl mx-auto px-6 py-10 space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Site Statistics</h1>
        <Link href="/admin" className="text-sm text-gray-400 hover:text-white">
          ← Admin
        </Link>
      </div>

      {/* Users */}
      <section>
        <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">Users</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard label="Total Users" value={stats?.total_users ?? "—"} href="/admin/users" />
          <StatCard
            label="Email Verified"
            value={stats?.verified_users ?? "—"}
            sub={stats ? `${verifiedPct}% of users` : undefined}
          />
          <StatCard label="Google OAuth" value={stats?.google_users ?? "—"} />
          <StatCard
            label="New (30 days)"
            value={stats?.new_users_30d ?? "—"}
            sub="registered this month"
          />
        </div>
      </section>

      {/* Content */}
      <section>
        <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">Content</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard label="Games" value={stats?.games ?? "—"} href="/admin/games" />
          <StatCard
            label="Sections"
            value={stats?.sections ?? "—"}
            sub="across all games"
          />
          <StatCard label="Items" value={stats?.items ?? "—"} href="/admin/items" />
          <StatCard label="Active Collectors" value={stats?.collectors ?? "—"} />
        </div>
      </section>

      {/* Tier Lists */}
      <section>
        <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">Tier Lists</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard label="Total Tier Lists" value={stats?.tierlists ?? "—"} />
          <StatCard
            label="Public"
            value={stats?.public_tierlists ?? "—"}
            sub={stats ? `${publicPct}% public` : undefined}
          />
          <StatCard
            label="Private"
            value={stats && stats.tierlists !== undefined ? stats.tierlists - stats.public_tierlists : "—"}
          />
        </div>
      </section>

      {/* Quick links */}
      <section className="rounded-xl border border-gray-800 bg-gray-900 p-5">
        <h2 className="text-sm font-semibold mb-3">Quick Links</h2>
        <div className="flex flex-wrap gap-3">
          {[
            { href: "/admin/users", label: "Manage Users" },
            { href: "/admin/games", label: "Manage Games" },
            { href: "/admin/items", label: "Manage Items" },
            { href: "/admin/backups", label: "Backups" },
          ].map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="px-4 py-2 rounded-lg border border-gray-700 text-sm hover:border-gray-500 transition"
            >
              {l.label}
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}
