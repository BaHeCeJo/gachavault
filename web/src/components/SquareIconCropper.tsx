"use client";

// Modal that cuts a genuine square PNG icon out of a source image (typically a
// character's card/splash art). Unlike the focal-point cropper in
// ImageUploadField (which only stores a CSS object-position + zoom), this
// produces a real cropped file: drag to position, zoom to the face, and it
// draws the framed square to a canvas and uploads it. Transparency in the
// source PNG is preserved (no background fill), so background-removed splash
// art yields a clean transparent icon.

import { useRef, useState } from "react";
import { mediaApi } from "@/lib/api";

interface Props {
  /** Image to crop from (card art, or an existing icon to re-crop). */
  sourceUrl: string;
  onCancel: () => void;
  /** Called with the uploaded square-icon URL once cropping succeeds. */
  onSaved: (url: string) => void;
  /** Upper bound on the output side in px; the icon is never upscaled past the
   *  crop's own resolution, so a small face crop stays sharp instead of being
   *  inflated into a blurry square. */
  maxOutput?: number;
}

const MIN_ZOOM = 1;
const MAX_ZOOM = 8;
const VIEWPORT = 320; // on-screen size of the square framing viewport, in px
// Below this native crop size the face has too few real pixels for a crisp icon.
const LOWRES_PX = 220;

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

export default function SquareIconCropper({
  sourceUrl,
  onCancel,
  onSaved,
  maxOutput = 512,
}: Props) {
  const imgRef = useRef<HTMLImageElement>(null);
  const dragRef = useRef<{ x: number; y: number } | null>(null);
  const [dims, setDims] = useState<{ w: number; h: number } | null>(null);
  const [zoom, setZoom] = useState(1);
  // Center of the crop square, in SOURCE pixels. Null until the image loads.
  const [center, setCenter] = useState<{ x: number; y: number } | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Crop square side in source px: min-dimension at z=1, shrinking as you zoom.
  const side = dims ? Math.min(dims.w, dims.h) / zoom : 0;

  // Center clamped so the square never leaves the image (kept in derived state
  // rather than stored, so a zoom change can't strand it out of bounds).
  const cc =
    dims && center
      ? {
          x: clamp(center.x, side / 2, dims.w - side / 2),
          y: clamp(center.y, side / 2, dims.h - side / 2),
        }
      : center;

  const onLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const el = e.currentTarget;
    setDims({ w: el.naturalWidth, h: el.naturalHeight });
    setCenter({ x: el.naturalWidth / 2, y: el.naturalHeight / 2 });
  };

  const onPointerDown = (e: React.PointerEvent) => {
    dragRef.current = { x: e.clientX, y: e.clientY };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const start = dragRef.current;
    if (!start || !dims || !cc) return;
    const scale = VIEWPORT / side; // display px per source px
    const dx = (e.clientX - start.x) / scale;
    const dy = (e.clientY - start.y) / scale;
    dragRef.current = { x: e.clientX, y: e.clientY };
    // Dragging the image right reveals its left side, so the center moves opposite.
    setCenter({
      x: clamp(cc.x - dx, side / 2, dims.w - side / 2),
      y: clamp(cc.y - dy, side / 2, dims.h - side / 2),
    });
  };
  const onPointerUp = (e: React.PointerEvent) => {
    dragRef.current = null;
    (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
  };

  const save = async () => {
    if (!dims || !cc || !imgRef.current) return;
    setError("");
    setSaving(true);
    try {
      const s = side;
      // Never upscale: cap the output at the crop's own pixel size so a small
      // face crop is stored at native resolution (sharp) rather than inflated.
      const out = Math.min(maxOutput, Math.round(s));
      const canvas = document.createElement("canvas");
      canvas.width = out;
      canvas.height = out;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("no canvas context");
      ctx.imageSmoothingQuality = "high";
      // Sample the framed source square and scale it into the output square.
      // Left transparent where the source is transparent (no background fill).
      ctx.drawImage(imgRef.current, cc.x - s / 2, cc.y - s / 2, s, s, 0, 0, out, out);
      const blob: Blob = await new Promise((resolve, reject) =>
        canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob failed"))), "image/png"),
      );
      const file = new File([blob], "icon.png", { type: "image/png" });
      const res = await mediaApi.upload(file);
      const url = res.data.data?.public_url ?? "";
      if (!url) throw new Error("upload returned no url");
      onSaved(url);
    } catch (err) {
      // A cross-origin source taints the canvas; toBlob then throws SecurityError.
      if ((err as { name?: string })?.name === "SecurityError") {
        setError("Can't crop an external image. Upload the source file first, then crop.");
      } else {
        setError("Couldn't create the icon — please try again.");
      }
      setSaving(false);
    }
  };

  const scale = side ? VIEWPORT / side : 1;
  const tx = cc ? -(cc.x - side / 2) * scale : 0;
  const ty = cc ? -(cc.y - side / 2) * scale : 0;
  // Native output size for the current framing (never upscaled past the crop).
  const outPx = Math.min(maxOutput, Math.round(side));

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-sm rounded-2xl border border-gray-700 bg-gray-900 p-4"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="mb-1 text-sm font-semibold text-gray-100">Make square icon</h3>
        <p className="mb-3 text-xs text-gray-500">
          Drag to position · zoom to the face. A square PNG is created (transparency kept).
        </p>

        {/* Checkerboard backing makes transparent areas obvious while framing. */}
        <div
          className="relative mx-auto cursor-grab select-none overflow-hidden rounded-xl active:cursor-grabbing touch-none"
          style={{
            width: VIEWPORT,
            height: VIEWPORT,
            backgroundImage:
              "linear-gradient(45deg,#374151 25%,transparent 25%),linear-gradient(-45deg,#374151 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#374151 75%),linear-gradient(-45deg,transparent 75%,#374151 75%)",
            backgroundSize: "16px 16px",
            backgroundPosition: "0 0,0 8px,8px -8px,-8px 0",
          }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            ref={imgRef}
            src={sourceUrl}
            alt=""
            aria-hidden
            draggable={false}
            onLoad={onLoad}
            className="pointer-events-none absolute left-0 top-0 max-w-none origin-top-left"
            style={
              dims
                ? {
                    width: dims.w * scale,
                    height: dims.h * scale,
                    transform: `translate(${tx}px, ${ty}px)`,
                  }
                : { visibility: "hidden" }
            }
          />
        </div>

        <div className="mt-3 flex items-center gap-3">
          <span className="shrink-0 text-xs text-gray-400">Zoom</span>
          <input
            type="range"
            min={MIN_ZOOM}
            max={MAX_ZOOM}
            step={0.05}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            className="flex-1 accent-amber-500"
          />
          <span className="w-10 text-right text-xs tabular-nums text-gray-500">
            {zoom.toFixed(1)}×
          </span>
        </div>

        {dims && (
          <p className="mt-2 text-xs text-gray-500">
            Output: <span className="tabular-nums">{outPx}×{outPx}px</span>
          </p>
        )}
        {dims && outPx < LOWRES_PX && (
          <p className="mt-1 text-xs text-amber-500/90">
            Low resolution — the face fills only {outPx}px here. Zoom out or use a source where the
            face is larger for a crisp icon.
          </p>
        )}

        {error && <p className="mt-2 text-xs text-red-400">{error}</p>}

        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-gray-700 px-4 py-2 text-sm text-gray-300 transition hover:text-white"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={save}
            disabled={saving || !dims}
            className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-medium text-black transition hover:bg-amber-400 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save icon"}
          </button>
        </div>
      </div>
    </div>
  );
}
