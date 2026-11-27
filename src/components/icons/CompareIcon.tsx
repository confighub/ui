// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/** Two arrows, one each way: the Compare icon, a line icon that takes the colour of its text. */
export function CompareIcon({ size = 15, className }: { size?: number; className?: string }) {
  return (
    <svg
      viewBox='0 0 16 16'
      width={size}
      height={size}
      fill='none'
      stroke='currentColor'
      strokeWidth={1.6}
      strokeLinecap='round'
      strokeLinejoin='round'
      className={className}
      aria-hidden
    >
      <path d='M2.5 5.2h10M10 2.7l2.5 2.5L10 7.7' />
      <path d='M13.5 10.8h-10M6 8.3l-2.5 2.5L6 13.3' />
    </svg>
  );
}
