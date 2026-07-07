"use client";

import Link from "next/link";
import { SafeImage } from "@/components/SafeImage";
import { imageFocus, imageZoom } from "@/lib/imageFocus";
import { type AdminItem } from "./types";

// Tabular view of the items list — image thumb + name + slug + updated
// + per-row actions. The cards view is rendered by a sibling component
// (ItemCardGrid) with a different layout but the same row-level actions.
export function ItemTable({
  items,
  visibleItems,
  onEdit,
  onDelete,
}: {
  items: AdminItem[];
  visibleItems: AdminItem[];
  onEdit: (item: AdminItem) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-gray-800">
      <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-800 bg-gray-900">
            <th className="text-left px-4 py-3 text-gray-400 w-14" />
            <th className="text-left px-4 py-3 text-gray-400">Name</th>
            <th className="text-left px-4 py-3 text-gray-400">Slug</th>
            <th className="text-left px-4 py-3 text-gray-400">Updated</th>
            <th className="px-4 py-3" />
          </tr>
        </thead>
        <tbody>
          {items.length === 0 ? (
            <tr>
              <td colSpan={5} className="px-4 py-8 text-center text-gray-500">
                No items yet. Click &quot;+ Add Item&quot; to create the first one.
              </td>
            </tr>
          ) : visibleItems.length === 0 ? (
            <tr>
              <td colSpan={5} className="px-4 py-8 text-center text-gray-500">
                No items match the current filters.
              </td>
            </tr>
          ) : (
            visibleItems.map((item) => {
              const name = (item.data?.name as string) ?? item.slug;
              const img = item.data?.image_url as string | undefined;
              return (
                <tr
                  key={item.id}
                  className="border-b border-gray-800 last:border-0 hover:bg-gray-900/50"
                >
                  <td className="px-4 py-2">
                    {img ? (
                      <div className="w-10 h-10 rounded overflow-hidden">
                        <SafeImage
                          src={img}
                          alt={name}
                          width={40}
                          height={40}
                          focus={imageFocus(item.data, ["image_url"])}
                          zoom={imageZoom(item.data, ["image_url"])}
                          className="w-10 h-10 object-cover"
                          fallback={
                            <div className="w-10 h-10 bg-gray-800 flex items-center justify-center text-gray-600 font-semibold">
                              {name[0]?.toUpperCase()}
                            </div>
                          }
                        />
                      </div>
                    ) : (
                      <div className="w-10 h-10 rounded bg-gray-800 flex items-center justify-center text-gray-600 font-semibold">
                        {name[0]?.toUpperCase()}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3">{name}</td>
                  <td className="px-4 py-3 text-gray-400 font-mono text-xs">{item.slug}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs">
                    {new Date(item.updated_at).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex gap-2 justify-end">
                      <Link
                        href={
                          item.game_slug && item.section_slug
                            ? `/games/${item.game_slug}/${item.section_slug}/${item.slug}`
                            : `/items/${item.id}`
                        }
                        className="text-xs px-3 py-1 rounded border border-gray-700 hover:border-white transition"
                      >
                        View
                      </Link>
                      <button
                        onClick={() => onEdit(item)}
                        className="text-xs px-3 py-1 rounded border border-gray-700 hover:border-white transition"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => onDelete(item.id)}
                        className="text-xs px-3 py-1 rounded border border-gray-700 hover:border-red-900 text-red-400 transition"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
      </div>
    </div>
  );
}
