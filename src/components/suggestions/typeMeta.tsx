import { clsx } from 'clsx';

import type { SuggestionType } from '@/lib/types';

export interface TypeMeta {
  ring: string;
  bg: string;
  text: string;
  border: string;
  label: string;
  description: string;
}

export const TYPE_META: Record<SuggestionType, TypeMeta> = {
  summary: {
    ring: 'ring-[var(--accent-cyan)]/40',
    bg: 'bg-[var(--accent-cyan)]/10',
    text: 'text-[var(--accent-cyan)]',
    border: 'border-[var(--accent-cyan)]/40',
    label: 'Summary',
    description:
      'A 1–2 line recap of where the conversation just landed, with any verifiable claim verdict folded in.',
  },
  follow_up_question: {
    ring: 'ring-[var(--accent-blue)]/40',
    bg: 'bg-[var(--accent-blue)]/10',
    text: 'text-[var(--accent-blue)]',
    border: 'border-[var(--accent-blue)]/40',
    label: 'Follow-up',
    description: 'The single sharpest next question that builds on what was just said.',
  },
  tangential_discussion: {
    ring: 'ring-[var(--accent-pink)]/40',
    bg: 'bg-[var(--accent-pink)]/10',
    text: 'text-[var(--accent-pink)]',
    border: 'border-[var(--accent-pink)]/40',
    label: 'Tangent',
    description:
      'An adjacent thread worth bringing up next — names what to raise and why.',
  },
  answer: {
    ring: 'ring-[var(--accent-green)]/40',
    bg: 'bg-[var(--accent-green)]/10',
    text: 'text-[var(--accent-green)]',
    border: 'border-[var(--accent-green)]/40',
    label: 'Answer',
    description: 'A direct answer to a fresh, unanswered question in the recent transcript.',
  },
};

export const TypePill = ({ type, className }: { type: SuggestionType; className?: string }) => {
  const tone = TYPE_META[type];
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
