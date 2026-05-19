"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

const LOCALES = [
  { code: "en", label: "EN", flag: "🇬🇧" },
  { code: "fr", label: "FR", flag: "🇫🇷" },
] as const;

type LocaleCode = (typeof LOCALES)[number]["code"];

function getCurrent(): LocaleCode {
  if (typeof document === "undefined") return "en";
  const m = document.cookie.match(/(?:^|;\s*)locale=([^;]+)/);
  return (m?.[1] as LocaleCode) ?? "en";
}

export default function LanguageSwitcher() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const current = getCurrent();

  function switchLocale(code: LocaleCode) {
    document.cookie = `locale=${code}; path=/; max-age=31536000; SameSite=Lax`;
    startTransition(() => router.refresh());
  }

  return (
    <div className="flex items-center gap-1">
      {LOCALES.map((l) => (
        <button
          key={l.code}
          onClick={() => switchLocale(l.code)}
          disabled={pending}
          className={`text-xs px-1.5 py-0.5 rounded transition ${
            current === l.code
              ? "text-white font-semibold"
              : "text-gray-500 hover:text-gray-300"
          }`}
          title={l.flag}
        >
          {l.label}
        </button>
      ))}
    </div>
  );
}
