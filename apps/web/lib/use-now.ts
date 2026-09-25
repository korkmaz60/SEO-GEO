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

/**
 * `now`, or `date` when it is later: data fetched since the last tick is "now", never "in 40
 * seconds".
 */
export function notBefore(now: Date, date: Date | string): Date {
  const time = new Date(date).getTime();
  return time > now.getTime() ? new Date(time) : now;
}
