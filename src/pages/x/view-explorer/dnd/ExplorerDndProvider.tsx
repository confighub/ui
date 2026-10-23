// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import { type ReactNode, useMemo, useRef } from 'react';

import {
  DndContext,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';

import { HeaderDragOverlay } from './HeaderDragOverlay';
import { type DndHandler, DndRegistryContext, dragItemOf, type Registry } from './registry';

/**
 * One DndContext for the whole page: a header dragged from the table must be
 * able to land on the Group section in the column, so both have to be inside
 * the same context. Each feature registers handlers for the drag item types it
 * cares about (`useDndHandler`), and every event goes to every handler of the
 * active item's type.
 */
export function ExplorerDndProvider({ children }: { children: ReactNode }) {
  const registry = useRef<Registry>(new Map()).current;
  // The type of the drag in progress, for onDragCancel, whose event the handlers do not need.
  const activeType = useRef<string>('');
  // A small distance keeps a click on a header (its menu) from starting a drag.
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(KeyboardSensor));

  const handlers = useMemo(() => {
    const each = (type: string, call: (h: DndHandler) => void) => {
      for (const h of registry.get(type) ?? []) call(h);
    };
    return {
      onDragStart: (e: DragStartEvent) => {
        activeType.current = dragItemOf(e)?.type ?? '';
        each(activeType.current, (h) => h.onDragStart?.(e));
      },
      onDragOver: (e: DragOverEvent) => each(activeType.current, (h) => h.onDragOver?.(e)),
      onDragEnd: (e: DragEndEvent) => {
        each(activeType.current, (h) => h.onDragEnd?.(e));
        activeType.current = '';
      },
      onDragCancel: () => {
        each(activeType.current, (h) => h.onDragCancel?.());
        activeType.current = '';
      },
    };
  }, [registry]);

  return (
    <DndRegistryContext.Provider value={registry}>
      <DndContext sensors={sensors} {...handlers}>
        {children}
        <HeaderDragOverlay />
      </DndContext>
    </DndRegistryContext.Provider>
  );
}
