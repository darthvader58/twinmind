'use client';

import { useEffect, useRef } from 'react';

import { TranscriptLine } from '@/components/transcript/TranscriptLine';
import { useSessionStore } from '@/lib/store/session';

interface Props {
  onRetry?: (id: string) => void;
}

const STICK_THRESHOLD_PX = 32;

export const TranscriptList = ({ onRetry }: Props) => {
  const chunks = useSessionStore((s) => s.chunks);
  const pendingIds = useSessionStore((s) => s.pendingChunkIds);

  const scrollRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    stickToBottom.current = distance <= STICK_THRESHOLD_PX;
  };

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (stickToBottom.current) el.scrollTop = el.scrollHeight;
  }, [chunks.length]);

  return (
    <div
      ref={scrollRef}
      onScroll={onScroll}
      className="flex-1 min-h-0 overflow-y-auto pr-1"
    >
      {chunks.length === 0 ? (
        <p className="py-2 text-sm text-[var(--muted)]">
          Waiting for first transcript chunk…
        </p>
      ) : (
        chunks.map((c) => (
          <TranscriptLine
            key={c.id}
            chunk={c}
            pending={pendingIds.has(c.id)}
            onRetry={onRetry}
          />
        ))
      )}
    </div>
  );
};
