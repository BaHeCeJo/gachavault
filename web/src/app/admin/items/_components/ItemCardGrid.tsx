"use client";

import ItemCard from "@/components/ItemCard";
import { type AttrMap } from "@/lib/attrs";
import { cardIsPortrait } from "@/lib/imageSlots";
import { type AdminItem, type AdminSchema } from "./types";

// Card view of the items list — image-forward grid with per-item edit/
// delete buttons in the footer. Reaches into the schemas list to find
// the matching card_layout for each row. Sibling of ItemTable.
export function ItemCardGrid({
  visibleItems,
  schemas,
  attrMap,
  onEdit,
  onDelete,
}: {
  visibleItems: AdminItem[];
  schemas: AdminSchema[];
  attrMap: AttrMap;
  onEdit: (item: AdminItem) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 mb-6">
      {visibleItems.map((item) => {
        const schema = schemas.find((s) => s.id === item.type_schema_id);
        return (
          <ItemCard
            key={item.id}
            item={item}
            attrMap={attrMap}
            layout={schema?.card_layout ?? null}
            schemaFields={schema?.fields}
            portrait={cardIsPortrait(schema)}
            linkMode="image"
            footer={
              <div className="flex gap-1 mt-1.5">
                <button
                  onClick={() => onEdit(item)}
                  className="flex-1 text-xs py-1 rounded bg-gray-800 hover:bg-gray-700 transition"
                >
                  Edit
                </button>
                <button
                  onClick={() => onDelete(item.id)}
                  className="text-xs px-2 py-1 rounded bg-gray-800 hover:bg-red-900 text-red-400 transition"
                >
                  ✕
                </button>
              </div>
            }
          />
        );
      })}
    </div>
  );
}
