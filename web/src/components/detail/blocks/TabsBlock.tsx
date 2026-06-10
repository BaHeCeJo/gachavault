"use client";

import { useState, type ReactNode } from "react";
import type { PageBlock, TabsConfig } from "@/lib/pageLayout";

// A tabbed container. Each tab holds its own list of child blocks, rendered via
// the renderBlock callback the DetailRenderer passes down (so the renderer
// stays the single source of block→component mapping). Client-only state for
// the active tab.
export function TabsBlock({
  config,
  renderBlock,
}: {
  config?: Record<string, unknown>;
  renderBlock: (block: PageBlock) => ReactNode;
}) {
  const c = (config ?? {}) as TabsConfig;
  const tabs = (c.tabs ?? []).filter((t) => t && Array.isArray(t.blocks));
  const [active, setActive] = useState(0);
  if (tabs.length === 0) return null;

  const idx = active < tabs.length ? active : 0;
  const current = tabs[idx];

  return (
    <div className="mb-8">
      <div className="flex gap-1 border-b border-gray-800 mb-4 overflow-x-auto">
        {tabs.map((t, i) => (
          <button
            key={t.id ?? i}
            type="button"
            onClick={() => setActive(i)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition whitespace-nowrap ${
              i === idx ? "border-amber-500 text-amber-300" : "border-transparent text-gray-400 hover:text-gray-200"
            }`}
          >
            {t.label || `Tab ${i + 1}`}
          </button>
        ))}
      </div>
      <div>{current.blocks.map((b) => renderBlock(b))}</div>
    </div>
  );
}
