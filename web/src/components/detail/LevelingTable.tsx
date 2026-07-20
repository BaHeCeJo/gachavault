// Shared presentational component for a `table` schema field — a small grid of
// labeled rows × named value columns (e.g. a lightcone/character ascension
// table: rows = level breakpoints, columns = Base HP / ATK / DEF). Used by both
// the page_layout TableBlock and the legacy detail layout so they render
// identically. Columns come from the schema field def; rows from item data.

export interface TableRow {
  label?: string;
  values?: string[];
}

// Runtime trust boundary: the stored value is arbitrary JSON. Coerce it into
// rows of { label, values[] }, dropping anything unusable.
export function parseTableRows(raw: unknown): TableRow[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((r): r is Record<string, unknown> => !!r && typeof r === "object" && !Array.isArray(r))
    .map((r) => ({
      label: typeof r.label === "string" ? r.label : "",
      values: Array.isArray(r.values) ? r.values.map((v) => (v == null ? "" : String(v))) : [],
    }));
}

export function tableHasContent(raw: unknown): boolean {
  return parseTableRows(raw).some(
    (row) => (row.label ?? "").trim() !== "" || (row.values ?? []).some((v) => v.trim() !== ""),
  );
}

export function LevelingTable({
  columns,
  rowLabel,
  rows,
  title,
}: {
  columns: string[];
  rowLabel?: string;
  rows: TableRow[];
  title?: string;
}) {
  if (rows.length === 0) return null;
  // Column count spans the widest row so a short row never truncates headers.
  const colCount = Math.max(columns.length, ...rows.map((r) => (r.values ?? []).length), 0);
  const headers = Array.from({ length: colCount }, (_, i) => columns[i] ?? "");

  return (
    <div>
      {title && (
        <h2 className="text-sm font-semibold text-gray-400 mb-2 uppercase tracking-wide">{title}</h2>
      )}
      <div className="overflow-x-auto rounded-xl border border-gray-800">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-gray-900/60 text-gray-400">
              <th className="text-left font-medium px-4 py-2 whitespace-nowrap">{rowLabel || "Level"}</th>
              {headers.map((h, i) => (
                <th key={i} className="text-right font-medium px-4 py-2 whitespace-nowrap tabular-nums">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i} className={i % 2 === 0 ? "bg-gray-900/30" : "bg-transparent"}>
                <td className="px-4 py-2 text-gray-300 whitespace-nowrap">{row.label || "—"}</td>
                {headers.map((_, k) => (
                  <td key={k} className="px-4 py-2 text-right text-gray-300 tabular-nums whitespace-nowrap">
                    {(row.values ?? [])[k] ?? ""}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
