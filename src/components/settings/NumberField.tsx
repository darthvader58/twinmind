interface Props {
  label: string;
  value: number;
  onChange: (n: number) => void;
  min?: number;
  max?: number;
  step?: number;
  suffix?: string;
}

export const NumberField = ({
  label,
  value,
  onChange,
  min,
  max,
  step,
  suffix,
}: Props) => {
  const id = `nf-${label.toLowerCase().replace(/\s+/g, '-')}`;
  return (
    <label htmlFor={id} className="flex flex-col gap-1.5 text-xs text-[var(--muted)]">
      <span className="font-medium uppercase tracking-[0.14em]">{label}</span>
      <div className="flex items-center gap-2">
        <input
          id={id}
          type="number"
          inputMode="numeric"
          value={value}
          min={min}
          max={max}
          step={step ?? 1}
          onChange={(e) => {
            const n = Number(e.target.value);
            if (Number.isFinite(n)) onChange(n);
          }}
          className="w-full rounded-lg border border-[var(--panel-border)] bg-black/30 px-2.5 py-1.5 text-sm text-[var(--fg)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
        />
        {suffix ? (
          <span className="shrink-0 text-[10px] uppercase tracking-[0.14em] text-[var(--muted)]">
            {suffix}
          </span>
        ) : null}
      </div>
    </label>
  );
};
