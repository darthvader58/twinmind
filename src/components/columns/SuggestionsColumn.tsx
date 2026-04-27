'use client';

import { AutoRefreshTimer } from '@/components/suggestions/AutoRefreshTimer';
import { ReloadButton } from '@/components/suggestions/ReloadButton';
import { SuggestionBatch } from '@/components/suggestions/SuggestionBatch';
import { TYPE_META } from '@/components/suggestions/typeMeta';
import { Card } from '@/components/ui/Card';
import { Pill } from '@/components/ui/Pill';
import { useSessionStore } from '@/lib/store/session';
import type { Suggestion, SuggestionType } from '@/lib/types';

interface Props {
  onReload?: () => void;
  onSuggestionClick?: (s: Suggestion) => void;
}

const TYPE_ORDER: SuggestionType[] = [
  'question_to_ask',
  'talking_point',
  'answer',
  'fact_check',
  'clarifying_info',
];

export const SuggestionsColumn = ({ onReload, onSuggestionClick }: Props) => {
  const batches = useSessionStore((s) => s.batches);
  const suggestionsLoading = useSessionStore((s) => s.suggestionsLoading);
  const suggestionsError = useSessionStore((s) => s.suggestionsError);

  const handleReload = onReload ?? (() => undefined);
  const handleClick = onSuggestionClick ?? (() => undefined);

  const statusPill = suggestionsLoading ? (
    <Pill variant="info">GENERATING…</Pill>
  ) : (
    <Pill variant="mute">
      {batches.length} {batches.length === 1 ? 'BATCH' : 'BATCHES'}
    </Pill>
  );

  return (
    <Card headerLabel="SUGGESTIONS" headerRight={statusPill} className="h-full">
      <div className="mb-3 flex items-center justify-between gap-3">
        <ReloadButton onClick={handleReload} loading={suggestionsLoading} />
        <AutoRefreshTimer />
      </div>

      {suggestionsError ? (
        <div className="mb-3 flex items-center justify-between gap-3 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-200">
          <span>{suggestionsError.message}</span>
          <button
            type="button"
            onClick={handleReload}
            className="rounded-md border border-red-500/40 bg-red-500/15 px-2 py-1 text-[11px] font-semibold text-red-200 hover:bg-red-500/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
          >
            Try again
          </button>
        </div>
      ) : null}

      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto pr-1">
        {batches.length === 0 && !suggestionsLoading ? (
          <div className="rounded-lg border border-[var(--panel-border)] bg-[var(--panel-inner)]/40 p-3">
            <p className="mb-2 text-xs text-[var(--muted)]">
              Each batch shows 3 fresh, mixed-type suggestions every ~30s:
            </p>
            <ul className="flex flex-col gap-1.5">
              {TYPE_ORDER.map((t) => {
                const meta = TYPE_META[t];
                return (
                  <li key={t} className="flex items-start gap-2 text-xs">
                    <span
                      className={`mt-0.5 inline-flex shrink-0 items-center rounded-full border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.14em] ${meta.bg} ${meta.text} ${meta.border}`}
                    >
                      {meta.label}
                    </span>
                    <span className="text-[var(--muted)]">{meta.description}</span>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}

        {batches.map((b, i) => (
          <SuggestionBatch
            key={b.id}
            batch={b}
            batchNumber={batches.length - i}
            opacity={Math.max(0.6, 1 - i * 0.1)}
            onClick={handleClick}
          />
        ))}
      </div>
    </Card>
  );
};
