import { clsx } from 'clsx';

import type { ChatMessage as ChatMessageType } from '@/lib/types';

interface Props {
  message: ChatMessageType;
}

export const ChatMessage = ({ message }: Props) => {
  const isUser = message.role === 'user';
  return (
    <div className={clsx('flex flex-col py-1.5', isUser ? 'items-end' : 'items-start')}>
      {isUser && message.sourceSuggestionPreview ? (
        <span className="mb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
          From suggestion
        </span>
      ) : null}
      {isUser ? (
        <div className="max-w-[80%] self-end break-words rounded-2xl bg-white/10 px-3 py-2 text-sm text-[var(--fg)]">
          {message.text}
        </div>
      ) : (
        <p className="max-w-[92%] whitespace-pre-wrap break-words text-sm leading-relaxed text-[var(--fg)]">
          {message.text}
          {message.streaming ? (
            <span aria-hidden="true" className="ml-0.5 animate-pulse">
              ▍
            </span>
          ) : null}
        </p>
      )}
      {message.error ? (
        <p className="mt-1 text-xs text-red-300">{message.error.message}</p>
      ) : null}
    </div>
  );
};
