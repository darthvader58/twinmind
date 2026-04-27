'use client';

import type { ReactNode } from 'react';

import { MicButton } from '@/components/transcript/MicButton';
import { TranscriptList } from '@/components/transcript/TranscriptList';
import { Card } from '@/components/ui/Card';
import { Pill } from '@/components/ui/Pill';
import { useSessionStore } from '@/lib/store/session';
import type { RecordingState } from '@/lib/types';

interface Props {
  onMicClick?: () => void;
  onRetryChunk?: (id: string) => void;
}

const STATUS_PILL: Record<RecordingState, ReactNode> = {
  idle: <Pill variant="mute">IDLE</Pill>,
  starting: <Pill variant="info">STARTING…</Pill>,
  recording: <Pill variant="recording">RECORDING</Pill>,
  stopping: <Pill variant="mute">STOPPING…</Pill>,
  error: <Pill variant="warn">ERROR</Pill>,
};

export const TranscriptColumn = ({ onMicClick, onRetryChunk }: Props) => {
  const recording = useSessionStore((s) => s.recording);
  const micError = useSessionStore((s) => s.micError);
  const chunks = useSessionStore((s) => s.chunks);
  const handleMic = onMicClick ?? (() => undefined);

  const statusLabel =
    recording === 'recording' ? 'RECORDING' : recording === 'starting' ? 'STARTING' : 'IDLE';

  return (
    <Card headerLabel="TRANSCRIPT" headerRight={STATUS_PILL[recording]} className="h-full">
      <div className="mb-3 flex items-center gap-3">
        <MicButton recording={recording} onClick={handleMic} />
        <div className="flex flex-col">
          <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
            {recording === 'recording' ? (
              <span aria-hidden="true" className="h-2 w-2 animate-pulse rounded-full bg-red-400" />
            ) : null}
            {statusLabel}
          </span>
          {micError ? (
            <span className="mt-0.5 text-xs text-red-300">{micError.message}</span>
          ) : null}
        </div>
      </div>

      {chunks.length === 0 && recording !== 'recording' ? (
        <div className="mb-3 rounded-lg border border-[var(--panel-border)] bg-[var(--panel-inner)]/40 p-3 text-xs text-[var(--muted)]">
          Click the mic to start a live session. Audio is chunked every ~30 seconds and
          transcribed via Whisper Large V3.
        </div>
      ) : null}

      <TranscriptList onRetry={onRetryChunk} />
    </Card>
  );
};
