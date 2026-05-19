"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { mediaApi } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";

interface Asset {
  id: string;
  filename: string;
  original_filename: string;
  mime_type: string;
  size_bytes: number;
  public_url: string;
  uploaded_by: string | null;
  created_at: string;
}

function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export default function AdminMediaPage() {
  const { user, isLoading } = useAuth();
  const router = useRouter();

  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isLoading && (!user || (user.role !== "admin" && user.role !== "superadmin"))) {
      router.replace("/");
    }
  }, [isLoading, user, router]);

  useEffect(() => {
    if (!user) return;
    mediaApi
      .list()
      .then((r) => setAssets(r.data.data ?? []))
      .catch(() => setError("Failed to load media assets"))
      .finally(() => setLoading(false));
  }, [user]);

  async function handleDelete(id: string) {
    if (!confirm("Delete this file permanently?")) return;
    setDeleting(id);
    try {
      await mediaApi.delete(id);
      setAssets((prev) => prev.filter((a) => a.id !== id));
    } catch {
      setError("Failed to delete asset");
    } finally {
      setDeleting(null);
    }
  }

  if (isLoading || loading) {
    return (
      <main className="max-w-6xl mx-auto px-6 py-10">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="h-32 rounded-xl bg-gray-800 animate-pulse" />
          ))}
        </div>
      </main>
    );
  }

  return (
    <main className="max-w-6xl mx-auto px-6 py-10 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Media Library</h1>
          <p className="text-sm text-gray-400 mt-1">{assets.length} file{assets.length !== 1 ? "s" : ""}</p>
        </div>
        <Link href="/admin" className="text-sm text-gray-400 hover:text-white">← Admin</Link>
      </div>

      {error && (
        <div className="rounded-lg bg-red-950 border border-red-800 text-red-300 px-4 py-3 text-sm">
          {error}
        </div>
      )}

      {assets.length === 0 ? (
        <p className="text-gray-400">No files uploaded yet.</p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {assets.map((asset) => (
            <div
              key={asset.id}
              className="group relative rounded-xl border border-gray-800 bg-gray-900 overflow-hidden"
            >
              {asset.mime_type.startsWith("image/") ? (
                <img
                  src={asset.public_url}
                  alt={asset.original_filename}
                  className="w-full h-32 object-cover"
                />
              ) : (
                <div className="w-full h-32 flex items-center justify-center text-gray-500 text-xs bg-gray-800">
                  {asset.mime_type}
                </div>
              )}

              <div className="p-2">
                <p className="text-xs text-gray-300 truncate" title={asset.original_filename}>
                  {asset.original_filename}
                </p>
                <p className="text-xs text-gray-500 mt-0.5">{formatBytes(asset.size_bytes)}</p>
                <p className="text-xs text-gray-600 mt-0.5">
                  {new Date(asset.created_at).toLocaleDateString()}
                </p>
              </div>

              <div className="absolute top-1 right-1 flex gap-1 opacity-0 group-hover:opacity-100 transition">
                <a
                  href={asset.public_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded bg-black/70 px-2 py-0.5 text-xs text-white hover:bg-black"
                >
                  View
                </a>
                <button
                  onClick={() => handleDelete(asset.id)}
                  disabled={deleting === asset.id}
                  className="rounded bg-red-900/80 px-2 py-0.5 text-xs text-red-200 hover:bg-red-800 disabled:opacity-50"
                >
                  {deleting === asset.id ? "…" : "Delete"}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
