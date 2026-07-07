"use client";

import Image from "next/image";
import { useState } from "react";

interface SafeImageProps {
  src: string | null | undefined;
  alt: string;
  className?: string;
  fill?: boolean;
  width?: number;
  height?: number;
  fallback?: React.ReactNode;
  // Responsive sizes hint passed straight through to next/image. Format is the
  // standard `(min-width: 768px) 50vw, 100vw`. When omitted Next emits a
  // pessimistic default that drags large variants down to mobile.
  sizes?: string;
  // Above-the-fold images (banners, hero portraits on detail pages) should set
  // priority — they get eager-loaded and preloaded; everything else is lazy.
  priority?: boolean;
  loading?: "eager" | "lazy";
  quality?: number;
  // CSS object-position for object-cover crops (e.g. "50% 30%"). Anchors the
  // crop on the subject instead of the image center. See lib/imageFocus.
  focus?: string;
  // Zoom factor (> 1) applied on top of the object-cover crop, scaled around
  // the focal point. Requires an overflow-hidden ancestor to clip the overflow
  // (all card surfaces provide one). See lib/imageFocus.
  zoom?: number;
}

// The Next image optimizer (powered by sharp in the standalone runtime — see
// web/Dockerfile) handles AVIF/WebP transcoding and width-variant srcsets.
// We pass sizes/priority/loading through so callers hint correctly. Set
// `unoptimized` per-call only if the source serves a format the optimizer
// can't handle (svg, animated gif).
export function SafeImage({
  src,
  alt,
  className,
  fill,
  width,
  height,
  fallback,
  sizes,
  priority,
  loading,
  quality,
  focus,
  zoom,
}: SafeImageProps) {
  const [error, setError] = useState(false);

  if (!src || error) {
    return <>{fallback ?? null}</>;
  }

  const sized = fill
    ? { fill: true as const }
    : { width: width ?? 400, height: height ?? 300 };

  const anchor = focus ?? "50% 50%";
  const hasZoom = typeof zoom === "number" && zoom > 1;
  const style = (focus || hasZoom)
    ? {
        objectPosition: anchor,
        ...(hasZoom ? { transform: `scale(${zoom})`, transformOrigin: anchor } : {}),
      }
    : undefined;

  return (
    <Image
      src={src}
      alt={alt}
      className={className}
      onError={() => setError(true)}
      sizes={sizes}
      priority={priority}
      loading={priority ? undefined : (loading ?? "lazy")}
      quality={quality}
      style={style}
      {...sized}
    />
  );
}
