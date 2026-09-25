"use client";

import { useEffect, useState } from "react";

/**
 * The current time, refreshed every `intervalMs`. Relative times ("3 minutes ago") must take
 * `now` from here: computed from `new Date()` during render, they go stale once the React
 * Compiler memoizes the element.
 */
export function useNow(intervalMs = 60_000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}
