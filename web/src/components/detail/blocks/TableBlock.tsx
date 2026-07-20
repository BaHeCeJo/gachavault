import type { ItemPageBundle } from "@/lib/seo";
import type { SchemaField } from "@/components/detail/types";
import type { TableConfig } from "@/lib/pageLayout";
import { LevelingTable, parseTableRows } from "@/components/detail/LevelingTable";

// Renders a `table` schema field (leveling / ascension table) as a labeled grid.
// The value columns and the row-label header come from the schema field def; the
// rows come from item data. `config.list_field` picks which table field when a
// schema has more than one; otherwise the first table field is used.
export function TableBlock({
  config,
  bundle,
}: {
  config?: Record<string, unknown>;
  bundle: ItemPageBundle;
}) {
  const c = (config ?? {}) as TableConfig;
  const fields = (bundle.fields ?? []) as SchemaField[];
  const field = c.list_field
    ? fields.find((f) => f.key === c.list_field)
    : fields.find((f) => f.type === "table");
  if (!field) return null;

  const rows = parseTableRows((bundle.item.data as Record<string, unknown>)[field.key]);
  if (rows.length === 0) return null;

  return (
    <LevelingTable
      columns={field.columns ?? []}
      rowLabel={field.row_label}
      rows={rows}
      title={c.title ?? field.label}
    />
  );
}
