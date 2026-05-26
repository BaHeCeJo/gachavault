import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "Hotarumi — Multi-game gacha tracker";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "radial-gradient(circle at 50% 40%, rgba(251,191,36,0.25), rgba(10,10,10,1) 70%)",
          color: "#fff",
          fontFamily: "ui-sans-serif, system-ui",
          padding: "80px",
        }}
      >
        <div
          style={{
            fontSize: 140,
            fontWeight: 600,
            letterSpacing: "-0.04em",
            display: "flex",
            color: "#fff",
          }}
        >
          <span style={{ color: "#fbbf24" }}>H</span>
          <span>otarumi</span>
        </div>
        <div
          style={{
            fontSize: 36,
            color: "#9ca3af",
            marginTop: 20,
            textAlign: "center",
            maxWidth: 900,
            display: "flex",
          }}
        >
          Track every character you own across multiple gacha games.
        </div>
      </div>
    ),
    { ...size },
  );
}
