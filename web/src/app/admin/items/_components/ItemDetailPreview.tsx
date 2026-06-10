"use client";

import { useMemo } from "react";
import ItemPageClient from "@/app/games/[slug]/[sectionSlug]/[itemSlug]/ItemPageClient";
import type {
  ItemPageBundle,
  SeoGame,
  SeoGameAttribute,
  SeoSchemaField,
} from "@/lib/seo";
import { parsePageLayout } from "@/lib/pageLayout";

interface Game {
  id: string;
  slug: string;
  name: string;
}
interface Section {
  id: string;
  slug: string;
  name: string;
}
interface Schema {
  id: string;
  name: string;
  section_id: string | null;
  fields: unknown;
  page_layout?: unknown;
}
interface GameAttribute {
  id: string;
  attr_type: string;
  key: string;
  name: string;
  icon_url: string | null;
  color: string | null;
}

interface Props {
  game: Game | null;
  sections: Section[];
  schemas: Schema[];
  attrList: GameAttribute[];
  form: { slug: string; section_id: string; type_schema_id: string; dataJson: string };
  // Present in edit mode so breadcrumb/itemref links point at the real id.
  itemId?: string;
}

// Renders the *actual* public item detail page (ItemPageClient) against the
// in-progress admin form, so the editor sees exactly how the item will look.
// The only difference from production is `preview` mode on ItemPageClient,
// which skips the cross-item/related network fetches.
export function ItemDetailPreview({ game, sections, schemas, attrList, form, itemId }: Props) {
  // Parse the raw JSON the form keeps as its source of truth. While the admin
  // is mid-edit it can be transiently invalid — show a hint instead of crashing.
  const parsed = useMemo<{ data: Record<string, unknown> | null; error: string | null }>(() => {
    try {
      const obj = JSON.parse(form.dataJson);
      if (obj && typeof obj === "object" && !Array.isArray(obj)) {
        return { data: obj as Record<string, unknown>, error: null };
      }
      return { data: null, error: "Item data must be a JSON object." };
    } catch (e) {
      return { data: null, error: e instanceof Error ? e.message : "Invalid JSON." };
    }
  }, [form.dataJson]);

  const bundle = useMemo<ItemPageBundle | null>(() => {
    if (!parsed.data) return null;
    const section = sections.find((s) => s.id === form.section_id) ?? null;
    const schema = schemas.find((s) => s.id === form.type_schema_id) ?? null;
    const seoGame: SeoGame | null = game
      ? { id: game.id, slug: game.slug, name: game.name, description: null, banner_url: null, logo_url: null }
      : null;
    const fields = (Array.isArray(schema?.fields) ? schema.fields : []) as SeoSchemaField[];
    return {
      item: {
        id: itemId ?? "preview",
        slug: form.slug || "preview",
        game_id: game?.id ?? "",
        game_slug: game?.slug ?? "",
        section_id: form.section_id,
        section_slug: section?.slug ?? "",
        type_schema_id: form.type_schema_id || null,
        data: parsed.data,
      },
      game: seoGame,
      fields,
      attributes: attrList as SeoGameAttribute[],
      sectionName: section?.name ?? "",
      locale: "en",
      pageLayout: parsePageLayout(schema?.page_layout),
    };
  }, [parsed.data, sections, schemas, attrList, game, form.section_id, form.type_schema_id, form.slug, itemId]);

  if (parsed.error) {
    return (
      <div className="p-6 text-sm">
        <p className="font-medium text-amber-300 mb-1">Can&apos;t preview yet</p>
        <p className="text-amber-300/70 text-xs">{parsed.error} Fix the data to resume the preview.</p>
      </div>
    );
  }
  if (!bundle) return null;

  return <ItemPageClient initial={bundle} preview />;
}
