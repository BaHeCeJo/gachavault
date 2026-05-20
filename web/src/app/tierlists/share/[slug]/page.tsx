"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { tierlistsApi, itemsApi } from "@/lib/api";
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
  upvote_count: number;
  created_at: string;
  tiers: CustomTier[];
  entries: TierEntry[];
  user_upvoted: boolean;
}
interface Item { id: string; slug: string; data: Record<string, unknown> }
interface Comment {
  id: string;
  user_id: string;
  username: string;
  body: string;
  created_at: string;
}

const DEFAULT_TIERS: CustomTier[] = [
  { key: "S", name: "S", color: "#f87171" },
  { key: "A", name: "A", color: "#fb923c" },
  { key: "B", name: "B", color: "#facc15" },
  { key: "C", name: "C", color: "#4ade80" },
  { key: "D", name: "D", color: "#60a5fa" },
];

export default function SharedTierListPage() {
  const { slug } = useParams<{ slug: string }>();
  const { user } = useAuth();
  const [tierList, setTierList] = useState<TierList | null>(null);
  const [tiers, setTiers] = useState<CustomTier[]>(DEFAULT_TIERS);
  const [entriesMap, setEntriesMap] = useState<Map<string, string>>(new Map());
  const [itemsMap, setItemsMap] = useState<Map<string, Item>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [upvoting, setUpvoting] = useState(false);
  const [comments, setComments] = useState<Comment[]>([]);
  const [commentBody, setCommentBody] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    tierlistsApi
      .getByShareSlug(slug)
      .then(async (res) => {
        const data = res.data.data as TierList;
        setTierList(data);
        if (Array.isArray(data.tiers) && data.tiers.length > 0) {
          setTiers(data.tiers);
        }
        const map = new Map<string, string>();
        for (const e of data.entries) map.set(e.item_id, e.tier);
        setEntriesMap(map);
        if (map.size > 0) {
          const itemsRes = await itemsApi.list({ game_id: data.game_id, limit: 200, offset: 0 });
          const items: Item[] = itemsRes.data.data ?? [];
          setItemsMap(new Map(items.map((i) => [i.id, i])));
        }
        // Load comments
        tierlistsApi.listComments(data.id).then((r) => setComments(r.data.data ?? [])).catch(() => {});
      })
      .catch(() => setError("Tier list not found or no longer public"))
      .finally(() => setLoading(false));
  }, [slug]);

  const handleComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tierList || !user || !commentBody.trim()) return;
    setSubmitting(true);
    try {
      const res = await tierlistsApi.createComment(tierList.id, commentBody.trim());
      setComments((prev) => [...prev, res.data.data]);
      setCommentBody("");
    } catch {
      // silently fail
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteComment = async (commentId: string) => {
    if (!tierList) return;
    try {
      await tierlistsApi.deleteComment(tierList.id, commentId);
      setComments((prev) => prev.filter((c) => c.id !== commentId));
    } catch {
      // silently fail
    }
  };

  const handleUpvote = async () => {
    if (!tierList || !user || upvoting) return;
    setUpvoting(true);
    try {
      if (tierList.user_upvoted) {
        const res = await tierlistsApi.removeUpvote(tierList.id);
        setTierList((prev) => prev ? { ...prev, upvote_count: res.data.data.upvote_count, user_upvoted: false } : prev);
      } else {
        const res = await tierlistsApi.upvote(tierList.id);
        setTierList((prev) => prev ? { ...prev, upvote_count: res.data.data.upvote_count, user_upvoted: true } : prev);
      }
    } catch {
      // silently fail
    } finally {
      setUpvoting(false);
    }
  };

  if (loading) {
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
        <Link href="/tierlists" className="text-sm text-gray-400 hover:text-white mt-4 inline-block">
          ← Browse tier lists
        </Link>
      </main>
    );
  }

  return (
    <main className="max-w-4xl mx-auto px-6 py-10">
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">{tierList.title}</h1>
          <p className="text-sm text-gray-500 mt-1">
            Shared tier list · {new Date(tierList.created_at).toLocaleDateString()}
          </p>
        </div>

        {/* Upvote button */}
        <button
          onClick={handleUpvote}
          disabled={!user || upvoting}
          title={user ? (tierList.user_upvoted ? "Remove upvote" : "Upvote this tier list") : "Sign in to upvote"}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl border text-sm font-semibold transition ${
            tierList.user_upvoted
              ? "border-violet-500 text-violet-400 bg-violet-950/40 hover:bg-violet-950/60"
              : "border-gray-700 text-gray-300 hover:border-gray-500"
          } disabled:opacity-50`}
        >
          <span>{tierList.user_upvoted ? "▲" : "△"}</span>
          <span>{tierList.upvote_count}</span>
        </button>
      </div>

      <div className="space-y-3">
        {tiers.map((tier) => {
          const tieredItems = Array.from(entriesMap.entries())
            .filter(([, t]) => t === tier.key)
            .map(([itemId]) => itemsMap.get(itemId))
            .filter(Boolean) as Item[];

          if (tieredItems.length === 0) return null;

          return (
            <div
              key={tier.key}
              className="rounded-xl border p-4"
              style={{ backgroundColor: `${tier.color}22`, borderColor: `${tier.color}80` }}
            >
              <div className="flex items-center gap-4">
                <div
                  className="w-10 text-xl font-black flex-shrink-0 text-center"
                  style={{ color: tier.color }}
                >
                  {tier.name}
                </div>
                <div className="flex flex-wrap gap-2">
                  {tieredItems.map((item) => {
                    const name = (item.data?.name as string) ?? item.slug;
                    const img = item.data?.image_url as string | undefined;
                    return (
                      <Link key={item.id} href={`/items/${item.id}`} title={name} className="group relative">
                        <SafeImage src={img} alt={name} width={56} height={56} className="w-14 h-14 rounded-lg object-cover" fallback={
                          <div className="w-14 h-14 rounded-lg bg-gray-700 flex items-center justify-center text-xl font-bold text-gray-400">
                            {name[0]?.toUpperCase()}
                          </div>
                        } />
                        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 hidden group-hover:block bg-gray-900 border border-gray-700 rounded px-2 py-0.5 text-xs whitespace-nowrap z-10">
                          {name}
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {entriesMap.size === 0 && (
        <p className="text-gray-400">This tier list has no items.</p>
      )}

      {/* Comments section */}
      <section className="mt-10 border-t border-gray-800 pt-8">
        <h2 className="text-lg font-semibold mb-4">
          Comments {comments.length > 0 && <span className="text-gray-500 font-normal text-sm">({comments.length})</span>}
        </h2>

        {comments.length > 0 ? (
          <div className="space-y-4 mb-6">
            {comments.map((c) => (
              <div key={c.id} className="flex gap-3">
                <div className="w-8 h-8 rounded-full bg-gray-700 flex items-center justify-center text-sm font-bold flex-shrink-0">
                  {c.username[0]?.toUpperCase()}
                </div>
                <div className="flex-1">
                  <div className="flex items-baseline gap-2">
                    <span className="text-sm font-medium">{c.username}</span>
                    <span className="text-xs text-gray-500">
                      {new Date(c.created_at).toLocaleDateString()}
                    </span>
                    {user && (user.id === c.user_id || user.role === "admin" || user.role === "superadmin") && (
                      <button
                        onClick={() => handleDeleteComment(c.id)}
                        className="text-xs text-gray-600 hover:text-red-400 transition ml-auto"
                      >
                        Delete
                      </button>
                    )}
                  </div>
                  <p className="text-sm text-gray-300 mt-1 whitespace-pre-wrap">{c.body}</p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-gray-500 mb-6">No comments yet.</p>
        )}

        {user ? (
          <form onSubmit={handleComment} className="space-y-2">
            <textarea
              value={commentBody}
              onChange={(e) => setCommentBody(e.target.value)}
              placeholder="Add a comment…"
              maxLength={2000}
              rows={3}
              className="w-full px-4 py-3 rounded-xl bg-gray-900 border border-gray-700 text-sm focus:outline-none focus:border-white resize-none"
            />
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-600">{commentBody.length}/2000</span>
              <button
                type="submit"
                disabled={!commentBody.trim() || submitting}
                className="px-5 py-2 bg-indigo-600 text-white rounded-lg text-sm font-semibold hover:bg-indigo-500 transition disabled:opacity-50"
              >
                {submitting ? "Posting…" : "Comment"}
              </button>
            </div>
          </form>
        ) : (
          <p className="text-sm text-gray-500">
            <Link href={`/auth/login?redirect=/tierlists/share/${slug}`} className="text-white hover:underline">
              Sign in
            </Link>{" "}
            to leave a comment.
          </p>
        )}
      </section>
    </main>
  );
}
