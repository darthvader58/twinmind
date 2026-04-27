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
  question_to_ask: {
    ring: 'ring-[var(--accent-blue)]/40',
    bg: 'bg-[var(--accent-blue)]/10',
    text: 'text-[var(--accent-blue)]',
    border: 'border-[var(--accent-blue)]/40',
    label: 'Question',
    description: 'A sharp, specific question to ask next.',
  },
  talking_point: {
    ring: 'ring-[var(--accent-violet)]/40',
    bg: 'bg-[var(--accent-violet)]/10',
    text: 'text-[var(--accent-violet)]',
    border: 'border-[var(--accent-violet)]/40',
    label: 'Talking point',
    description: 'A specific point to make, with concrete evidence.',
  },
  answer: {
    ring: 'ring-[var(--accent-green)]/40',
    bg: 'bg-[var(--accent-green)]/10',
    text: 'text-[var(--accent-green)]',
    border: 'border-[var(--accent-green)]/40',
    label: 'Answer',
    description: 'A direct answer to a question that was just asked.',
  },
  fact_check: {
    ring: 'ring-[var(--accent-amber)]/40',
    bg: 'bg-[var(--accent-amber)]/10',
    text: 'text-[var(--accent-amber)]',
    border: 'border-[var(--accent-amber)]/40',
    label: 'Fact-check',
    description: 'A verdict on a claim that was just made.',
  },
  clarifying_info: {
    ring: 'ring-[var(--accent-cyan)]/40',
    bg: 'bg-[var(--accent-cyan)]/10',
    text: 'text-[var(--accent-cyan)]',
    border: 'border-[var(--accent-cyan)]/40',
    label: 'Clarify',
    description: 'A tight definition for a term or concept used.',
  },
};
