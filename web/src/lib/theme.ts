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
