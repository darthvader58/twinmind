import type { ReactNode } from 'react';

import { clsx } from 'clsx';

interface Props {
  children?: ReactNode;
  className?: string;
  headerLabel?: string;
  headerRight?: ReactNode;
  /** When provided, fully overrides the default header row layout. */
  header?: ReactNode;
}

export const Card = ({
  children,
  className,
  headerLabel,
  headerRight,
  header,
}: Props) => (
  <div
    className={clsx(
      'flex min-h-0 flex-col rounded-[1.25rem] border border-[var(--panel-border)] bg-[var(--panel)]',
      'p-5 ring-1 ring-inset ring-[var(--panel-inner)]',
      className,
    )}
  >
    {header ? (
      <div className="mb-3">{header}</div>
    ) : headerLabel || headerRight ? (
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">
          {headerLabel}
        </h2>
        {headerRight ? <div className="flex items-center gap-2">{headerRight}</div> : null}
      </div>
    ) : null}
    {children}
  </div>
);
