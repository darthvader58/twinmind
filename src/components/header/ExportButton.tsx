interface Props {
  onClick: () => void;
}

export const ExportButton = ({ onClick }: Props) => (
  <button
    type="button"
    onClick={onClick}
    aria-label="Export session"
    className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[var(--panel-border)] bg-[var(--panel-inner)] px-3 text-xs font-medium text-[var(--fg)] transition-colors hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
  >
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
      <path d="M12 3v12" />
      <path d="m6 9 6 6 6-6" />
      <path d="M5 21h14" />
    </svg>
    Export
  </button>
);
