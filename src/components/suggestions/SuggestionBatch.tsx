import { SuggestionCard } from '@/components/suggestions/SuggestionCard';
import { formatClock } from '@/lib/time';
import type { Suggestion, SuggestionBatch as SuggestionBatchType } from '@/lib/types';

interface Props {
  batch: SuggestionBatchType;
  batchNumber: number;
  opacity: number;
  onClick: (s: Suggestion) => void;
}

export const SuggestionBatch = ({ batch, batchNumber, opacity, onClick }: Props) => (
  <div className="flex flex-col gap-3" style={{ opacity }}>
    <div className="flex flex-col gap-3">
      {batch.suggestions.map((s) => (
        <SuggestionCard key={s.id} suggestion={s} onClick={() => onClick(s)} />
      ))}
    </div>
    {batch.error ? (
      <p className="text-center text-xs text-red-300">
        Batch error: {batch.error.message}
      </p>
    ) : (
      <p className="text-center text-[10px] uppercase tracking-[0.18em] text-[var(--muted)]">
        — Batch {batchNumber} · {formatClock(batch.generatedAt)} —
      </p>
    )}
  </div>
);
