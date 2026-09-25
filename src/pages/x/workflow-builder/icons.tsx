// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * The design's own icons: inline, stroked, no icon font and no emoji.
 *
 * Not MUI icons. These are drawn at 12-14px on a 16-unit grid with a 1.6-1.8
 * stroke, and the Material set's own optical weight at that size is visibly
 * heavier -- a substitution that reads as a different drawing, not a different
 * library.
 */

interface IconProps {
  size?: number;
}

const base = {
  viewBox: '0 0 16 16',
  fill: 'none',
  stroke: 'currentColor',
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
};

export function CheckIcon({ size = 13 }: IconProps) {
  return (
    <svg {...base} width={size} height={size} strokeWidth={1.8}>
      <path d='M3 8.5 6.3 12 13 4.6' />
    </svg>
  );
}

export function WarnIcon({ size = 13 }: IconProps) {
  return (
    <svg {...base} width={size} height={size} strokeWidth={1.6}>
      <path d='M8 2.6 14.6 13.4H1.4z' />
      <path d='M8 6.4v3' />
      <path d='M8 11.5h.01' />
    </svg>
  );
}

export function FlagIcon({ size = 13 }: IconProps) {
  return (
    <svg {...base} width={size} height={size} strokeWidth={1.6}>
      <path d='M4 14V2.6' />
      <path d='M4 3.2h8l-2 2.6 2 2.6H4' />
    </svg>
  );
}

/** A closed padlock: this hop carries gates. */
export function GateIcon({ size = 12 }: IconProps) {
  return (
    <svg {...base} width={size} height={size} strokeWidth={1.6}>
      <rect x='3' y='7' width='10' height='6.4' rx='1.4' />
      <path d='M5.6 7V5.2a2.4 2.4 0 0 1 4.8 0V7' />
    </svg>
  );
}

/** An open padlock: this hop carries none. */
export function OpenIcon({ size = 12 }: IconProps) {
  return (
    <svg {...base} width={size} height={size} strokeWidth={1.6}>
      <rect x='3' y='7' width='10' height='6.4' rx='1.4' />
      <path d='M5.6 7V5.2a2.4 2.4 0 0 1 4.6-.8' />
    </svg>
  );
}

export function ChevIcon({ size = 13 }: IconProps) {
  return (
    <svg {...base} width={size} height={size} strokeWidth={1.7}>
      <path d='M4 6.2 8 10.2l4-4' />
    </svg>
  );
}

export function ChevUpIcon({ size = 13 }: IconProps) {
  return (
    <svg {...base} width={size} height={size} strokeWidth={1.7}>
      <path d='M4 9.8 8 5.8l4 4' />
    </svg>
  );
}

export function RefreshIcon({ size = 14 }: IconProps) {
  return (
    <svg {...base} width={size} height={size} strokeWidth={1.6}>
      <path d='M13.4 8a5.4 5.4 0 1 1-1.6-3.8' />
      <path d='M13.6 2.4v3.2h-3.2' />
    </svg>
  );
}
