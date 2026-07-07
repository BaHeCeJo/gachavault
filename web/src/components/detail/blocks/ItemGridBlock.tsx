"use client";

import Link from "next/link";
import { SafeImage } from "@/components/SafeImage";
import { imageFocus } from "@/lib/imageFocus";
import { cardGradient } from "@/lib/theme";
import type { ItemPageBundle } from "@/lib/seo";
import { itemHref } from "@/components/detail/FieldValue";
import type { ItemRelations, SchemaField } from "@/components/detail/types";
import type { ItemGridConfig } from "@/lib/pageLayout";

interface GridCard {
  id: string;
  name: string;
  image_url?: string;
  focus?: string;
  href: string;
}

// A card grid of related items or an item-reference field (light cones,
// recommended relics, team members…). Source "related" uses the related-items
// list; otherwise it reads a schema field — itemref / backref resolve to image
// cards, itemlist falls back to gradient cards (no portrait stored on entries).
export function ItemGridBlock({
  config,
  bundle,
  relations,
}: {
  config?: Record<string, unknown>;
  bundle: ItemPageBundle;
  relations: ItemRelations;
}) {
  const c = (config ?? {}) as ItemGridConfig;
  const source = c.source ?? "related";
  const data = bundle.item.data as Record<string, unknown>;
  const schemaFields = bundle.fields as SchemaField[];
  const columns = c.columns ?? 6;
  const limit = c.limit ?? 12;

  let cards: GridCard[] = [];
  if (!source || source === "related") {
    cards = relations.relatedItems.map((r) => ({
      id: r.id,
      name: (r.data?.name as string) ?? r.slug,
      image_url: (r.data?.image_url ?? r.data?.icon_url) as string | undefined,
      focus: imageFocus(r.data),
      href: itemHref(r),
    }));
  } else {
    const field = schemaFields.find((f) => f.key === source);
    const t = field?.type;
    if (t === "backref") {
      cards = (relations.backRefs.get(source) ?? []).map((r) => ({
        id: r.id, name: r.name, image_url: r.image_url, focus: r.focus, href: itemHref(r),
      }));
    } else if (t === "itemref") {
      const v = data[source];
      const ref = typeof v === "string" ? relations.resolvedRefs.get(v) : undefined;
      cards = ref ? [{ id: ref.id, name: ref.name, image_url: ref.image_url, focus: ref.focus, href: itemHref(ref) }] : [];
    } else {
      const v = data[source];
      const entries = Array.isArray(v) ? (v as { id?: string; name?: string }[]) : [];
      cards = entries
        .filter((e) => e && (e.id || e.name))
        .map((e, i) => ({
          id: e.id || `e${i}`,
          name: e.name || e.id || "",
          image_url: undefined,
          href: e.id ? `/items/${e.id}` : "#",
        }));
    }
  }

  cards = cards.slice(0, limit);
  if (cards.length === 0) return null;

  const colClass = columns === 3
    ? "grid-cols-2 sm:grid-cols-3"
    : columns === 4
      ? "grid-cols-2 sm:grid-cols-4"
      : "grid-cols-3 sm:grid-cols-4 md:grid-cols-6";

  return (
    <section className="mb-8">
      {c.title && <h2 className="text-xl font-semibold mb-4">{c.title}</h2>}
      <div className={`grid ${colClass} gap-3`}>
        {cards.map((card) => (
          <Link
            key={card.id}
            href={card.href}
            className="flex flex-col rounded-lg border border-gray-800 bg-gray-900 overflow-hidden hover:border-amber-500/60 hover:shadow-md hover:shadow-amber-500/10 hover:scale-[1.03] transition-all duration-200 group"
          >
            <div className="relative h-20">
              <SafeImage src={card.image_url} alt={card.name} fill sizes="(min-width: 768px) 140px, (min-width: 640px) 25vw, 33vw" focus={card.focus} className="object-cover group-hover:scale-105 transition-transform duration-200" fallback={
                <div className={`h-full bg-gradient-to-br ${cardGradient(card.name)} flex items-center justify-center text-xl font-semibold text-white/50`}>
                  {card.name[0]?.toUpperCase()}
                </div>
              } />
            </div>
            <p className="px-1.5 py-1 text-xs truncate">{card.name}</p>
          </Link>
        ))}
      </div>
    </section>
  );
}
