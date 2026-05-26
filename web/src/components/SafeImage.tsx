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
}

// NOTE: `unoptimized` is still on because the standalone Docker runtime does
// not bundle sharp yet. Flipping it off (and adding sharp to package.json +
// the runtime stage of web/Dockerfile) is the rest of the perf budget item:
// remote images then get transcoded to WebP/AVIF and width-variant srcsets.
// Until then we at least pass through sizes/priority/loading so callers can
// hint correctly and the markup is ready when the optimizer is enabled.
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
}: SafeImageProps) {
  const [error, setError] = useState(false);

  if (!src || error) {
    return <>{fallback ?? null}</>;
  }

  const sized = fill
    ? { fill: true as const }
    : { width: width ?? 400, height: height ?? 300 };

  return (
    <Image
      src={src}
      alt={alt}
      className={className}
      onError={() => setError(true)}
      unoptimized
      sizes={sizes}
      priority={priority}
      loading={priority ? undefined : (loading ?? "lazy")}
      quality={quality}
      {...sized}
    />
  );
}
