"use client";

import { useRef, useState } from "react";
import { mediaApi } from "@/lib/api";

interface Props {
  label: string;
  value: string;
  onChange: (url: string) => void;
  placeholder?: string;
  previewHeight?: string;
  // When provided, the preview becomes an interactive focal-point picker:
  // click or drag on the image to set where the crop anchors (stored as a CSS
  // object-position string like "50% 30%"). Omit for a plain preview.
  focus?: string;
  onFocusChange?: (focus: string) => void;
}

function parseFocus(focus: string | undefined): [number, number] {
  const m = (focus ?? "").match(/(-?\d+(?:\.\d+)?)%\s+(-?\d+(?:\.\d+)?)%/);
  return m ? [Number(m[1]), Number(m[2])] : [50, 50];
}

export default function ImageUploadField({
  label,
  value,
  onChange,
  placeholder = "https://… or upload →",
  previewHeight = "h-16",
  focus,
  onFocusChange,
}: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) { setError("File too large — max 10 MB"); return; }
    setError("");
    setUploading(true);
    try {
      const res = await mediaApi.upload(file);
      onChange(res.data.data?.public_url ?? "");
    } catch {
      setError("Upload failed — please try again");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const focusEnabled = !!onFocusChange;
  const [fx, fy] = parseFocus(focus);
  const focusPos = `${fx}% ${fy}%`;

  const applyFocus = (clientX: number, clientY: number) => {
    const box = boxRef.current;
    if (!box || !onFocusChange) return;
    const rect = box.getBoundingClientRect();
    const x = Math.min(100, Math.max(0, ((clientX - rect.left) / rect.width) * 100));
    const y = Math.min(100, Math.max(0, ((clientY - rect.top) / rect.height) * 100));
    onFocusChange(`${Math.round(x)}% ${Math.round(y)}%`);
  };

  return (
    <div>
      <label className="text-xs text-gray-400 block mb-1">{label}</label>
      <div className="flex gap-2">
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="flex-1 px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-sm focus:outline-none focus:border-white"
        />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="px-3 py-2 rounded-lg border border-gray-700 hover:border-white text-sm transition disabled:opacity-50 whitespace-nowrap"
        >
          {uploading ? "Uploading…" : "Upload file"}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          className="hidden"
          onChange={handleUpload}
        />
      </div>

      {value && focusEnabled && (
        <div className="mt-2">
          {/* Interactive crop preview: mirrors the card crop (object-cover with
              the chosen object-position) so what you see here is what the cards
              show. Click or drag to move the anchor. */}
          <div
            ref={boxRef}
            className="relative h-44 w-full rounded overflow-hidden bg-gray-800 cursor-crosshair select-none touch-none"
            onPointerDown={(e) => {
              draggingRef.current = true;
              e.currentTarget.setPointerCapture(e.pointerId);
              applyFocus(e.clientX, e.clientY);
            }}
            onPointerMove={(e) => { if (draggingRef.current) applyFocus(e.clientX, e.clientY); }}
            onPointerUp={(e) => {
              draggingRef.current = false;
              e.currentTarget.releasePointerCapture(e.pointerId);
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={value}
              alt=""
              aria-hidden="true"
              draggable={false}
              className="absolute inset-0 h-full w-full object-cover pointer-events-none"
              style={{ objectPosition: focusPos }}
              onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
            />
            {/* Anchor marker */}
            <div
              className="absolute w-5 h-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_2px_rgba(0,0,0,0.6)] pointer-events-none"
              style={{ left: `${fx}%`, top: `${fy}%` }}
            >
              <div className="absolute inset-1.5 rounded-full bg-white/80" />
            </div>
          </div>
          <div className="mt-1 flex items-center justify-between text-xs text-gray-500">
            <span>Click or drag to set the focal point ({fx}% {fy}%)</span>
            <button
              type="button"
              onClick={() => onFocusChange?.("50% 50%")}
              className="text-gray-400 hover:text-white transition"
            >
              Reset to center
            </button>
          </div>
        </div>
      )}

      {value && !focusEnabled && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={value}
          alt=""
          aria-hidden="true"
          className={`mt-2 ${previewHeight} rounded object-cover`}
          onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
        />
      )}
      {error && <p className="text-red-400 text-xs mt-1">{error}</p>}
    </div>
  );
}
