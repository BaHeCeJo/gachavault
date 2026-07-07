"use client";

import { useEffect, useState } from "react";
import { gamesApi, itemsApi } from "@/lib/api";
import { imageFocus, imageZoom } from "@/lib/imageFocus";
import type {
  Item,
  ItemFull,
  ItemRelations,
  ResolvedRef,
  SchemaField,
} from "@/components/detail/types";

// Hydrates the secondary, cross-item data the SSR pass intentionally skips:
// itemref targets, backref matches (which require scanning whole sections),
// and the related-items grid. Extracted verbatim from ItemPageClient so the
// legacy layout and the block renderer share one resolver. `enabled` is the
// single guard the admin live preview flips off to avoid per-keystroke API
// spam.
export function useItemRelations({
  item,
  fields,
  enabled,
}: {
  item: Item;
  fields: SchemaField[];
  enabled: boolean;
}): ItemRelations {
  const [relatedItems, setRelatedItems] = useState<ItemFull[]>([]);
  const [resolvedRefs, setResolvedRefs] = useState<Map<string, ResolvedRef>>(new Map());
  const [backRefs, setBackRefs] = useState<Map<string, ResolvedRef[]>>(new Map());

  useEffect(() => {
    if (!enabled) return;
    const it = item;
    const slug = item.game_slug;
    const itemSlug = item.slug;

    const itemrefIds = fields
      .filter((f) => f.type === "itemref")
      .map((f) => it.data[f.key])
      .filter((v): v is string => typeof v === "string" && v.length > 0);
    if (itemrefIds.length > 0) {
      Promise.all(itemrefIds.map((refId) => itemsApi.get(refId).catch(() => null)))
        .then((results) => {
          const map = new Map<string, ResolvedRef>();
          results.forEach((r, i) => {
            if (r?.data?.data) {
              const refItem = r.data.data;
              map.set(itemrefIds[i], {
                id: refItem.id,
                slug: refItem.slug,
                name: (refItem.data?.name as string) ?? refItem.slug,
                game_slug: refItem.game_slug,
                section_slug: refItem.section_slug,
                image_url: (refItem.data?.image_url ?? refItem.data?.icon_url) as string | undefined,
                focus: imageFocus(refItem.data),
                zoom: imageZoom(refItem.data),
              });
            }
          });
          setResolvedRefs(map);
        })
        .catch(() => {});
    }

    const getFieldSources = (f: SchemaField) =>
      f.sources?.length
        ? f.sources
        : f.source_section && f.source_field
          ? [{ source_section: f.source_section, source_field: f.source_field }]
          : [];
    const backrefFields = fields.filter((f) => f.type === "backref" && getFieldSources(f).length > 0);
    if (backrefFields.length > 0) {
      const allSources = backrefFields.flatMap(getFieldSources);
      const uniqueSlugs = Array.from(new Set(allSources.map((s) => s.source_section)));
      (async () => {
        const sectionsRes = await gamesApi.getSections(slug).catch(() => null);
        const sections: Array<{ id: string; slug: string }> = sectionsRes?.data?.data ?? [];
        const results = await Promise.all(
          uniqueSlugs.map(async (secSlug) => {
            const section = sections.find((s) => s.slug === secSlug);
            if (!section) return [secSlug, []] as [string, ItemFull[]];
            const sourceItems = await itemsApi.listAll<ItemFull>({ game_id: it.game_id, section_id: section.id });
            return [secSlug, sourceItems] as [string, ItemFull[]];
          })
        );
        const sectionItems = new Map<string, ItemFull[]>(results);
        const newBackRefs = new Map<string, ResolvedRef[]>();
        for (const field of backrefFields) {
          const seen = new Set<string>();
          const matching: ResolvedRef[] = [];
          for (const src of getFieldSources(field)) {
            const sourceItems = sectionItems.get(src.source_section) ?? [];
            for (const sourceItem of sourceItems) {
              if (seen.has(sourceItem.id)) continue;
              const fieldValue = sourceItem.data[src.source_field];
              const matches = Array.isArray(fieldValue)
                ? (fieldValue as { id?: string }[]).some((entry) => entry.id === it.id)
                : fieldValue === it.id;
              if (matches) {
                seen.add(sourceItem.id);
                matching.push({
                  id: sourceItem.id,
                  slug: sourceItem.slug,
                  name: (sourceItem.data?.name as string) ?? sourceItem.slug,
                  game_slug: sourceItem.game_slug,
                  section_slug: sourceItem.section_slug,
                  image_url: (sourceItem.data?.image_url ?? sourceItem.data?.icon_url) as string | undefined,
                  focus: imageFocus(sourceItem.data),
                  zoom: imageZoom(sourceItem.data),
                });
              }
            }
          }
          newBackRefs.set(field.key, matching);
        }
        setBackRefs(newBackRefs);
      })().catch(() => {});
    }

    itemsApi
      .list({ game_id: it.game_id, section_id: it.section_id, limit: 12, offset: 0 })
      .then((relRes) => {
        if (relRes?.data?.data) {
          setRelatedItems((relRes.data.data as ItemFull[]).filter((r: ItemFull) => r.slug !== itemSlug));
        }
      })
      .catch(() => {});
  }, [item, fields, enabled]);

  return { relatedItems, resolvedRefs, backRefs };
}
