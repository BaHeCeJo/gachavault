// Shared types for the item detail page renderer (legacy layout + block
// renderer + the relations hook). Pure types, no runtime — safe to import
// from server or client.

export interface Item {
  id: string;
  slug: string;
  game_id: string;
  game_slug: string;
  section_id: string;
  section_slug: string;
  type_schema_id: string | null;
  data: Record<string, unknown>;
  created_at?: string;
  updated_at?: string;
}

export interface ItemFull {
  id: string;
  slug: string;
  game_id: string;
  game_slug: string;
  section_id: string;
  section_slug: string;
  data: Record<string, unknown>;
}

export interface SchemaField {
  key: string;
  label: string;
  type: string;
  attribute_type?: string;
  item_section?: string;
  qty_range?: boolean;
  source_section?: string;
  source_field?: string;
  sources?: { source_section: string; source_field: string }[];
}

// A resolved cross-item reference (itemref / backref target) ready to link.
export interface ResolvedRef {
  id: string;
  slug: string;
  name: string;
  game_slug?: string;
  section_slug?: string;
  // Portrait/icon for image-card grids (item_grid block). Populated when the
  // full source item was fetched anyway (itemref/backref).
  image_url?: string;
  // Focal point paired with image_url (CSS object-position); see lib/imageFocus.
  focus?: string;
}

// Secondary data hydrated client-side after the server render: itemref
// targets, backref matches, and the related-items grid. Produced by
// useItemRelations and consumed by the legacy layout and by blocks.
export interface ItemRelations {
  relatedItems: ItemFull[];
  resolvedRefs: Map<string, ResolvedRef>;
  backRefs: Map<string, ResolvedRef[]>;
}
