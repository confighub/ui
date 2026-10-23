// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import type { ExtendedSpaceRead, ExtendedUnitRead } from '@confighub/rtk-query';

import type { ResourceViewRow } from '../adapters/resource-row';
import type { EntityRow } from '../model/fields';
import type { EntityKind } from '../model/types';

/** Label keys present on the loaded rows, for the `+` column picker. */
export function labelKeysOf(entity: EntityKind, rows: readonly EntityRow[]): string[] {
  const keys = new Set<string>();
  for (const r of rows) {
    const labels =
      entity === 'Unit'
        ? (r as ExtendedUnitRead).Unit?.Labels
        : entity === 'Space'
          ? (r as ExtendedSpaceRead).Space?.Labels
          : (r as ResourceViewRow).UnitLabels;
    if (labels) for (const k of Object.keys(labels)) keys.add(k);
  }
  return [...keys].sort();
}
