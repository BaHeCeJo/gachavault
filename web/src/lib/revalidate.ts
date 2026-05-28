// Best-effort cache invalidation for the public pages after an admin write.
// Called fire-and-forget from admin save handlers — failures are swallowed
// because a stale page for up to 5 min (the ISR fallback) is never worse
// than a broken admin flow.

export async function revalidateGame(slug: string): Promise<void> {
  try {
    await fetch("/api/revalidate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ gameSlug: slug }),
    });
  } catch {
    /* swallow */
  }
}

export async function revalidatePaths(paths: string[]): Promise<void> {
  try {
    await fetch("/api/revalidate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ paths }),
    });
  } catch {
    /* swallow */
  }
}
