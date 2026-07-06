// Convert between a "YYYY-MM-DDTHH:MM" wall-clock string (as produced by
// <input type="datetime-local"> / DateTimeField) and a UTC instant, treating
// the wall clock as belonging to an arbitrary IANA time zone rather than the
// browser's local zone.
//
// The app stores every event as an absolute UTC instant. The admin editor lets
// the author say whether the numbers they typed are in *their* local time or in
// the *server's* time (e.g. HSR "Server Time" = Asia/UTC+8). These helpers do
// the server-time direction; the local direction stays plain `new Date(wall)` /
// `isoToLocalInput`. No date library needed — `Intl` knows every zone's offset,
// including historical DST.

// Offset (ms) of `timeZone` at the given UTC instant: (wall clock in zone) − UTC.
function tzOffsetMs(utcMs: number, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = dtf.formatToParts(new Date(utcMs));
  const g = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  let hour = g("hour");
  if (hour === 24) hour = 0; // some engines emit "24" for midnight
  const asIfUtc = Date.UTC(g("year"), g("month") - 1, g("day"), hour, g("minute"), g("second"));
  return asIfUtc - utcMs;
}

// Interpret a "YYYY-MM-DDTHH:MM" wall clock as local to `timeZone` and return
// the UTC instant as an ISO string. Empty input → "".
export function zonedInputToIso(wall: string, timeZone: string): string {
  if (!wall) return "";
  const [datePart, timePart = "00:00"] = wall.split("T");
  const [y, mo, d] = datePart.split("-").map(Number);
  const [h, mi] = timePart.split(":").map(Number);
  const guess = Date.UTC(y, (mo || 1) - 1, d, h, mi);
  // One refinement pass so instants near a DST transition resolve correctly:
  // the offset at the guessed instant may differ from the offset at the true
  // instant, so recompute using the corrected value.
  const o1 = tzOffsetMs(guess, timeZone);
  const o2 = tzOffsetMs(guess - o1, timeZone);
  return new Date(guess - o2).toISOString();
}

// Format a UTC ISO instant as a "YYYY-MM-DDTHH:MM" wall clock in `timeZone`.
// Empty/null input → "".
export function isoToZonedInput(iso: string | null, timeZone: string): string {
  if (!iso) return "";
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
  const parts = dtf.formatToParts(new Date(iso));
  const g = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  let hh = g("hour");
  if (hh === "24") hh = "00";
  return `${g("year")}-${g("month")}-${g("day")}T${hh}:${g("minute")}`;
}
