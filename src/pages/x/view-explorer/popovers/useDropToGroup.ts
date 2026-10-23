// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { type Dispatch, useMemo } from 'react';

import {
  type DndHandler,
  GROUP_DROP_ID,
  GROUP_RAIL_DROP_ID,
  dragItemOf,
  useDndHandler,
} from '../dnd/registry';
import type { ExplorerAction } from '../model/reducer';
import { groupByAfterDrop } from './cellActions';

/**
 * A column header dropped on the Group section (or on the rail's group icon)
 * adds its field as the last group level. Drops anywhere else belong to other
 * handlers (the table's reorder), so this one ignores them. A field that is
 * already a level stays where it is, and a column the model cannot group by
 * (a data path) adds nothing, so the view does not become a draft for nothing.
 */
export function useDropToGroup(
  groupBy: readonly string[],
  dispatch: Dispatch<ExplorerAction>,
): void {
  const handler = useMemo<DndHandler>(
    () => ({
      onDragEnd: (e) => {
        const item = dragItemOf(e);
        const overId = e.over?.id;
        if (
          item?.type !== 'column-header' ||
          (overId !== GROUP_DROP_ID && overId !== GROUP_RAIL_DROP_ID)
        )
          return;
        const next = groupByAfterDrop(item.entity, groupBy, item.field);
        if (next) dispatch({ type: 'setGroupBy', groupBy: next });
      },
    }),
    [groupBy, dispatch],
  );
  useDndHandler('column-header', handler);
}
