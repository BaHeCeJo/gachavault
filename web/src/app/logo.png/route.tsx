import { ImageResponse } from "next/og";

export const runtime = "edge";

// Stable square brand mark served at /logo.png. Used as the Organization
// JSON-LD logo: Google needs a reachable raster image, and the page previously
// pointed at /icon.png which 404'd (only icon.svg existed). Generated on the
// fly so there's no binary asset to commit or keep in sync with the brand.
export function GET() {
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
            fontSize: 340,
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
    { width: 512, height: 512 },
  );
}
