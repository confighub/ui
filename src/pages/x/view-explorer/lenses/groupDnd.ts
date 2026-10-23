// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { useDndContext } from '@dnd-kit/core';

import { type ExplorerDropTarget, dragItemOf } from '../dnd/registry';
import { fieldById } from '../model/fields';

/** The Group section's drop target data, and which drag lights it up. */

export { GROUP_DROP_ID, GROUP_RAIL_DROP_ID } from '../dnd/registry';

/** The `data` of the Group drop zone and of the rail's group icon. */
export const GROUP_DROP_DATA: ExplorerDropTarget = { kind: 'group-drop' };

export const levelId = (field: string) => `group-level:${field}`;

/** Whether a column header that can group is being dragged now, and the name of its field. */
export function useHeaderDrag(): { active: boolean; label: string | null } {
  const { active } = useDndContext();
  const item = active ? dragItemOf({ active }) : null;
  if (item?.type !== 'column-header') return { active: false, label: null };
  // A column with no field in the catalog (a data path) cannot be grouped by, so it does not light the zone.
  const field = fieldById(item.entity, item.field);
  if (!field) return { active: false, label: null };
  return { active: true, label: field.label };
}
