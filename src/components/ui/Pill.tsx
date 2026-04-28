import type { ReactNode } from 'react';

import { clsx } from 'clsx';

type Variant = 'idle' | 'recording' | 'success' | 'info' | 'warn' | 'mute';

interface PillProps {
  children?: ReactNode;
  variant?: Variant;
  className?: string;
}

const VARIANT: Record<Variant, string> = {
  idle: 'border-[var(--panel-border)] bg-[var(--panel-inner)] text-[var(--muted)]',
  recording: 'border-red-500/40 bg-red-500/10 text-red-300',
  success: 'border-[var(--accent-green)]/40 bg-[var(--accent-green)]/10 text-[var(--accent-green)]',
  info: 'border-[var(--accent-blue)]/40 bg-[var(--accent-blue)]/10 text-[var(--accent-blue)]',
  warn: 'border-[var(--accent-amber)]/40 bg-[var(--accent-amber)]/10 text-[var(--accent-amber)]',
  mute: 'border-[var(--panel-border)] bg-transparent text-[var(--muted)]',
};

export const Pill = ({ children, variant = 'idle', className }: PillProps) => (
  <span
    className={clsx(
      'inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em]',
      VARIANT[variant],
      className,
    )}
  >
    {variant === 'recording' ? (
      <span
        aria-hidden="true"
        className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-400"
      />
    ) : null}
    {children}
  </span>
);
