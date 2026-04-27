interface Props {
  label: string;
  value: string;
  onChange: (v: string) => void;
}

export const PromptEditor = ({ label, value, onChange }: Props) => {
  const id = `pe-${label.toLowerCase().replace(/\s+/g, '-')}`;
  return (
    <label htmlFor={id} className="flex flex-col gap-1.5">
      <span className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
        {label}
      </span>
      <textarea
        id={id}
        rows={10}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        spellCheck={false}
        className="max-h-80 w-full resize-y overflow-auto rounded-lg border border-[var(--panel-border)] bg-black/30 p-2 font-mono text-xs leading-relaxed text-[var(--fg)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
      />
    </label>
  );
};
