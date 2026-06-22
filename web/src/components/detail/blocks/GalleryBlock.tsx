"use client";

import { SafeImage } from "@/components/SafeImage";
import type { ItemPageBundle } from "@/lib/seo";
import type { GalleryConfig } from "@/lib/pageLayout";

// A grid of images pulled from one or more image fields (each field may hold a
// single url or an array of urls).
export function GalleryBlock({
  config,
  bundle,
}: {
  config?: Record<string, unknown>;
  bundle: ItemPageBundle;
}) {
  const c = (config ?? {}) as GalleryConfig;
  const data = bundle.item.data as Record<string, unknown>;

  const urls: string[] = [];
  for (const key of c.image_fields ?? []) {
    const v = data[key];
    if (typeof v === "string" && v) urls.push(v);
    else if (Array.isArray(v)) for (const u of v) if (typeof u === "string" && u) urls.push(u);
  }
  if (urls.length === 0) return null;

  const columns = c.columns ?? 3;
  const colClass =
    columns === 1 ? "grid-cols-1"
    : columns === 2 ? "grid-cols-2"
    : columns === 4 ? "grid-cols-2 sm:grid-cols-4"
    : "grid-cols-2 sm:grid-cols-3";
  // Tile shape. Default 16:9 (cover) preserves the prior look; square/portrait
  // suit character art. `contain` letterboxes instead of cropping — needed for
  // full-body splashes that a cover-crop would slice through.
  const aspectClass = c.aspect === "square" ? "aspect-square" : c.aspect === "portrait" ? "aspect-[3/4]" : "aspect-video";
  const fitClass = c.fit === "contain" ? "object-contain" : "object-cover";

  return (
    <section className="mb-8">
      {c.title && <h2 className="text-xl font-semibold mb-4">{c.title}</h2>}
      <div className={`grid ${colClass} gap-3`}>
        {urls.map((u, i) => (
          <div key={i} className={`relative rounded-lg overflow-hidden border border-gray-800 bg-gray-900 ${aspectClass}`}>
            <SafeImage src={u} alt="" fill sizes="(min-width: 768px) 500px, 100vw" className={fitClass} fallback={<div className="h-full bg-gray-800" />} />
          </div>
        ))}
      </div>
    </section>
  );
}
