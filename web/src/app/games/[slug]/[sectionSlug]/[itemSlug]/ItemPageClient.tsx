"use client";

import { useMemo } from "react";
import { buildAttrMap } from "@/lib/attrs";
import type { ItemPageBundle } from "@/lib/seo";
import { useItemRelations } from "@/hooks/useItemRelations";
import { LegacyDetailLayout } from "@/components/detail/LegacyDetailLayout";
import { DetailRenderer } from "@/components/detail/DetailRenderer";
import type { Item, SchemaField } from "@/components/detail/types";

interface ClientProps {
  initial: ItemPageBundle;
  // When true (admin live preview), skip the secondary cross-item/related
  // fetches so editing keystrokes don't spam the API, and render itemref
  // values inline rather than waiting on a lookup that never runs.
  preview?: boolean;
}

// Thin orchestrator: build the attribute map, hydrate cross-item relations,
// then branch on whether this section has a page template. No template (the
// vast majority) → the legacy fixed layout, byte-identical to before. A
// template with blocks → the block renderer. Both paths share one attrMap and
// one relations hook, and the admin preview reuses this exact component.
export default function ItemPageClient({ initial, preview = false }: ClientProps) {
  const item = initial.item as Item;
  const fields = initial.fields as SchemaField[];
  const attrMap = useMemo(() => buildAttrMap(initial.attributes), [initial.attributes]);
  const relations = useItemRelations({ item, fields, enabled: !preview });
  const layout = initial.pageLayout;

  if (layout && layout.blocks.length > 0) {
    return (
      <DetailRenderer
        bundle={initial}
        layout={layout}
        preview={preview}
        relations={relations}
        attrMap={attrMap}
      />
    );
  }

  return (
    <main className="max-w-5xl mx-auto px-6 py-10">
      <LegacyDetailLayout
        bundle={initial}
        preview={preview}
        relations={relations}
        attrMap={attrMap}
      />
    </main>
  );
}
