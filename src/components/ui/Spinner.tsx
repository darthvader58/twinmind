import type { SVGProps } from 'react';

import { clsx } from 'clsx';

interface Props extends Omit<SVGProps<SVGSVGElement>, 'className'> {
  className?: string;
  size?: number;
}

export const Spinner = ({ className, size = 16, ...rest }: Props) => (
  <svg
    aria-hidden="true"
    role="img"
    viewBox="0 0 24 24"
    width={size}
    height={size}
    fill="none"
    className={clsx('animate-spin text-current', className)}
    {...rest}
  >
    <circle
      cx="12"
      cy="12"
      r="9"
      stroke="currentColor"
      strokeOpacity="0.25"
      strokeWidth="3"
    />
    <path
      d="M21 12a9 9 0 0 0-9-9"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
    />
  </svg>
);
