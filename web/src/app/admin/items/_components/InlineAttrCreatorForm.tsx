"use client";

import { useState } from "react";

// The expanded input row that appears under an attribute field when the
// admin clicks "+ new". Used by both the single-select and multi-select
// attribute renderers in the item form, where the surrounding JSX is
// different but this little input/Create/Cancel triplet is identical.
//
// The parent owns the open/closed state and mounts this component only
// when the form should be visible — each open is a fresh instance, so
// the name input resets to empty without any explicit reset effect.
export function InlineAttrCreatorForm({
  fieldLabel,
  saving,
  slugify,
  onSubmit,
  onCancel,
}: {
  fieldLabel: string;
  saving: boolean;
  slugify: (name: string) => string;
  onSubmit: (name: string) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  const trimmed = name.trim();

  return (
    <div className="mt-2 flex items-center gap-2">
      <input
        autoFocus
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && trimmed) onSubmit(trimmed);
          if (e.key === "Escape") onCancel();
        }}
        placeholder={`New ${fieldLabel.toLowerCase()} name…`}
        className="flex-1 px-3 py-1.5 rounded-lg bg-gray-800 border border-amber-500/60 text-sm focus:outline-none focus:border-amber-400"
      />
      {trimmed && (
        <span className="text-xs text-gray-500 shrink-0 font-mono">
          key: {slugify(trimmed)}
        </span>
      )}
      <button
        type="button"
        onClick={() => trimmed && onSubmit(trimmed)}
        disabled={saving || !trimmed}
        className="shrink-0 px-3 py-1.5 rounded-lg bg-amber-500 text-black text-xs font-semibold disabled:opacity-40 hover:bg-amber-400 transition"
      >
        {saving ? "…" : "Create"}
      </button>
      <button
        type="button"
        onClick={onCancel}
        className="shrink-0 text-gray-500 hover:text-white text-xs transition"
      >
        Cancel
      </button>
    </div>
  );
}
