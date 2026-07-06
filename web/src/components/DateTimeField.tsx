"use client";

import { useEffect, useId, useRef, useState } from "react";

// Drop-in replacement for `<input type="datetime-local">` that keeps the
// native calendar for the date but swaps the fiddly hour/minute spinner for
// two plain, typeable number fields. You tab in, type "14" then "30", and the
// value is validated (clamped 0–23 / 0–59, zero-padded) on blur — no infinite
// scroll wheel to fight with.
//
// Value in / out uses the exact same string shape as datetime-local
// ("YYYY-MM-DDTHH:MM", or "" for empty), so it slots into existing form state
// and `new Date(value)` / `isoToLocalInput()` round-trips unchanged.

interface DateTimeFieldProps {
  value: string;
  onChange: (value: string) => void;
  /** Visible label rendered above the field. */
  label?: string;
  /** Accessible name for the group when there is no visible `label`. */
  ariaLabel?: string;
  /** Compact sizing for tight rows (e.g. per-server grids). */
  compact?: boolean;
  className?: string;
}

function parse(value: string): { date: string; hour: string; minute: string } {
  const [datePart = "", timePart = ""] = value.split("T");
  const [hour = "", minute = ""] = timePart.split(":");
  return { date: datePart, hour, minute };
}

function clampPad(raw: string, max: number): string {
  if (raw === "") return "00";
  const n = Math.max(0, Math.min(max, parseInt(raw, 10) || 0));
  return String(n).padStart(2, "0");
}

export default function DateTimeField({
  value,
  onChange,
  label,
  ariaLabel,
  compact = false,
  className = "",
}: DateTimeFieldProps) {
  const labelId = useId();
  const parsed = parse(value);
  const [date, setDate] = useState(parsed.date);
  const [hour, setHour] = useState(parsed.hour);
  const [minute, setMinute] = useState(parsed.minute);

  // Track what we last emitted so an external value change (modal reopened,
  // form reset) re-syncs the fields, but our own edits don't clobber
  // mid-typing (e.g. rewriting "1" to "01" while the user is still typing).
  const lastEmitted = useRef<string | null>(null);
  useEffect(() => {
    if (value === lastEmitted.current) return;
    const p = parse(value);
    setDate(p.date);
    setHour(p.hour);
    setMinute(p.minute);
  }, [value]);

  const emit = (d: string, h: string, m: string) => {
    const next = d ? `${d}T${clampPad(h, 23)}:${clampPad(m, 59)}` : "";
    lastEmitted.current = next;
    onChange(next);
  };

  const onDate = (d: string) => {
    setDate(d);
    emit(d, hour, minute);
  };

  const onTimePart = (
    raw: string,
    set: (v: string) => void,
    which: "hour" | "minute",
  ) => {
    const digits = raw.replace(/\D/g, "").slice(0, 2);
    set(digits);
    if (which === "hour") emit(date, digits, minute);
    else emit(date, hour, digits);
  };

  const onHourBlur = () => {
    const padded = clampPad(hour, 23);
    setHour(padded);
    emit(date, padded, minute);
  };

  const onMinuteBlur = () => {
    const padded = clampPad(minute, 59);
    setMinute(padded);
    emit(date, hour, padded);
  };

  const groupLabel = label ?? ariaLabel;
  const box = compact
    ? "px-2 py-1.5 text-xs"
    : "px-3 py-2 text-sm";
  const timeBox = compact
    ? "w-9 px-1.5 py-1.5 text-xs"
    : "w-11 px-2 py-2 text-sm";
  const inputBase =
    "rounded-lg bg-gray-800 border border-gray-700 focus:outline-none focus:border-white";

  return (
    <div className={className}>
      {label && (
        <label id={labelId} className="text-xs text-gray-400 block mb-1">
          {label}
        </label>
      )}
      <div
        role="group"
        aria-label={!label ? groupLabel : undefined}
        aria-labelledby={label ? labelId : undefined}
        className="flex items-center gap-2"
      >
        <input
          type="date"
          value={date}
          onChange={(e) => onDate(e.target.value)}
          aria-label={groupLabel ? `${groupLabel} — date` : "Date"}
          className={`flex-1 min-w-0 ${inputBase} ${box}`}
        />
        <div className="flex items-center gap-1">
          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={2}
            placeholder="HH"
            value={hour}
            onChange={(e) => onTimePart(e.target.value, setHour, "hour")}
            onBlur={onHourBlur}
            aria-label={groupLabel ? `${groupLabel} — hour (00–23)` : "Hour (00–23)"}
            className={`text-center tabular-nums ${inputBase} ${timeBox}`}
          />
          <span aria-hidden className="text-gray-500">:</span>
          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={2}
            placeholder="MM"
            value={minute}
            onChange={(e) => onTimePart(e.target.value, setMinute, "minute")}
            onBlur={onMinuteBlur}
            aria-label={groupLabel ? `${groupLabel} — minute (00–59)` : "Minute (00–59)"}
            className={`text-center tabular-nums ${inputBase} ${timeBox}`}
          />
        </div>
      </div>
    </div>
  );
}
