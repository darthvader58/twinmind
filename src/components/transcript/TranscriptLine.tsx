import { formatClock } from '@/lib/time';
import type { SpeakerRole, TranscriptChunk } from '@/lib/types';

interface Props {
  chunk: TranscriptChunk;
  pending?: boolean;
  onRetry?: (id: string) => void;
}

const ROLE_CHIP: Partial<Record<SpeakerRole, { label: string; cls: string }>> = {
  user: { label: 'you', cls: 'bg-[var(--accent-blue)]/15 text-[var(--accent-blue)]' },
  other: { label: 'them', cls: 'bg-[var(--muted)]/15 text-[var(--muted)]' },
  mixed: { label: 'mix', cls: 'bg-[var(--muted)]/10 text-[var(--muted)]' },
};

const RoleChip = ({ role }: { role?: SpeakerRole }) => {
  if (!role) return null;
  const chip = ROLE_CHIP[role];
  if (!chip) return null;
  return (
    <span
      className={`shrink-0 select-none rounded px-1.5 py-0.5 text-[10px] font-mono uppercase tracking-wide ${chip.cls}`}
    >
      {chip.label}
    </span>
  );
};

export const TranscriptLine = ({ chunk, pending, onRetry }: Props) => {
  const ts = formatClock(chunk.startedAtMs);

  if (chunk.error) {
    return (
      <div className="flex items-start gap-3 py-1.5">
        <span className="shrink-0 select-none pt-0.5 text-[11px] font-mono text-[var(--muted)] tabular-nums">
          {ts}
        </span>
        <div className="min-w-0 flex-1 text-sm">
          <span className="text-red-300">
            <span className="text-[var(--muted)]">Failed to transcribe — </span>
            {chunk.error.message}
          </span>
          {onRetry ? (
            <button
              type="button"
              onClick={() => onRetry(chunk.id)}
              className="ml-2 text-xs text-[var(--accent-blue)] underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
            >
              Retry
            </button>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-3 py-1.5">
      <span className="shrink-0 select-none pt-0.5 text-[11px] font-mono text-[var(--muted)] tabular-nums">
        {ts}
      </span>
      <RoleChip role={chunk.speakerRole} />
      <p className="min-w-0 flex-1 text-sm leading-relaxed text-[var(--fg)]">
        {chunk.text || (
          <span className="italic text-[var(--muted)]">
            {pending ? 'transcribing…' : '(silence)'}
          </span>
        )}
      </p>
    </div>
  );
};
