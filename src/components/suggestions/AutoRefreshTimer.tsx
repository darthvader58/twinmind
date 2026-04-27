'use client';

import { useEffect, useState } from 'react';

import { useSessionStore } from '@/lib/store/session';
import { nowMs } from '@/lib/time';

export const AutoRefreshTimer = () => {
  const nextRefreshAtMs = useSessionStore((s) => s.nextRefreshAtMs);
  const recording = useSessionStore((s) => s.recording);
  const [, force] = useState(0);

  useEffect(() => {
    const id = window.setInterval(() => force((t) => t + 1), 1000);
    return () => window.clearInterval(id);
  }, []);

  const remainingMs = nextRefreshAtMs - nowMs();
  const seconds = Math.max(0, Math.ceil(remainingMs / 1000));
  const paused =
    recording !== 'recording' || nextRefreshAtMs === 0 || remainingMs <= 0;

  return (
    <span
      role="status"
      aria-live="polite"
      className="text-xs text-[var(--muted)] tabular-nums"
    >
      {paused ? 'auto-refresh paused' : `auto-refresh in ${seconds}s`}
    </span>
  );
};
