// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

// The kind icons of the sheet's heads and part chips.

import type { ReactNode } from 'react';

import { componentTheme } from '../componentTheme';
import type { ShapeId } from './shapes/registry';
import type { PartKind } from './specSheetModel';

const svg = { viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, className: 'kind', 'aria-hidden': true } as const;

export function ResourceIcon({ kind }: { kind?: string }) {
  if (kind === 'Service') {
    return (
      <svg {...svg}>
        <circle cx='8' cy='8' r='2.2' />
        <path d='M8 2v3.8M8 10.2V14M2 8h3.8M10.2 8H14' />
      </svg>
    );
  }
  // Every other kind, a workload or not, takes the layered resource icon, as the mock draws it:
  // a dashed outline reads as "not there" (the init container's icon), not as another kind.
  return (
    <svg {...svg} strokeLinejoin='round'>
      <path d='M8 2 14 5 8 8 2 5z' />
      <path d='M2 8l6 3 6-3' />
      <path d='M2 11l6 3 6-3' />
    </svg>
  );
}

export function PartIcon({ kind }: { kind: PartKind }) {
  switch (kind) {
    case 'container':
      return (
        <svg {...svg} strokeLinejoin='round'>
          <path d='M8 1.8 13.5 5v6L8 14.2 2.5 11V5z' />
          <path d='M2.5 5 8 8.2 13.5 5M8 8.2v6' />
        </svg>
      );
    case 'init':
      return (
        <svg {...svg} strokeLinejoin='round' strokeDasharray='2 1.6'>
          <path d='M8 1.8 13.5 5v6L8 14.2 2.5 11V5z' />
        </svg>
      );
    case 'pod':
      return (
        <svg {...svg}>
          <circle cx='8' cy='8' r='5.5' />
          <circle cx='8' cy='8' r='2' />
        </svg>
      );
    case 'volumes':
      return (
        <svg {...svg}>
          <ellipse cx='8' cy='4' rx='5' ry='2' />
          <path d='M3 4v8c0 1.1 2.2 2 5 2s5-.9 5-2V4' />
          <path d='M3 8c0 1.1 2.2 2 5 2s5-.9 5-2' />
        </svg>
      );
    case 'metadata':
      return (
        <svg {...svg} strokeLinejoin='round'>
          <path d='M2.5 2.5h5.2l5.8 5.8-5.2 5.2-5.8-5.8z' />
          <circle cx='5.5' cy='5.5' r='1' />
        </svg>
      );
    default:
      return (
        <svg {...svg} strokeLinecap='round'>
          <path d='M3 4.5h10M3 8h10M3 11.5h10' />
          <circle cx='6' cy='4.5' r='1.3' fill={componentTheme.bgDefault} />
          <circle cx='10.5' cy='8' r='1.3' fill={componentTheme.bgDefault} />
          <circle cx='5' cy='11.5' r='1.3' fill={componentTheme.bgDefault} />
        </svg>
      );
  }
}


const BLOCK_ICON_PATHS: Partial<Record<ShapeId, ReactNode>> = {
  image: <><rect x='2.5' y='3.5' width='11' height='9' rx='1.5' /><path d='M2.5 7h11' /></>,
  command: <><path d='M3 5l3 3-3 3' /><path d='M8 11.5h5' /></>,
  ports: <><circle cx='8' cy='8' r='2' /><path d='M8 2.5V6M8 10v3.5M2.5 8H6M10 8h3.5' /></>,
  env: <><path d='M3 4h10M3 8h10M3 12h6' /></>,
  resources: <><rect x='4' y='4' width='8' height='8' rx='1' /><path d='M6 2v2M10 2v2M6 12v2M10 12v2M2 6h2M2 10h2M12 6h2M12 10h2' /></>,
  probes: <path d='M2 8h3l1.5-3.5 3 7L11 8h3' />,
  mounts: <><ellipse cx='8' cy='4.5' rx='5' ry='2' /><path d='M3 4.5v7c0 1.1 2.2 2 5 2s5-.9 5-2v-7' /></>,
  volumes: <><ellipse cx='8' cy='4.5' rx='5' ry='2' /><path d='M3 4.5v7c0 1.1 2.2 2 5 2s5-.9 5-2v-7' /></>,
  security: <path d='M8 2l5 2v4c0 3-2.2 5-5 6-2.8-1-5-3-5-6V4z' />,
};

/** The small icon before a heading block's label (12px, t3). */
export function BlockIcon({ shape }: { shape: ShapeId }) {
  const path = BLOCK_ICON_PATHS[shape];
  if (!path) return null;
  return (
    <svg className='bicon' viewBox='0 0 16 16' fill='none' stroke='currentColor' strokeWidth={1.5} strokeLinecap='round' strokeLinejoin='round' aria-hidden>
      {path}
    </svg>
  );
}
