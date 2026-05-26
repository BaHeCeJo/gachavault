"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface Props {
  placeholder: string;
  buttonLabel: string;
}

export default function HomeSearchForm({ placeholder, buttonLabel }: Props) {
  const router = useRouter();
  const [query, setQuery] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = query.trim();
    if (trimmed) router.push(`/search?q=${encodeURIComponent(trimmed)}`);
  }

  return (
    <form onSubmit={handleSubmit} className="relative w-full max-w-xl flex gap-2">
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={placeholder}
        className="flex-1 px-4 py-3 rounded-lg bg-gray-900 border border-gray-700 focus:outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-500/50 text-sm transition"
      />
      <button
        type="submit"
        className="px-6 py-3 bg-amber-500 text-black rounded-lg font-semibold text-sm hover:bg-amber-400 transition shadow-lg shadow-amber-500/20"
      >
        {buttonLabel}
      </button>
    </form>
  );
}
