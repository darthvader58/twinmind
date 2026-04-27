import type { ReactNode } from 'react';

import { clsx } from 'clsx';

import type { SuggestionType } from '@/lib/types';

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

export const TYPE_COLOR: Record<
  SuggestionType,
  { ring: string; bg: string; text: string; label: string; border: string }
> = {
  question_to_ask: {
    ring: 'ring-[var(--accent-blue)]/40',
    bg: 'bg-[var(--accent-blue)]/10',
    text: 'text-[var(--accent-blue)]',
    border: 'border-[var(--accent-blue)]/40',
    label: 'Question',
  },
  talking_point: {
    ring: 'ring-[var(--accent-violet)]/40',
    bg: 'bg-[var(--accent-violet)]/10',
    text: 'text-[var(--accent-violet)]',
    border: 'border-[var(--accent-violet)]/40',
    label: 'Talking point',
  },
  answer: {
    ring: 'ring-[var(--accent-green)]/40',
    bg: 'bg-[var(--accent-green)]/10',
    text: 'text-[var(--accent-green)]',
    border: 'border-[var(--accent-green)]/40',
    label: 'Answer',
  },
  fact_check: {
    ring: 'ring-[var(--accent-amber)]/40',
    bg: 'bg-[var(--accent-amber)]/10',
    text: 'text-[var(--accent-amber)]',
    border: 'border-[var(--accent-amber)]/40',
    label: 'Fact-check',
  },
  clarifying_info: {
    ring: 'ring-[var(--accent-cyan)]/40',
    bg: 'bg-[var(--accent-cyan)]/10',
    text: 'text-[var(--accent-cyan)]',
    border: 'border-[var(--accent-cyan)]/40',
    label: 'Clarify',
  },
};

export const TypePill = ({ type, className }: { type: SuggestionType; className?: string }) => {
  const tone = TYPE_COLOR[type];
  return (
    <span
      className={clsx(
        'inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em]',
        tone.bg,
        tone.text,
        tone.border,
        className,
      )}
    >
      {tone.label}
    </span>
  );
};
