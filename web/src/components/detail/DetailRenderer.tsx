"use client";

import type { ReactNode } from "react";
import { type AttrMap } from "@/lib/attrs";
import type { ItemPageBundle } from "@/lib/seo";
import type {
  ColumnsConfig,
  DividerConfig,
  GalleryConfig,
  PageBlock,
  PageLayout,
  RatingsConfig,
  RichTextConfig,
  SkillsConfig,
  StatsTableConfig,
} from "@/lib/pageLayout";
import type { ItemRelations, SchemaField } from "@/components/detail/types";
import { HIDDEN_IN_DETAILS } from "@/components/detail/FieldValue";
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
        {/* gray-400 (not gray-500): gray-500 on the near-black page bg is 4.09:1,
            just under the WCAG AA 4.5:1 floor for this xs text. */}
        <span className="text-xs uppercase tracking-wide text-gray-400">{c.label}</span>
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

// Mirrors each content block's own "render nothing when empty" guard so the
// renderer can tell, ahead of render, whether a block will actually show
// anything. MUST stay in sync with the matching component in blocks/. Block
// types not handled here (hero, item_grid, columns, tabs, legacy) are treated
// as always-present: being conservative here can only keep a divider a stricter
// check would drop — it can never hide real content.
function blockHasContent(block: PageBlock, bundle: ItemPageBundle, relations: ItemRelations): boolean {
  const data = bundle.item.data as Record<string, unknown>;
  const nonEmpty = (v: unknown) => v !== undefined && v !== null && v !== "";
  switch (block.type) {
    case "rich_text": {
      const c = (block.config ?? {}) as RichTextConfig;
      const text = c.source_field
        ? typeof data[c.source_field] === "string"
          ? (data[c.source_field] as string)
          : ""
        : (c.static_text ?? "");
      return Boolean(text);
    }
    case "skills": {
      const c = (block.config ?? {}) as SkillsConfig;
      const raw = c.list_field ? data[c.list_field] : undefined;
      return Array.isArray(raw) && raw.length > 0;
    }
    case "gallery": {
      const c = (block.config ?? {}) as GalleryConfig;
      return (c.image_fields ?? []).some((k) => {
        const v = data[k];
        return (
          (typeof v === "string" && v.length > 0) ||
          (Array.isArray(v) && v.some((u) => typeof u === "string" && u.length > 0))
        );
      });
    }
    case "ratings": {
      const c = (block.config ?? {}) as RatingsConfig;
      return (c.entries ?? []).some((e) => e && e.field && nonEmpty(data[e.field]));
    }
    case "stats_table": {
      const c = (block.config ?? {}) as StatsTableConfig;
      const schemaFields = bundle.fields as SchemaField[];
      const byKey = new Map(schemaFields.map((f) => [f.key, f]));
      const autoKeys = (schemaFields.length > 0 ? schemaFields.map((f) => f.key) : Object.keys(data)).filter(
        (k) => !HIDDEN_IN_DETAILS.has(k) && k !== "description" && k !== "lore"
      );
      const keys = c.fields && c.fields.length > 0 ? c.fields : autoKeys;
      return keys.some((k) => {
        const f = byKey.get(k);
        if (f?.type === "backref") return (relations.backRefs.get(k) ?? []).length > 0;
        return nonEmpty(data[k]);
      });
    }
    default:
      return true;
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
  const blocks = layout.blocks;

  // A labelled divider introduces a section. If everything between it and the
  // next divider renders nothing (e.g. an item with no `lore` filled in), the
  // divider becomes an orphaned header — "LORE" over empty space — making
  // sparse items look broken. Drop those. Plain (unlabelled) <hr> dividers are
  // harmless separators and always kept. Skipped in preview so template authors
  // still see every block they placed.
  const keepDivider = (i: number): boolean => {
    const cfg = (blocks[i].config ?? {}) as DividerConfig;
    if (!cfg.label) return true;
    for (let j = i + 1; j < blocks.length; j++) {
      if (blocks[j].type === "divider") break;
      if (blockHasContent(blocks[j], bundle, relations)) return true;
    }
    return false;
  };
  const visibleBlocks = preview
    ? blocks
    : blocks.filter((b, i) => (b.type === "divider" ? keepDivider(i) : true));

  return (
    <main className="max-w-5xl mx-auto px-6 py-10">
      {visibleBlocks.map((block) => (
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
