// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import { createContext, useContext, useEffect } from 'react';

import type { DragEndEvent, DragOverEvent, DragStartEvent } from '@dnd-kit/core';

import type { EntityKind } from '../model/types';

/**
 * What can be dragged on the page (`useDraggable({ data })` / `useSortable({ data })`)
 * and where it can land (`useDroppable({ data })`). Every handler registered for
 * a drag item's type gets every event of that drag: the header reorder and
 * drop-to-group both listen to 'column-header' and tell the drops apart by
 * `over?.data.current?.kind`. End and cancel always reach every handler, so no
 * drop zone stays highlighted after a drag.
 */
export type ExplorerDragItem =
  /** `label` is the column's label, for hints such as "Drop to group by Toolchain". */
  | { type: 'column-header'; field: string; entity: EntityKind; label?: string }
  | { type: 'group-level'; index: number };

export type ExplorerDropTarget = { kind: 'column-slot'; field: string } | { kind: 'group-drop' };

/** The droppable id of the Group section and of the rail's group icon. */
export const GROUP_DROP_ID = 'vx-group-drop';
export const GROUP_RAIL_DROP_ID = 'vx-group-drop-rail';

export interface DndHandler {
  onDragStart?: (event: DragStartEvent) => void;
  onDragOver?: (event: DragOverEvent) => void;
  onDragEnd?: (event: DragEndEvent) => void;
  onDragCancel?: () => void;
}

export type DragType = ExplorerDragItem['type'];

export type Registry = Map<string, Set<DndHandler>>;

export const DndRegistryContext = createContext<Registry | null>(null);

/** Handle drags of one item type while the caller is mounted. Pass a stable (memoised) handler. */
export function useDndHandler(type: DragType, handler: DndHandler): void {
  const registry = useContext(DndRegistryContext);
  // Registration must follow mounts and unmounts of the owner; there is no
  // render-time place for it.
  useEffect(() => {
    if (!registry) return;
    const set = registry.get(type) ?? new Set<DndHandler>();
    set.add(handler);
    registry.set(type, set);
    return () => {
      set.delete(handler);
    };
  }, [registry, type, handler]);
}

/** The drag item of an event, typed; null for a draggable without one. */
export function dragItemOf(event: { active: { data: { current?: unknown } } }): ExplorerDragItem | null {
  const d = event.active.data.current as ExplorerDragItem | undefined;
  return d && (d.type === 'column-header' || d.type === 'group-level') ? d : null;
}

/** The drop target of an event, typed; null when over nothing the page knows. */
export function dropTargetOf(event: { over: { data: { current?: unknown } } | null }): ExplorerDropTarget | null {
  const d = event.over?.data.current as ExplorerDropTarget | undefined;
  return d && (d.kind === 'column-slot' || d.kind === 'group-drop') ? d : null;
}
