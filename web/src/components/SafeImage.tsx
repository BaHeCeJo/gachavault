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
}

export function SafeImage({ src, alt, className, fill, width, height, fallback }: SafeImageProps) {
  const [error, setError] = useState(false);

  if (!src || error) {
    return <>{fallback ?? null}</>;
  }

  const props = fill
    ? { fill: true as const }
    : { width: width ?? 400, height: height ?? 300 };

  return (
    <Image
      src={src}
      alt={alt}
      className={className}
      onError={() => setError(true)}
      unoptimized
      {...props}
    />
  );
}
