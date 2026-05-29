// House palette. The audit called out random violet/blue/cyan gradients
// leaking into chrome as fallback backgrounds — those were hash-keyed by
// name so they weren't even game-specific. Everything chrome-side stays in
// the amber/honey family now; game-specific colour only appears inside
// game-specific content blocks (banners, rarity badges, tier list rows).

const AMBER_GRADIENTS = [
  "from-amber-900 to-amber-700",
  "from-amber-800 to-orange-700",
  "from-orange-900 to-amber-700",
  "from-yellow-900 to-amber-700",
  "from-amber-950 to-amber-800",
] as const;

export function cardGradient(name: string): string {
  if (!name) return AMBER_GRADIENTS[0];
  return AMBER_GRADIENTS[name.charCodeAt(0) % AMBER_GRADIENTS.length];
}

// Tier-color classes for items keyed by rarity. Each entry exposes the three
// shapes the UI needs: a glow ring around the card, a coloured border on the
// card, and a badge pill on the detail page. Yellow = highest rarity in each
// game's scheme (SSR/UR/S), purple = mid (SR/A), blue = R-tier. Keep these
// as literal class strings — Tailwind's JIT scans this file, and dynamic
// concatenation (e.g. `shadow-${color}-500`) would be invisible to it.
export interface RarityClasses {
  glow: string;
  border: string;
  badge: string;
}

export const RARITY_CLASSES: Record<string, RarityClasses> = {
  SSR: {
    glow: "shadow-yellow-500/20",
    border: "border-yellow-700/50",
    badge: "text-yellow-400 border-yellow-700 bg-yellow-900/20",
  },
  UR: {
    glow: "shadow-yellow-500/20",
    border: "border-yellow-700/50",
    badge: "text-yellow-400 border-yellow-700 bg-yellow-900/20",
  },
  S: {
    glow: "shadow-yellow-500/20",
    border: "border-yellow-700/50",
    badge: "text-yellow-400 border-yellow-700 bg-yellow-900/20",
  },
  SR: {
    glow: "shadow-purple-500/20",
    border: "border-purple-700/50",
    badge: "text-purple-400 border-purple-700 bg-purple-900/20",
  },
  A: {
    glow: "shadow-purple-500/20",
    border: "border-purple-700/50",
    badge: "text-purple-400 border-purple-700 bg-purple-900/20",
  },
  R: {
    glow: "shadow-blue-500/20",
    border: "border-blue-700/50",
    badge: "text-blue-400 border-blue-700 bg-blue-900/20",
  },
};

export const RARITY_BADGE_FALLBACK = "text-gray-400 border-gray-700 bg-gray-800";
