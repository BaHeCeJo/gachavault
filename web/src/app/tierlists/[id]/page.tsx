"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { tierlistsApi, itemsApi, gamesApi } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { SafeImage } from "@/components/SafeImage";

interface CustomTier { key: string; name: string; color: string }
interface TierEntry { item_id: string; tier: string }
interface TierList {
  id: string;
  game_id: string;
  title: string;
  is_public: boolean;
  share_slug: string;
  user_id: string;
  tiers: CustomTier[];
  entries: TierEntry[];
  section_id?: string | null;
}
interface Item { id: string; slug: string; data: Record<string, unknown> }

const DEFAULT_TIERS: CustomTier[] = [
  { key: "S", name: "S", color: "#f87171" },
  { key: "A", name: "A", color: "#fb923c" },
  { key: "B", name: "B", color: "#facc15" },
  { key: "C", name: "C", color: "#4ade80" },
  { key: "D", name: "D", color: "#60a5fa" },
];

function tierRowStyle(color: string) {
  return {
    backgroundColor: `${color}22`,
    borderColor: `${color}80`,
  };
}

export default function TierListEditorPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { user, isLoading } = useAuth();

  const [tierList, setTierList] = useState<TierList | null>(null);
  const [tiers, setTiers] = useState<CustomTier[]>(DEFAULT_TIERS);
  const [entries, setEntries] = useState<Map<string, string>>(new Map());
  const [allItems, setAllItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [editTitle, setEditTitle] = useState(false);
  const [title, setTitle] = useState("");
  const [isPublic, setIsPublic] = useState(true);
  const [search, setSearch] = useState("");
  const [showTierConfig, setShowTierConfig] = useState(false);
  const [sectionName, setSectionName] = useState<string | null>(null);

  useEffect(() => {
    if (!isLoading && !user) router.replace(`/auth/login?redirect=/tierlists/${id}`);
  }, [isLoading, user, router, id]);

  useEffect(() => {
    if (!user) return;
    tierlistsApi
      .get(id)
      .then(async (res) => {
        const data = res.data.data as TierList;
        setTierList(data);
        setTitle(data.title);
        setIsPublic(data.is_public);
        if (Array.isArray(data.tiers) && data.tiers.length > 0) {
          setTiers(data.tiers);
        }
        const map = new Map<string, string>();
        for (const e of data.entries) map.set(e.item_id, e.tier);
        setEntries(map);
        const itemParams: { game_id: string; section_id?: string } = { game_id: data.game_id };
        if (data.section_id) {
          itemParams.section_id = data.section_id;
          gamesApi.getSection(data.section_id).then((r) => setSectionName(r.data.data.name)).catch(() => {});
        }
        const allItems = await itemsApi.listAll<Item>(itemParams);
        setAllItems(allItems);
      })
      .catch(() => setError("Tier list not found"))
      .finally(() => setLoading(false));
  }, [user, id]);

  const setItemTier = (itemId: string, tier: string | null) => {
    setEntries((prev) => {
      const next = new Map(prev);
      if (tier === null) next.delete(itemId);
      else next.set(itemId, tier);
      return next;
    });
  };

  const save = useCallback(async () => {
    if (!tierList) return;
    setSaving(true);
    try {
      const payload = Array.from(entries.entries()).map(([item_id, tier]) => ({ item_id, tier }));
      await tierlistsApi.upsertEntries(id, payload);
      if (title !== tierList.title || isPublic !== tierList.is_public) {
        await tierlistsApi.update(id, { title, is_public: isPublic, tiers });
        setTierList((prev) => prev ? { ...prev, title, is_public: isPublic, tiers } : prev);
      } else {
        await tierlistsApi.update(id, { tiers });
        setTierList((prev) => prev ? { ...prev, tiers } : prev);
      }
    } finally {
      setSaving(false);
    }
  }, [tierList, entries, id, title, isPublic, tiers]);

  const addTier = () => {
    const key = `T${tiers.length + 1}`;
    setTiers((prev) => [...prev, { key, name: key, color: "#a78bfa" }]);
  };

  const removeTier = (key: string) => {
    setTiers((prev) => prev.filter((t) => t.key !== key));
    setEntries((prev) => {
      const next = new Map(prev);
      for (const [itemId, tier] of Array.from(next.entries())) {
        if (tier === key) next.delete(itemId);
      }
      return next;
    });
  };

  const updateTier = (key: string, field: "name" | "color", value: string) => {
    setTiers((prev) => prev.map((t) => t.key === key ? { ...t, [field]: value } : t));
  };

  const filteredItems = allItems.filter((item) => {
    const name = (item.data?.name as string ?? item.slug).toLowerCase();
    return name.includes(search.toLowerCase());
  });

  const untieredItems = filteredItems.filter((item) => !entries.has(item.id));

  if (isLoading || loading) {
    return (
      <main className="flex min-h-[calc(100vh-57px)] items-center justify-center">
        <div className="text-gray-400 animate-pulse">Loading…</div>
      </main>
    );
  }

  if (error || !tierList) {
    return (
      <main className="max-w-4xl mx-auto px-6 py-10">
        <p className="text-red-400">{error || "Not found"}</p>
        <Link href="/tierlists" className="text-sm text-gray-400 hover:text-white mt-4 inline-block">← Back</Link>
      </main>
    );
  }

  return (
    <main className="max-w-5xl mx-auto px-6 py-10">
      {/* Header */}
      <div className="flex items-start justify-between mb-8 gap-4">
        <div className="flex-1">
          {editTitle ? (
            <input
              autoFocus
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={() => setEditTitle(false)}
              onKeyDown={(e) => e.key === "Enter" && setEditTitle(false)}
              className="text-2xl font-semibold bg-transparent border-b border-white focus:outline-none w-full max-w-sm"
            />
          ) : (
            <h1
              className="text-3xl font-semibold cursor-pointer hover:opacity-80"
              onClick={() => setEditTitle(true)}
              title="Click to rename"
            >
              {title}
            </h1>
          )}
          <div className="flex items-center gap-4 mt-2">
            <label className="flex items-center gap-2 text-sm text-gray-400 cursor-pointer">
              <input type="checkbox" checked={isPublic} onChange={(e) => setIsPublic(e.target.checked)} />
              Public
            </label>
            {tierList.is_public && (
              <Link href={`/tierlists/share/${tierList.share_slug}`} className="text-xs text-gray-400 hover:text-white" target="_blank">
                View share link ↗
              </Link>
            )}
            <button
              onClick={() => setShowTierConfig((v) => !v)}
              className="text-xs text-gray-400 hover:text-white transition"
            >
              {showTierConfig ? "Hide tier config ▲" : "Configure tiers ▼"}
            </button>
            {sectionName && (
              <span className="text-xs px-2 py-0.5 rounded bg-gray-800 border border-gray-700 text-gray-300">
                {sectionName} only
              </span>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={save}
            disabled={saving}
            className="px-5 py-2 bg-white text-black rounded-lg text-sm font-semibold hover:bg-gray-200 transition disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save"}
          </button>
          <Link href="/tierlists" className="px-5 py-2 border border-gray-700 rounded-lg text-sm hover:border-white transition">
            Back
          </Link>
        </div>
      </div>

      {/* Tier configuration panel */}
      {showTierConfig && (
        <div className="mb-6 rounded-xl border border-gray-700 bg-gray-900/60 p-4">
          <h2 className="text-sm font-semibold text-gray-300 mb-3">Tier configuration</h2>
          <div className="space-y-2">
            {tiers.map((t) => (
              <div key={t.key} className="flex items-center gap-3">
                <input
                  type="color"
                  value={t.color}
                  onChange={(e) => updateTier(t.key, "color", e.target.value)}
                  className="w-8 h-8 rounded cursor-pointer border-0 bg-transparent"
                  title="Pick tier color"
                />
                <input
                  type="text"
                  value={t.name}
                  onChange={(e) => updateTier(t.key, "name", e.target.value)}
                  maxLength={20}
                  className="flex-1 px-2 py-1 rounded bg-gray-800 border border-gray-700 text-sm focus:outline-none focus:border-white"
                  placeholder="Tier label"
                />
                <button
                  onClick={() => removeTier(t.key)}
                  className="text-xs text-red-400 hover:text-red-300 px-2 py-1 rounded border border-gray-700 hover:border-red-800 transition"
                  disabled={tiers.length <= 1}
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
          <button
            onClick={addTier}
            className="mt-3 text-xs px-3 py-1.5 rounded border border-gray-700 hover:border-white transition"
          >
            + Add tier
          </button>
        </div>
      )}

      {/* Tier rows */}
      <div className="space-y-3 mb-8">
        {tiers.map((tier) => {
          const tieredItems = allItems.filter((item) => entries.get(item.id) === tier.key);
          return (
            <div key={tier.key} className="rounded-xl border p-3" style={tierRowStyle(tier.color)}>
              <div className="flex items-center gap-3">
                <div
                  className="w-10 text-lg font-semibold flex-shrink-0 text-center"
                  style={{ color: tier.color }}
                >
                  {tier.name}
                </div>
                <div className="flex flex-wrap gap-2 flex-1 min-h-[56px]">
                  {tieredItems.map((item) => {
                    const name = (item.data?.name as string) ?? item.slug;
                    const img = item.data?.image_url as string | undefined;
                    return (
                      <div
                        key={item.id}
                        className="relative group cursor-pointer"
                        onClick={() => setItemTier(item.id, null)}
                        title={`Remove ${name} from tier`}
                      >
                        <SafeImage src={img} alt={name} width={48} height={48} className="w-12 h-12 rounded-lg object-cover" fallback={
                          <div className="w-12 h-12 rounded-lg bg-gray-700 flex items-center justify-center text-lg font-semibold text-gray-400">
                            {name[0]?.toUpperCase()}
                          </div>
                        } />
                        <div className="absolute inset-0 rounded-lg bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center text-xs font-semibold text-white transition">
                          ✕
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Item pool */}
      <div className="border-t border-gray-800 pt-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-sm text-gray-400">
            Untiered items ({untieredItems.length})
          </h2>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter items…"
            className="px-3 py-1.5 rounded-lg bg-gray-900 border border-gray-700 text-sm focus:outline-none focus:border-white w-48"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          {untieredItems.map((item) => {
            const name = (item.data?.name as string) ?? item.slug;
            const img = item.data?.image_url as string | undefined;
            return (
              <div key={item.id} className="relative group">
                <div title={name}>
                  <SafeImage src={img} alt={name} width={48} height={48} className="w-12 h-12 rounded-lg object-cover" fallback={
                    <div className="w-12 h-12 rounded-lg bg-gray-800 flex items-center justify-center text-lg font-semibold text-gray-600">
                      {name[0]?.toUpperCase()}
                    </div>
                  } />
                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 hidden group-hover:flex gap-0.5 bg-gray-900 border border-gray-700 rounded-lg p-1 z-10">
                    {tiers.map((t) => (
                      <button
                        key={t.key}
                        onClick={() => setItemTier(item.id, t.key)}
                        className="w-7 h-7 rounded text-xs font-semibold hover:bg-gray-700 transition"
                        style={{ color: t.color }}
                      >
                        {t.name.slice(0, 2)}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
          {untieredItems.length === 0 && (
            <p className="text-sm text-gray-500">All items have been tiered.</p>
          )}
        </div>
        <p className="text-xs text-gray-600 mt-3">Hover an item and pick a tier to assign it.</p>
      </div>
    </main>
  );
}
