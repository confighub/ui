// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import { resourceAdapter } from './resource';
import { spaceAdapter } from './space';
import { EntityAdapter, ViewEntityType } from './types';
import { unitAdapter } from './unit';

const ADAPTERS: Record<ViewEntityType, EntityAdapter> = {
  Unit: unitAdapter,
  Space: spaceAdapter,
  Resource: resourceAdapter,
};

/**
 * Resolve an EntityAdapter by entity type. Unknown / legacy values fall back
 * to the Unit adapter so pre-`Of`-aware views render correctly.
 */
export function getAdapter(entityType: string | undefined): EntityAdapter {
  if (entityType && entityType in ADAPTERS) {
    return ADAPTERS[entityType as ViewEntityType];
  }
  return unitAdapter;
}

export const ENTITY_TYPES: ViewEntityType[] = ['Unit', 'Space', 'Resource'];

export type { EntityAdapter, ViewEntityType };
