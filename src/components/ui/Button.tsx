import type { ButtonHTMLAttributes, ReactNode } from 'react';

import { clsx } from 'clsx';

import { Spinner } from '@/components/ui/Spinner';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md';

interface Props extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'aria-label'> {
  children?: ReactNode;
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  ariaLabel?: string;
}

const VARIANT: Record<Variant, string> = {
  primary:
    'bg-[var(--accent-blue)]/15 text-[var(--accent-blue)] border-[var(--accent-blue)]/30 hover:bg-[var(--accent-blue)]/25',
  secondary:
    'bg-[var(--panel-inner)] text-[var(--fg)] border-[var(--panel-border)] hover:bg-white/5',
  ghost:
    'bg-transparent text-[var(--muted)] border-transparent hover:bg-white/5 hover:text-[var(--fg)]',
  danger:
    'bg-red-500/15 text-red-300 border-red-500/30 hover:bg-red-500/25',
};

const SIZE: Record<Size, string> = {
  sm: 'h-8 px-2.5 text-xs gap-1.5',
  md: 'h-9 px-3 text-sm gap-2',
};

export const Button = ({
  children,
  variant = 'secondary',
  size = 'sm',
  loading = false,
  disabled,
  className,
  type = 'button',
  ariaLabel,
  ...rest
}: Props) => {
  const inferredLabel =
    ariaLabel ?? (typeof children === 'string' ? children : undefined);
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-label={inferredLabel}
      aria-busy={loading || undefined}
      className={clsx(
        'inline-flex items-center justify-center rounded-lg border font-medium transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] focus-visible:ring-offset-0',
        'disabled:cursor-not-allowed disabled:opacity-50',
        VARIANT[variant],
        SIZE[size],
        className,
      )}
      {...rest}
    >
      {loading ? <Spinner size={14} /> : null}
      {children}
    </button>
  );
};
