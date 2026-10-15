// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import type { ReactNode } from 'react';

/** How a details drawer shows values: as text to copy, which ids and digests are. */
export const detailsMono = { fontFamily: 'monospace', fontSize: '0.85rem', wordBreak: 'break-all' } as const;

/** The entries of a Labels, Annotations or gates map, as `DetailsFields` takes them. */
export function mapFields(map: Record<string, string | boolean> | undefined): Array<[string, ReactNode]> {
  return Object.entries(map ?? {}).map(([key, value]) => [key, String(value)]);
}
