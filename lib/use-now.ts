'use client';

import { useEffect, useState } from 'react';

/** The current time as state, refreshed every minute, so render stays pure. Zero until mounted. */
export function useNow(intervalMs = 60000): number {
  const [now, setNow] = useState(0);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const timer = window.setTimeout(tick, 0);
    const interval = window.setInterval(tick, intervalMs);
    return () => { window.clearTimeout(timer); window.clearInterval(interval); };
  }, [intervalMs]);
  return now;
}
