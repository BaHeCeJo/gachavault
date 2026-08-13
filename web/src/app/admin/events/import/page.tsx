"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { eventsApi } from "@/lib/api";
import { useAdminGuard } from "@/hooks/useAdminGuard";
import { revalidateGame } from "@/lib/revalidate";

// Rows are addressed by slug, not id, so a file can be generated from an
// external source (a wiki export, a spreadsheet) without knowing any UUIDs.
interface EventRow {
  game: string; // game slug, e.g. "honkai-star-rail"
  event_type?: string; // "banner" | "version" | "limited_event" | …
  slug: string; // unique per game
  title: string;
  description?: string;
  start_at: string; // ISO 8601, UTC
  end_at?: string | null; // null/absent = open-ended
  timezone?: string;
  data?: Record<string, unknown>;
  is_published?: boolean;
  banner?: string; // banner preset slug
  featured_5?: string[]; // item slugs
  featured_4?: string[];
  featured?: string[];
}

interface ImportResult {
  total: number;
  created: number;
  skipped: number;
  errors: Array<{ slug: string; error: string }>;
  warnings: Array<{ slug: string; warning: string }>;
}

const SAMPLE = `[
  {
    "game": "honkai-star-rail",
    "event_type": "banner",
    "slug": "butterfly-on-swordtip-2023-04-26",
    "title": "Seele",
    "banner": "butterfly-on-swordtip",
    "start_at": "2023-04-25T02:00:00Z",
    "end_at": "2023-05-17T09:59:00Z",
    "timezone": "UTC+8",
    "featured_5": ["seele"],
    "featured_4": ["natasha", "hook", "pela"]
  }
]`;

export default function EventImportPage() {
  const { isLoading } = useAdminGuard("/admin/events/import");
  const fileRef = useRef<HTMLInputElement>(null);

  const [parsed, setParsed] = useState<EventRow[] | null>(null);
  const [parseError, setParseError] = useState("");
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setParsed(null);
    setParseError("");
    setResult(null);

    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const json = JSON.parse(ev.target?.result as string);
        const rows: EventRow[] = Array.isArray(json) ? json : json.events ?? json.data ?? [];
        if (!Array.isArray(rows) || rows.length === 0) {
          setParseError("JSON must be an array of event objects (or have a top-level `events` or `data` array).");
          return;
        }
        if (rows.length > 500) {
          setParseError(`Too many events (${rows.length}). Maximum 500 per import.`);
          return;
        }
        for (let i = 0; i < Math.min(rows.length, 5); i++) {
          const r = rows[i];
          if (!r.game || !r.slug || !r.title || !r.start_at) {
            setParseError(`Event at index ${i} is missing required fields: game, slug, title, start_at`);
            return;
          }
        }
        setParsed(rows);
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
      const res = await eventsApi.bulkImport(parsed);
      setResult(res.data.data);
      for (const g of Array.from(new Set(parsed.map((r) => r.game).filter(Boolean)))) {
        revalidateGame(g);
      }
      setParsed(null);
      if (fileRef.current) fileRef.current.value = "";
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error
          ?.message ?? "Import failed";
      setParseError(msg);
    } finally {
      setImporting(false);
    }
  }

  const fmt = (iso?: string | null) => (iso ? iso.slice(0, 10) : "—");

  if (isLoading) return null;

  return (
    <main className="max-w-4xl mx-auto px-6 py-10 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold">Bulk Event Import</h1>
          <p className="text-sm text-gray-400 mt-1">
            Upload a JSON file to import up to 500 calendar events at once.
          </p>
        </div>
        <Link href="/admin/events" className="text-sm text-gray-400 hover:text-white">
          ← Events
        </Link>
      </div>

      <div className="rounded-xl border border-gray-800 bg-gray-900 p-4">
        <h2 className="text-sm font-semibold mb-2 text-gray-300">Expected JSON format</h2>
        <pre className="text-xs text-gray-400 overflow-x-auto">{SAMPLE}</pre>
        <p className="text-xs text-gray-500 mt-2">
          Everything is addressed by slug. <code className="text-gray-300">banner</code> is the slug of a
          banner preset in the game&apos;s Banners section; <code className="text-gray-300">featured_5</code>{" "}
          and <code className="text-gray-300">featured_4</code> are item slugs. Times are ISO 8601 in UTC —{" "}
          <code className="text-gray-300">timezone</code> is only the label shown to readers. An event whose
          slug already exists in that game is skipped rather than overwritten, so re-running a file is safe.
          Item slugs that don&apos;t resolve are reported as warnings and the event is still created.
        </p>
      </div>

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

      {parsed && parsed.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-300">
              Preview — {parsed.length} event{parsed.length !== 1 ? "s" : ""}
            </h2>
            <button
              onClick={handleImport}
              disabled={importing}
              className="px-5 py-2 bg-white text-black rounded-lg text-sm font-semibold hover:bg-gray-200 transition disabled:opacity-50"
            >
              {importing ? "Importing…" : `Import ${parsed.length} events`}
            </button>
          </div>

          <div className="rounded-xl border border-gray-800 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-gray-900 text-gray-400">
                  <tr>
                    <th className="px-3 py-2 text-left">Slug</th>
                    <th className="px-3 py-2 text-left">Title</th>
                    <th className="px-3 py-2 text-left">Type</th>
                    <th className="px-3 py-2 text-left">Starts</th>
                    <th className="px-3 py-2 text-left">Ends</th>
                    <th className="px-3 py-2 text-left">Banner</th>
                    <th className="px-3 py-2 text-right">Featured</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800">
                  {parsed.slice(0, 20).map((r, i) => (
                    <tr key={i} className="hover:bg-gray-900/50">
                      <td className="px-3 py-2 font-mono text-gray-300">{r.slug}</td>
                      <td className="px-3 py-2 text-gray-400">{r.title}</td>
                      <td className="px-3 py-2 text-gray-500">{r.event_type ?? "banner"}</td>
                      <td className="px-3 py-2 text-gray-400">{fmt(r.start_at)}</td>
                      <td className="px-3 py-2 text-gray-400">{fmt(r.end_at)}</td>
                      <td className="px-3 py-2 text-gray-500">{r.banner ?? "—"}</td>
                      <td className="px-3 py-2 text-right text-gray-500">
                        {(r.featured_5?.length ?? 0) +
                          (r.featured_4?.length ?? 0) +
                          (r.featured?.length ?? 0)}
                      </td>
                    </tr>
                  ))}
                  {parsed.length > 20 && (
                    <tr>
                      <td colSpan={7} className="px-3 py-2 text-center text-gray-600">
                        … {parsed.length - 20} more events not shown
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {result && (
        <div
          className={`rounded-xl border p-5 space-y-2 ${
            result.errors.length === 0
              ? "border-green-800 bg-green-950/30"
              : "border-yellow-800 bg-yellow-950/20"
          }`}
        >
          <h2 className="text-sm font-semibold">Import complete</h2>
          <div className="flex flex-wrap gap-6 text-sm">
            <span className="text-green-400">✓ {result.created} created</span>
            {result.skipped > 0 && (
              <span className="text-gray-400">⊘ {result.skipped} skipped (slug already exists)</span>
            )}
            {result.warnings?.length > 0 && (
              <span className="text-amber-400">⚠ {result.warnings.length} with unknown items</span>
            )}
            {result.errors.length > 0 && (
              <span className="text-red-400">✗ {result.errors.length} errors</span>
            )}
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
          {result.warnings?.length > 0 && (
            <div className="mt-3 space-y-1">
              {result.warnings.map((w, i) => (
                <p key={i} className="text-xs text-amber-300">
                  <span className="font-mono">{w.slug}</span>: {w.warning}
                </p>
              ))}
            </div>
          )}
        </div>
      )}
    </main>
  );
}
