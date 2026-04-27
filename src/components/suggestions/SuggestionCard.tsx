import { clsx } from 'clsx';

import { TYPE_META } from '@/components/suggestions/typeMeta';
import type { Suggestion } from '@/lib/types';

interface Props {
  suggestion: Suggestion;
  onClick: () => void;
}

export const SuggestionCard = ({ suggestion, onClick }: Props) => {
  const meta = TYPE_META[suggestion.type];
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`${meta.label}: ${suggestion.preview}`}
      className={clsx(
        'group flex w-full flex-col items-start gap-2 rounded-xl border px-3.5 py-3 text-left transition-all',
        'bg-[var(--panel-inner)]/40 hover:-translate-y-[1px] hover:bg-[var(--panel-inner)]',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]',
        meta.border,
      )}
    >
      <span
        className={clsx(
          'inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em]',
          meta.bg,
          meta.text,
          meta.border,
        )}
      >
        {meta.label}
      </span>
      <p className="text-sm leading-snug text-[var(--fg)]">{suggestion.preview}</p>
    </button>
  );
};
