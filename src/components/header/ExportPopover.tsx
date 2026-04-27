'use client';

import { useEffect, useRef } from 'react';

interface Props {
  open: boolean;
  onClose: () => void;
  onDownload: (format: 'json' | 'text') => void;
}

export const ExportPopover = ({ open, onClose, onDownload }: Props) => {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onClick);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onClick);
    };
  }, [open, onClose]);

  if (!open) return null;

  const choose = (fmt: 'json' | 'text') => () => {
    onDownload(fmt);
    onClose();
  };

  return (
    <div
      ref={ref}
      role="menu"
      aria-label="Export options"
      className="absolute right-4 top-14 z-40 w-48 overflow-hidden rounded-xl border border-[var(--panel-border)] bg-[var(--panel)] p-1 ring-1 ring-inset ring-[var(--panel-inner)] shadow-xl"
    >
      <button
        role="menuitem"
        type="button"
        onClick={choose('json')}
        className="block w-full rounded-lg px-3 py-2 text-left text-sm text-[var(--fg)] hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
      >
        Download JSON
      </button>
      <button
        role="menuitem"
        type="button"
        onClick={choose('text')}
        className="block w-full rounded-lg px-3 py-2 text-left text-sm text-[var(--fg)] hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
      >
        Download text
      </button>
    </div>
  );
};
