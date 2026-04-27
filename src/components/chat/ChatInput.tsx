'use client';

import { useRef, useState, type KeyboardEvent } from 'react';

import { clsx } from 'clsx';

interface Props {
  onSend: (text: string) => void;
  disabled?: boolean;
  placeholder?: string;
}

const MAX_HEIGHT_PX = 144;

export const ChatInput = ({ onSend, disabled, placeholder }: Props) => {
  const [value, setValue] = useState('');
  const ref = useRef<HTMLTextAreaElement>(null);

  const resize = () => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, MAX_HEIGHT_PX)}px`;
  };

  const submit = () => {
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setValue('');
    const el = ref.current;
    if (el) el.style.height = 'auto';
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  const cannotSend = disabled || value.trim() === '';

  return (
    <div className="flex items-end gap-2 border-t border-[var(--panel-border)] pt-3">
      <textarea
        ref={ref}
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          resize();
        }}
        onKeyDown={onKeyDown}
        rows={1}
        disabled={disabled}
        placeholder={placeholder ?? 'Ask a follow-up about the conversation…'}
        aria-label="Chat input"
        style={{ maxHeight: MAX_HEIGHT_PX }}
        className={clsx(
          'min-h-[36px] flex-1 resize-none rounded-lg border border-[var(--panel-border)] bg-black/30 px-3 py-2 text-sm leading-relaxed text-[var(--fg)] placeholder:text-[var(--muted)]',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]',
          'disabled:cursor-not-allowed disabled:opacity-60',
        )}
      />
      <button
        type="button"
        onClick={submit}
        disabled={cannotSend}
        aria-label="Send message"
        className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[var(--accent-blue)]/30 bg-[var(--accent-blue)]/15 text-[var(--accent-blue)] transition-colors hover:bg-[var(--accent-blue)]/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] disabled:cursor-not-allowed disabled:opacity-50"
      >
        <svg
          aria-hidden="true"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M5 12h14" />
          <path d="m13 6 6 6-6 6" />
        </svg>
      </button>
    </div>
  );
};
