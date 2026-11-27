// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
// The small line glyphs of the shapes (12px, fgMuted): key (a Secret), optional, check, cross, ConfigMap,
// disk, dashed box, exec and http.
const SVG = { viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor' } as const;

export type GlyphName =
  | 'key'
  | 'optional'
  | 'check'
  | 'cross'
  | 'configMap'
  | 'disk'
  | 'dashed'
  | 'exec'
  | 'http';

/** The line glyphs of the design (12px, fgMuted by default). Decorative unless a label is given. */
export function Glyph({ name, label }: { name: GlyphName; label?: string }) {
  const a11y = label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true };
  return (
    <span className='ic' {...a11y}>
      {/* A key, not a lock: the lock means Kept on merge everywhere in the drawer. */}
      {name === 'key' && (
        <svg {...SVG} strokeWidth={1.5} strokeLinecap='round' strokeLinejoin='round'>
          <circle cx='5' cy='8' r='2.75' />
          <path d='M7.75 8h6M11.5 8v2.25M13.75 8v1.75' />
        </svg>
      )}
      {name === 'optional' && (
        <svg {...SVG} strokeWidth={1.5} strokeDasharray='2.2 1.8'>
          <circle cx='8' cy='8' r='5.5' />
        </svg>
      )}
      {name === 'check' && (
        <svg {...SVG} strokeWidth={1.8} strokeLinecap='round' strokeLinejoin='round'>
          <path d='M3.5 8.5l3 3 6-7' />
        </svg>
      )}
      {name === 'cross' && (
        <svg {...SVG} strokeWidth={1.8} strokeLinecap='round'>
          <path d='M4.5 4.5l7 7M11.5 4.5l-7 7' />
        </svg>
      )}
      {name === 'configMap' && (
        <svg {...SVG} strokeWidth={1.5} strokeLinejoin='round'>
          <path d='M4 2.5h5.5L12 5v8.5H4z' />
          <path d='M9.5 2.5V5H12' />
        </svg>
      )}
      {name === 'disk' && (
        <svg {...SVG} strokeWidth={1.5}>
          <ellipse cx='8' cy='4' rx='5' ry='2' />
          <path d='M3 4v8c0 1.1 2.2 2 5 2s5-.9 5-2V4' />
        </svg>
      )}
      {name === 'dashed' && (
        <svg {...SVG} strokeWidth={1.5} strokeDasharray='2 1.6'>
          <rect x='3' y='3' width='10' height='10' rx='2' />
        </svg>
      )}
      {name === 'exec' && (
        <svg {...SVG} strokeWidth={1.6} strokeLinecap='round' strokeLinejoin='round'>
          <path d='M3.5 5l3 3-3 3M8 11.5h4.5' />
        </svg>
      )}
      {name === 'http' && (
        <svg {...SVG} strokeWidth={1.5}>
          <circle cx='8' cy='8' r='5.5' />
          <path d='M2.5 8h11M8 2.5c1.8 1.6 1.8 9.4 0 11M8 2.5c-1.8 1.6-1.8 9.4 0 11' />
        </svg>
      )}
    </span>
  );
}
