const SUPPORTED = ["en", "fr"] as const;
type Locale = (typeof SUPPORTED)[number];

export function getClientLocale(): Locale {
  if (typeof document === "undefined") return "en";
  const raw = document.cookie
    .split("; ")
    .find((r) => r.startsWith("locale="))
    ?.split("=")[1];
  return raw && SUPPORTED.includes(raw as Locale) ? (raw as Locale) : "en";
}
