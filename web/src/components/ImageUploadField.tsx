"use client";

import { useRef, useState } from "react";
import { mediaApi } from "@/lib/api";
import SquareIconCropper from "@/components/SquareIconCropper";

interface Props {
  label: string;
  value: string;
  onChange: (url: string) => void;
  placeholder?: string;
  previewHeight?: string;
  // When set, shows a "Make icon" button that opens a cropper on this source
  // URL (e.g. the card art) to cut a square PNG. Used to generate a character
  // icon from the splash art.
  squareCropSource?: string;
  // Where the cropped icon is written. Defaults to this field's own onChange;
  // set it to route the icon to a different field (e.g. the main Image field
  // crops the card but saves the result as icon_url, not over image_url).
  onCropSaved?: (url: string) => void;
  // Crop aspect ratio (width/height) for the "Make …" button. 1 = square icon,
  // 0.75 = 3:4 portrait. Defaults to square.
  cropAspect?: number;
  // Button + modal label, e.g. "Make icon" / "Make portrait".
  cropLabel?: string;
  // When onFocusChange is provided the preview becomes an interactive cropper:
  // drag the image to reposition it and use the zoom slider to enlarge/reduce.
  // Stored as a focal point (CSS object-position, "50% 30%") plus a zoom factor
  // (>= 1). The viewport mirrors the site's crop path, so it's WYSIWYG.
  focus?: string;
  onFocusChange?: (focus: string) => void;
  zoom?: number;
  onZoomChange?: (zoom: number) => void;
}

const MIN_ZOOM = 1;
const MAX_ZOOM = 3;

function parseFocus(focus: string | undefined): [number, number] {
  const m = (focus ?? "").match(/(-?\d+(?:\.\d+)?)%\s+(-?\d+(?:\.\d+)?)%/);
  return m ? [Number(m[1]), Number(m[2])] : [50, 50];
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

export default function ImageUploadField({
  label,
  value,
  onChange,
  placeholder = "https://… or upload →",
  previewHeight = "h-16",
  focus,
  onFocusChange,
  zoom,
  onZoomChange,
  squareCropSource,
  onCropSaved,
  cropAspect = 1,
  cropLabel = "Make icon",
}: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ x: number; y: number } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [cropping, setCropping] = useState(false);

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

  const cropEnabled = !!onFocusChange;
  const [fx, fy] = parseFocus(focus);
  const z = typeof zoom === "number" && zoom > MIN_ZOOM ? Math.min(zoom, MAX_ZOOM) : MIN_ZOOM;
  const focusPos = `${fx}% ${fy}%`;

  // Drag the image to pan. Moving the image right reveals its left side, so the
  // object-position percentage moves opposite to the pointer.
  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    dragRef.current = { x: e.clientX, y: e.clientY };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const start = dragRef.current;
    const box = boxRef.current;
    if (!start || !box || !onFocusChange) return;
    const rect = box.getBoundingClientRect();
    const nx = clamp(fx - ((e.clientX - start.x) / rect.width) * 100, 0, 100);
    const ny = clamp(fy - ((e.clientY - start.y) / rect.height) * 100, 0, 100);
    dragRef.current = { x: e.clientX, y: e.clientY };
    onFocusChange(`${Math.round(nx)}% ${Math.round(ny)}%`);
  };
  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    dragRef.current = null;
    e.currentTarget.releasePointerCapture(e.pointerId);
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
        {squareCropSource && (
          <button
            type="button"
            onClick={() => setCropping(true)}
            className="px-3 py-2 rounded-lg border border-gray-700 hover:border-amber-500/60 hover:text-amber-300 text-sm transition whitespace-nowrap"
            title="Crop from the source art"
          >
            ✂ {cropLabel}
          </button>
        )}
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          className="hidden"
          onChange={handleUpload}
        />
      </div>

      {cropping && squareCropSource && (
        <SquareIconCropper
          sourceUrl={squareCropSource}
          aspect={cropAspect}
          title={cropLabel}
          onCancel={() => setCropping(false)}
          onSaved={(url) => {
            (onCropSaved ?? onChange)(url);
            setCropping(false);
          }}
        />
      )}

      {value && cropEnabled && (
        <div className="mt-2">
          {/* The viewport is card-shaped and renders the image with the exact
              same crop the site uses (object-cover + focal point + zoom), so
              what you frame here is what the cards show. Drag to reposition. */}
          <div
            ref={boxRef}
            className="relative w-full aspect-[16/10] rounded overflow-hidden bg-gray-800 cursor-grab active:cursor-grabbing select-none touch-none"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={value}
              alt=""
              aria-hidden="true"
              draggable={false}
              className="absolute inset-0 h-full w-full object-cover pointer-events-none"
              style={{
                objectPosition: focusPos,
                transform: z > 1 ? `scale(${z})` : undefined,
                transformOrigin: focusPos,
              }}
              onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
            />
          </div>
          <div className="mt-2 flex items-center gap-3">
            <span className="text-xs text-gray-400 shrink-0">Zoom</span>
            <input
              type="range"
              min={MIN_ZOOM}
              max={MAX_ZOOM}
              step={0.05}
              value={z}
              onChange={(e) => onZoomChange?.(Number(e.target.value))}
              className="flex-1 accent-white"
            />
            <span className="text-xs text-gray-500 w-10 text-right tabular-nums">{z.toFixed(2)}×</span>
            <button
              type="button"
              onClick={() => { onFocusChange?.("50% 50%"); onZoomChange?.(1); }}
              className="text-xs text-gray-400 hover:text-white transition shrink-0"
            >
              Reset
            </button>
          </div>
          <p className="mt-1 text-xs text-gray-500">Drag the image to reposition · slide to zoom</p>
        </div>
      )}

      {value && !cropEnabled && (
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
