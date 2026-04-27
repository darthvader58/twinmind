import { Spinner } from '@/components/ui/Spinner';

interface Props {
  onClick: () => void;
  loading: boolean;
  disabled?: boolean;
}

export const ReloadButton = ({ onClick, loading, disabled }: Props) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled || loading}
    aria-label="Reload suggestions"
    aria-busy={loading || undefined}
    className="inline-flex h-9 items-center gap-2 rounded-lg border border-[var(--accent-blue)]/30 bg-[var(--accent-blue)]/10 px-3 text-xs font-medium text-[var(--accent-blue)] transition-colors hover:bg-[var(--accent-blue)]/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] disabled:cursor-not-allowed disabled:opacity-60"
  >
    {loading ? (
      <Spinner size={14} />
    ) : (
      <svg
        aria-hidden="true"
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M21 12a9 9 0 1 1-3-6.7" />
        <path d="M21 4v5h-5" />
      </svg>
    )}
    Reload suggestions
  </button>
);
