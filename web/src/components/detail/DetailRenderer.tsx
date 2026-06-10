"use client";

import type { ReactNode } from "react";
import { type AttrMap } from "@/lib/attrs";
import type { ItemPageBundle } from "@/lib/seo";
import type { ColumnsConfig, DividerConfig, PageBlock, PageLayout } from "@/lib/pageLayout";
import type { ItemRelations } from "@/components/detail/types";
import { LegacyDetailLayout } from "@/components/detail/LegacyDetailLayout";
import { HeroBlock } from "@/components/detail/blocks/HeroBlock";
import { StatsTableBlock } from "@/components/detail/blocks/StatsTableBlock";
import { RichTextBlock } from "@/components/detail/blocks/RichTextBlock";
import { ItemGridBlock } from "@/components/detail/blocks/ItemGridBlock";
import { GalleryBlock } from "@/components/detail/blocks/GalleryBlock";
import { RatingsBlock } from "@/components/detail/blocks/RatingsBlock";
import { SkillsBlock } from "@/components/detail/blocks/SkillsBlock";
import { TabsBlock } from "@/components/detail/blocks/TabsBlock";

interface BlockProps {
  block: PageBlock;
  bundle: ItemPageBundle;
  preview: boolean;
  relations: ItemRelations;
  attrMap: AttrMap;
}

// Two side-by-side columns of child blocks (rendered via renderBlock so the
// renderer stays the single block→component map). Stacks on mobile.
function ColumnsBlock({ config, renderBlock }: { config?: Record<string, unknown>; renderBlock: (b: PageBlock) => ReactNode }) {
  const c = (config ?? {}) as ColumnsConfig;
  const cols = Array.isArray(c.columns) ? c.columns : [];
  if (cols.length === 0) return null;
  const ratio = c.ratio ?? "1-1";
  const basis = ratio === "1-2" ? ["md:w-1/3", "md:w-2/3"] : ratio === "2-1" ? ["md:w-2/3", "md:w-1/3"] : ["md:w-1/2", "md:w-1/2"];
  return (
    <div className="mb-8 flex flex-col md:flex-row gap-6">
      {cols.slice(0, 2).map((colBlocks, i) => (
        <div key={i} className={`w-full ${basis[i] ?? "md:w-1/2"}`}>
          {(Array.isArray(colBlocks) ? colBlocks : []).map((b) => renderBlock(b))}
        </div>
      ))}
    </div>
  );
}

function DividerBlock({ config }: { config?: Record<string, unknown> }) {
  const c = (config ?? {}) as DividerConfig;
  if (c.label) {
    return (
      <div className="my-8 flex items-center gap-3">
        <div className="h-px flex-1 bg-gray-800" />
        <span className="text-xs uppercase tracking-wide text-gray-500">{c.label}</span>
        <div className="h-px flex-1 bg-gray-800" />
      </div>
    );
  }
  return <hr className="my-8 border-gray-800" />;
}

// Maps one block to its component. Unknown types render nothing, so a layout
// authored by a newer admin build degrades gracefully on an older frontend.
function BlockRenderer({ block, bundle, preview, relations, attrMap }: BlockProps) {
  const renderChild = (b: PageBlock) => (
    <BlockRenderer key={b.id} block={b} bundle={bundle} preview={preview} relations={relations} attrMap={attrMap} />
  );

  switch (block.type) {
    case "legacy":
      return <LegacyDetailLayout bundle={bundle} preview={preview} relations={relations} attrMap={attrMap} />;
    case "hero":
      return <HeroBlock config={block.config} bundle={bundle} attrMap={attrMap} />;
    case "stats_table":
      return <StatsTableBlock config={block.config} bundle={bundle} attrMap={attrMap} relations={relations} preview={preview} />;
    case "rich_text":
      return <RichTextBlock config={block.config} bundle={bundle} />;
    case "item_grid":
      return <ItemGridBlock config={block.config} bundle={bundle} relations={relations} />;
    case "gallery":
      return <GalleryBlock config={block.config} bundle={bundle} />;
    case "ratings":
      return <RatingsBlock config={block.config} bundle={bundle} />;
    case "skills":
      return <SkillsBlock config={block.config} bundle={bundle} />;
    case "divider":
      return <DividerBlock config={block.config} />;
    case "columns":
      return <ColumnsBlock config={block.config} renderBlock={renderChild} />;
    case "tabs":
      return <TabsBlock config={block.config} renderBlock={renderChild} />;
    default:
      return null;
  }
}

// Renders a templated detail page from an ordered block list. Owns the same
// page container the legacy layout used, so a single `legacy` block produces
// output identical to the no-template page.
export function DetailRenderer({
  bundle,
  layout,
  preview,
  relations,
  attrMap,
}: {
  bundle: ItemPageBundle;
  layout: PageLayout;
  preview: boolean;
  relations: ItemRelations;
  attrMap: AttrMap;
}) {
  return (
    <main className="max-w-5xl mx-auto px-6 py-10">
      {layout.blocks.map((block) => (
        <BlockRenderer
          key={block.id}
          block={block}
          bundle={bundle}
          preview={preview}
          relations={relations}
          attrMap={attrMap}
        />
      ))}
    </main>
  );
}
