"use client";

import { SafeImage } from "@/components/SafeImage";

interface ImageSlotThumbProps {
  src: string | null | undefined;
  alt: string;
  // Slot name ("Banner", "Logo", …) — surfaced as the tooltip so an admin can
  // tell which slot an empty placeholder belongs to.
  label: string;
  width: number;
  height: number;
}

// Compact preview of one image slot for admin list rows: the image when set,
// a dashed placeholder when not, so missing art is visible at a glance.
export default function ImageSlotThumb({ src, alt, label, width, height }: ImageSlotThumbProps) {
  const style = { width, height };

  if (!src) {
    return (
      <div
        title={`${label}: not set`}
        style={style}
        className="rounded border border-dashed border-gray-700 bg-gray-900 flex items-center justify-center text-gray-600 text-[10px] shrink-0"
      >
        —
      </div>
    );
  }

  return (
    <div title={label} style={style} className="rounded overflow-hidden bg-gray-800 shrink-0">
      <SafeImage
        src={src}
        alt={alt}
        width={width}
        height={height}
        className="w-full h-full object-cover"
        fallback={
          <div style={style} className="flex items-center justify-center text-gray-600 text-[10px]">
            !
          </div>
        }
      />
    </div>
  );
}
