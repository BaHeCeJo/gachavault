"use client";

// Modal that cuts a real cropped PNG out of a source image (typically a
// character's full art / splash), at a fixed ASPECT RATIO — square (1) for an
// icon, portrait (3/4) for a portrait, etc. Drag to position, zoom to frame;
// the framed rectangle is drawn to a canvas at high quality and uploaded.
// Transparency in the source PNG is preserved (no background fill).

import { useRef, useState } from "react";
import { mediaApi } from "@/lib/api";

interface Props {
  /** Images the crop can be taken from (full art / portrait / splash …). The
   *  user picks one when there's more than one; the first is the default. */
  sources: { label: string; url: string }[];
  onCancel: () => void;
  /** Called with the uploaded crop's URL once cropping succeeds. */
  onSaved: (url: string) => void;
  /** Crop aspect ratio (width / height). 1 = square, 0.75 = 3:4 portrait. */
  aspect?: number;
  /** Modal heading, e.g. "Make icon" / "Make portrait". */
  title?: string;
  /** Upper bound on the output's LONGER side in px; never upscales past the
   *  crop's native resolution, so a small crop stays sharp. */
  maxOutput?: number;
}

const MIN_ZOOM = 1;
const MAX_ZOOM = 8;
const VIEW = 320; // longer side of the on-screen framing viewport, in px
// Below this native crop size (shorter side) the crop has too few real pixels.
const LOWRES_PX = 220;

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

export default function SquareIconCropper({
  sources,
  onCancel,
  onSaved,
  aspect = 1,
  title = "Make icon",
  maxOutput = 512,
}: Props) {
  const imgRef = useRef<HTMLImageElement>(null);
  const dragRef = useRef<{ x: number; y: number } | null>(null);
  const [srcIdx, setSrcIdx] = useState(0);
  const [dims, setDims] = useState<{ w: number; h: number } | null>(null);
  const [zoom, setZoom] = useState(1);
  // Center of the crop rectangle, in SOURCE pixels. Null until the image loads.
  const [center, setCenter] = useState<{ x: number; y: number } | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const sourceUrl = sources[srcIdx]?.url ?? "";
  // Switch source image: reset the frame so onLoad re-centers on the new art.
  const selectSource = (i: number) => {
    if (i === srcIdx) return;
    setSrcIdx(i);
    setDims(null);
    setCenter(null);
    setZoom(1);
    setError("");
  };

  // Crop rectangle size (source px) for the current zoom: the largest rect of
  // ratio `aspect` that fits the image at z=1, shrinking as you zoom in.
  let cropW = 0;
  let cropH = 0;
  if (dims) {
    const baseW = Math.min(dims.w, dims.h * aspect);
    cropW = baseW / zoom;
    cropH = cropW / aspect;
  }

  // Center clamped so the rectangle never leaves the image (derived, not stored,
  // so a zoom change can't strand it out of bounds).
  const cc =
    dims && center
      ? {
          x: clamp(center.x, cropW / 2, dims.w - cropW / 2),
          y: clamp(center.y, cropH / 2, dims.h - cropH / 2),
        }
      : center;

  const onLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const el = e.currentTarget;
    setDims({ w: el.naturalWidth, h: el.naturalHeight });
    setCenter({ x: el.naturalWidth / 2, y: el.naturalHeight / 2 });
  };

  // Display viewport: longer side is VIEW; scale = display px per source px.
  const viewW = aspect >= 1 ? VIEW : VIEW * aspect;
  const viewH = aspect >= 1 ? VIEW / aspect : VIEW;
  const scale = cropW ? viewW / cropW : 1;

  const onPointerDown = (e: React.PointerEvent) => {
    dragRef.current = { x: e.clientX, y: e.clientY };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const start = dragRef.current;
    if (!start || !dims || !cc) return;
    const dx = (e.clientX - start.x) / scale;
    const dy = (e.clientY - start.y) / scale;
    dragRef.current = { x: e.clientX, y: e.clientY };
    // Dragging the image right reveals its left side, so center moves opposite.
    setCenter({
      x: clamp(cc.x - dx, cropW / 2, dims.w - cropW / 2),
      y: clamp(cc.y - dy, cropH / 2, dims.h - cropH / 2),
    });
  };
  const onPointerUp = (e: React.PointerEvent) => {
    dragRef.current = null;
    (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
  };

  // Native output size for the current framing (never upscaled past the crop).
  const outW = Math.min(maxOutput, Math.round(cropW));
  const outH = Math.round(outW / aspect);

  const save = async () => {
    if (!dims || !cc || !imgRef.current) return;
    setError("");
    setSaving(true);
    try {
      const sx = Math.round(cc.x - cropW / 2);
      const sy = Math.round(cc.y - cropH / 2);
      const sw = Math.round(cropW);
      const sh = Math.round(cropH);
      const canvas = document.createElement("canvas");
      canvas.width = outW;
      canvas.height = outH;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("no canvas context");
      try {
        // Crop + downscale from the FULL-resolution source with the browser's
        // best resampling, independent of the small preview. Transparency kept.
        const bmp = await createImageBitmap(imgRef.current, sx, sy, sw, sh, {
          resizeWidth: outW,
          resizeHeight: outH,
          resizeQuality: "high",
        });
        ctx.drawImage(bmp, 0, 0);
        bmp.close();
      } catch {
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(imgRef.current, sx, sy, sw, sh, 0, 0, outW, outH);
      }
      const blob: Blob = await new Promise((resolve, reject) =>
        canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob failed"))), "image/png"),
      );
      const file = new File([blob], "crop.png", { type: "image/png" });
      const res = await mediaApi.upload(file);
      const url = res.data.data?.public_url ?? "";
      if (!url) throw new Error("upload returned no url");
      onSaved(url);
    } catch (err) {
      if ((err as { name?: string })?.name === "SecurityError") {
        setError("Can't crop an external image. Upload the source file first, then crop.");
      } else {
        setError("Couldn't create the image — please try again.");
      }
      setSaving(false);
    }
  };

  const tx = cc ? -(cc.x - cropW / 2) * scale : 0;
  const ty = cc ? -(cc.y - cropH / 2) * scale : 0;
  const lowRes = dims && Math.min(outW, outH) < LOWRES_PX;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-sm rounded-2xl border border-gray-700 bg-gray-900 p-4"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="mb-1 text-sm font-semibold text-gray-100">{title}</h3>
        <p className="mb-3 text-xs text-gray-500">
          Drag to position · zoom to frame. A {aspect === 1 ? "square" : "cropped"} PNG is created
          (transparency kept).
        </p>

        {sources.length > 1 && (
          <div className="mb-3 flex flex-wrap gap-1">
            <span className="mr-1 self-center text-xs text-gray-500">Source</span>
            {sources.map((s, i) => (
              <button
                key={s.label}
                type="button"
                onClick={() => selectSource(i)}
                className={`rounded-md px-2 py-1 text-xs transition ${
                  i === srcIdx
                    ? "bg-amber-500 text-black"
                    : "border border-gray-700 text-gray-300 hover:text-white"
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
        )}

        {/* Checkerboard backing makes transparent areas obvious while framing. */}
        <div
          className="relative mx-auto cursor-grab select-none overflow-hidden rounded-xl active:cursor-grabbing touch-none"
          style={{
            width: viewW,
            height: viewH,
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
            Output: <span className="tabular-nums">{outW}×{outH}px</span>
          </p>
        )}
        {lowRes && (
          <p className="mt-1 text-xs text-amber-500/90">
            Low resolution — only {Math.min(outW, outH)}px here. Zoom out or use a larger source for
            a crisp result.
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
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
