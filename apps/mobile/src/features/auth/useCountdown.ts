import { useCallback, useEffect, useState } from 'react';

/** Counts down to zero once a second. Returns the seconds left and a restart function. */
export function useCountdown(initialSeconds: number): [number, (seconds: number) => void] {
  const [remaining, setRemaining] = useState(initialSeconds);

  useEffect(() => {
    if (remaining <= 0) return;
    const timer = setTimeout(() => setRemaining((value) => Math.max(0, value - 1)), 1000);
    return () => clearTimeout(timer);
  }, [remaining]);

  const restart = useCallback((seconds: number) => setRemaining(seconds), []);
  return [remaining, restart];
}

/** 24 -> "0:24" */
export function formatSeconds(total: number): string {
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}
