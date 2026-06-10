"use client";

import { type AttrMap } from "@/lib/attrs";
import type { ItemPageBundle } from "@/lib/seo";
import type { PageBlock, PageLayout } from "@/lib/pageLayout";
import type { ItemRelations } from "@/components/detail/types";
import { LegacyDetailLayout } from "@/components/detail/LegacyDetailLayout";
import { HeroBlock } from "@/components/detail/blocks/HeroBlock";
import { StatsTableBlock } from "@/components/detail/blocks/StatsTableBlock";
import { RichTextBlock } from "@/components/detail/blocks/RichTextBlock";
import { ItemGridBlock } from "@/components/detail/blocks/ItemGridBlock";

interface BlockProps {
  block: PageBlock;
  bundle: ItemPageBundle;
  preview: boolean;
  relations: ItemRelations;
  attrMap: AttrMap;
}

// Maps one block to its component. Stage 1 only handles the `legacy` block
// (the whole fixed page). Unknown types render nothing, so a layout authored
// by a newer admin build degrades gracefully on an older frontend instead of
// throwing.
function BlockRenderer({ block, bundle, preview, relations, attrMap }: BlockProps) {
  switch (block.type) {
    case "legacy":
      return (
        <LegacyDetailLayout
          bundle={bundle}
          preview={preview}
          relations={relations}
          attrMap={attrMap}
        />
      );
    case "hero":
      return <HeroBlock config={block.config} bundle={bundle} attrMap={attrMap} />;
    case "stats_table":
      return <StatsTableBlock config={block.config} bundle={bundle} attrMap={attrMap} relations={relations} preview={preview} />;
    case "rich_text":
      return <RichTextBlock config={block.config} bundle={bundle} />;
    case "item_grid":
      return <ItemGridBlock config={block.config} bundle={bundle} relations={relations} />;
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
