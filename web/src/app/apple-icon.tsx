import { ImageResponse } from "next/og";

export const runtime = "edge";

// Apple touch icon (shown when the site is saved to an iOS/iPadOS home screen).
// Next's file convention auto-injects the <link rel="apple-touch-icon">, which
// the SEO audit flagged as missing. 180x180 is Apple's recommended size; a
// solid background is required since iOS doesn't composite transparency.
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#0a0a0a",
          fontFamily: "ui-sans-serif, system-ui",
        }}
      >
        <div
          style={{
            fontSize: 120,
            fontWeight: 600,
            letterSpacing: "-0.04em",
            display: "flex",
            color: "#fbbf24",
          }}
        >
          H
        </div>
      </div>
    ),
    { ...size },
  );
}
