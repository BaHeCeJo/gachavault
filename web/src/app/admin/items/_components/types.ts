import { type CardLayout } from "@/components/ItemCard";

// Shared shape used by the admin items page and the sub-components extracted
// from it. Kept here so children don't roll their own subset interfaces and
// produce confusing assignability errors when the parent passes its real
// items into a handler typed against the subset.

export interface AdminItem {
  id: string;
  slug: string;
  game_id: string;
  game_slug?: string;
  section_id: string;
  section_slug?: string;
  type_schema_id: string;
  data: Record<string, unknown>;
  version: number;
  updated_at: string;
}

export interface AdminSchemaField {
  key: string;
  label: string;
  type: string;
  attribute_type?: string;
}

export interface AdminSchema {
  id: string;
  name: string;
  section_id: string | null;
  fields: AdminSchemaField[];
  card_layout?: CardLayout | null;
  is_collectable?: boolean;
  image_slots?: unknown;
}
