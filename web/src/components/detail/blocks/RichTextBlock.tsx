"use client";

import type { ItemPageBundle } from "@/lib/seo";
import type { RichTextConfig } from "@/lib/pageLayout";

// A heading plus a block of text — either pulled from an item field
// (description, lore) or static copy typed into the template. Renders nothing
// when the source field is empty, so a shared template stays clean for items
// that haven't filled that field in.
export function RichTextBlock({
  config,
  bundle,
}: {
  config?: Record<string, unknown>;
  bundle: ItemPageBundle;
}) {
  const c = (config ?? {}) as RichTextConfig;
  const data = bundle.item.data as Record<string, unknown>;
  const text = c.source_field
    ? (typeof data[c.source_field] === "string" ? (data[c.source_field] as string) : "")
    : (c.static_text ?? "");
  if (!text) return null;

  const style = c.style ?? "plain";
  return (
    <section className="mb-6">
      {c.title && (
        <h2 className="text-sm font-semibold text-gray-400 mb-2 uppercase tracking-wide">{c.title}</h2>
      )}
      {style === "quote" ? (
        <p className="text-gray-300 text-sm leading-relaxed border-l-2 border-amber-500/60 pl-4 italic">{text}</p>
      ) : (
        <p className="text-gray-300 text-sm leading-relaxed whitespace-pre-line">{text}</p>
      )}
    </section>
  );
}
