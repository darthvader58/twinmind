import { clsx } from 'clsx';

import type { RecordingState } from '@/lib/types';

interface Props {
  recording: RecordingState;
  onClick: () => void;
  disabled?: boolean;
}

export const MicButton = ({ recording, onClick, disabled }: Props) => {
  const isOn = recording === 'recording';
  const transitioning = recording === 'starting' || recording === 'stopping';
  const label = isOn ? 'Stop recording' : 'Start recording';
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || transitioning}
      aria-label={label}
      aria-pressed={isOn}
      className={clsx(
        'flex h-12 w-12 shrink-0 items-center justify-center rounded-full transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]',
        'disabled:cursor-not-allowed disabled:opacity-60',
        isOn
          ? 'animate-pulse bg-red-500 text-white ring-4 ring-red-500/30'
          : 'bg-[var(--accent-blue)]/20 text-[var(--accent-blue)] hover:bg-[var(--accent-blue)]/30',
      )}
    >
      <svg
        aria-hidden="true"
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <rect x="9" y="3" width="6" height="12" rx="3" />
        <path d="M5 11a7 7 0 0 0 14 0" />
        <path d="M12 18v3" />
        <path d="M9 21h6" />
      </svg>
    </button>
  );
};
