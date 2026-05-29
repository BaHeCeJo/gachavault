"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { adminApi, gamesApi } from "@/lib/api";
import { useAdminGuard } from "@/hooks/useAdminGuard";
import { revalidateGame } from "@/lib/revalidate";

interface Game { id: string; slug: string; name: string }
interface ItemRow {
  // Present for rows exported from the system. When provided, the backend
  // treats the row as an update of that exact item. When absent, the row
  // is created.
  id?: string;
  game: string;     // game slug, e.g. "honkai-star-rail"
  section: string;  // section slug, e.g. "characters"
  schema: string;   // schema name, e.g. "Character"
  slug?: string;    // item slug. Auto-derived from data.name if omitted on create.
  data: Record<string, unknown>;
}

interface ImportResult {
  created: number;
  updated: number;
  skipped: number;
  errors: Array<{ slug: string; error: string }>;
  total: number;
}

export default function BulkImportPage() {
  const { user, isLoading } = useAdminGuard("/admin/items/import");
  const fileRef = useRef<HTMLInputElement>(null);

  const [games, setGames] = useState<Game[]>([]);
  const [parsed, setParsed] = useState<ItemRow[] | null>(null);
  const [parseError, setParseError] = useState("");
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);

  useEffect(() => {
    if (!user) return;
    gamesApi.list(true).then((r) => setGames(r.data.data ?? [])).catch(() => {});
  }, [user]);

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setParsed(null);
    setParseError("");
    setResult(null);

    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const text = ev.target?.result as string;
        const json = JSON.parse(text);
        const items: ItemRow[] = Array.isArray(json) ? json : json.items ?? json.data ?? [];
        if (!Array.isArray(items) || items.length === 0) {
          setParseError("JSON must be an array of item objects (or have a top-level `items` or `data` array).");
          return;
        }
        if (items.length > 500) {
          setParseError(`Too many items (${items.length}). Maximum 500 per import.`);
          return;
        }
        // Basic validation — sample first 5 rows for missing required fields.
        for (let i = 0; i < Math.min(items.length, 5); i++) {
          const row = items[i];
          if (!row.game || !row.section || !row.schema) {
            setParseError(`Item at index ${i} is missing required fields: game, section, schema`);
            return;
          }
          // For create rows (no id), we need either a slug or a data.name to derive one.
          if (!row.id && !row.slug && !row.data?.name) {
            setParseError(`Item at index ${i} has no id and no slug or data.name — cannot create`);
            return;
          }
        }
        setParsed(items);
      } catch {
        setParseError("Invalid JSON. Please upload a valid JSON file.");
      }
    };
    reader.readAsText(file);
  }

  async function handleImport() {
    if (!parsed) return;
    setImporting(true);
    setResult(null);
    try {
      const res = await adminApi.items.bulkImport(parsed);
      setResult(res.data.data);
      // Bulk import may touch multiple games — revalidate every game slug
      // referenced in the batch so each affected /games/<slug> refreshes.
      const touched = Array.from(new Set(parsed.map((r) => r.game).filter(Boolean)));
      for (const g of touched) revalidateGame(g);
      setParsed(null);
      if (fileRef.current) fileRef.current.value = "";
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message ?? "Import failed";
      setParseError(msg);
    } finally {
      setImporting(false);
    }
  }

  const gameName = (slug: string) => games.find((g) => g.slug === slug)?.name ?? slug;

  if (isLoading) return null;

  return (
    <main className="max-w-4xl mx-auto px-6 py-10 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold">Bulk Item Import</h1>
          <p className="text-sm text-gray-400 mt-1">Upload a JSON file to import up to 500 items at once.</p>
        </div>
        <Link href="/admin/items" className="text-sm text-gray-400 hover:text-white">← Items</Link>
      </div>

      {/* Format reference */}
      <div className="rounded-xl border border-gray-800 bg-gray-900 p-4">
        <h2 className="text-sm font-semibold mb-2 text-gray-300">Expected JSON format</h2>
        <pre className="text-xs text-gray-400 overflow-x-auto">
{`[
  {
    "id": "<uuid>",              // optional — present → update, absent → create
    "game": "honkai-star-rail",  // game slug
    "section": "characters",     // section slug
    "schema": "Character",       // schema name
    "slug": "kafka",             // item slug (auto-derived from data.name if omitted)
    "data": {
      "name": "Kafka",
      "rarity": "5",
      "path": "nihility"
    }
  }
]`}
        </pre>
        <p className="text-xs text-gray-500 mt-2">
          Rows with an <code className="text-gray-300">id</code> update that exact item.
          Rows without one create a new item; duplicate slugs in the same game are skipped.
          Tip: use the Export button on the Items admin to generate a roundtrip-ready file.
        </p>
      </div>

      {/* File upload */}
      <div>
        <label className="block text-sm text-gray-300 mb-2">JSON file</label>
        <input
          ref={fileRef}
          type="file"
          accept=".json,application/json"
          onChange={handleFile}
          className="block w-full text-sm text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-gray-800 file:text-gray-200 hover:file:bg-gray-700 file:cursor-pointer"
        />
      </div>

      {parseError && (
        <div className="rounded-lg bg-red-950 border border-red-800 text-red-300 px-4 py-3 text-sm">
          {parseError}
        </div>
      )}

      {/* Preview */}
      {parsed && parsed.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-300">
              Preview — {parsed.length} item{parsed.length !== 1 ? "s" : ""}
            </h2>
            <button
              onClick={handleImport}
              disabled={importing}
              className="px-5 py-2 bg-white text-black rounded-lg text-sm font-semibold hover:bg-gray-200 transition disabled:opacity-50"
            >
              {importing ? "Importing…" : `Import ${parsed.length} items`}
            </button>
          </div>

          <div className="rounded-xl border border-gray-800 overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-gray-900 text-gray-400">
                <tr>
                  <th className="px-3 py-2 text-left">Mode</th>
                  <th className="px-3 py-2 text-left">Slug</th>
                  <th className="px-3 py-2 text-left">Game</th>
                  <th className="px-3 py-2 text-left">Section</th>
                  <th className="px-3 py-2 text-left">Name</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {parsed.slice(0, 20).map((item, i) => (
                  <tr key={i} className="hover:bg-gray-900/50">
                    <td className="px-3 py-2">
                      {item.id ? (
                        <span className="text-amber-400">update</span>
                      ) : (
                        <span className="text-green-400">create</span>
                      )}
                    </td>
                    <td className="px-3 py-2 font-mono text-gray-300">
                      {item.slug ?? (item.data?.name ? `(from "${item.data.name as string}")` : "—")}
                    </td>
                    <td className="px-3 py-2 text-gray-400">{gameName(item.game)}</td>
                    <td className="px-3 py-2 text-gray-400">{item.section}</td>
                    <td className="px-3 py-2 text-gray-400">
                      {(item.data?.name as string) ?? "—"}
                    </td>
                  </tr>
                ))}
                {parsed.length > 20 && (
                  <tr>
                    <td colSpan={5} className="px-3 py-2 text-center text-gray-600">
                      … {parsed.length - 20} more items not shown
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Result */}
      {result && (
        <div className={`rounded-xl border p-5 space-y-2 ${result.errors.length === 0 ? "border-green-800 bg-green-950/30" : "border-yellow-800 bg-yellow-950/20"}`}>
          <h2 className="text-sm font-semibold">Import complete</h2>
          <div className="flex gap-6 text-sm">
            <span className="text-green-400">✓ {result.created} created</span>
            {result.updated > 0 && <span className="text-amber-400">↻ {result.updated} updated</span>}
            {result.skipped > 0 && <span className="text-gray-400">⊘ {result.skipped} skipped (duplicate slugs)</span>}
            {result.errors.length > 0 && <span className="text-red-400">✗ {result.errors.length} errors</span>}
          </div>
          {result.errors.length > 0 && (
            <div className="mt-3 space-y-1">
              {result.errors.map((e, i) => (
                <p key={i} className="text-xs text-red-300">
                  <span className="font-mono">{e.slug}</span>: {e.error}
                </p>
              ))}
            </div>
          )}
        </div>
      )}
    </main>
  );
}
