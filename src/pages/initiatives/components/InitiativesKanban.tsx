// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { Initiative, InitiativeStatus } from '@/types/initiative';
import { DndContext, DragOverlay, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import type { DragEndEvent, DragStartEvent } from '@dnd-kit/core';
import Box from '@mui/material/Box';

import { getInitiativeStatus } from '../utils/deriveInitiativeStatus';
import { InitiativeKanbanCard } from './InitiativeKanbanCard';
import { KanbanColumn } from './KanbanColumn';

const STATUS_ORDER: InitiativeStatus[] = ['draft', 'in_progress', 'completed'];

// Below this container width, auto-collapse the Completed column.
const COMPLETED_AUTO_COLLAPSE_WIDTH = 820;

/** Draft & In Progress: soonest deadline first, no-deadline items last. */
function sortByDeadline(initiatives: Initiative[]): Initiative[] {
  return [...initiatives].sort((a, b) => {
    const da = a.deadline ?? '';
    const db = b.deadline ?? '';
    if (da && !db) return -1;
    if (!da && db) return 1;
    if (da !== db) return da.localeCompare(db);
    return a.name.localeCompare(b.name);
  });
}

/** Completed: most recently completed first. */
function sortByCompletedAt(initiatives: Initiative[]): Initiative[] {
  return [...initiatives].sort((a, b) => {
    const ca = a.completedAt ?? '';
    const cb = b.completedAt ?? '';
    if (ca !== cb) return cb.localeCompare(ca);
    return a.name.localeCompare(b.name);
  });
}

interface InitiativesKanbanProps {
  initiatives: Initiative[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onEdit: (id: string) => void;
  onDelete: (initiative: Initiative) => void;
  onStatusChange: (id: string, status: InitiativeStatus) => void;
}

export const InitiativesKanban = ({ initiatives, selectedId, onSelect, onEdit, onDelete, onStatusChange }: InitiativesKanbanProps) => {
  const [activeId, setActiveId] = useState<string | null>(null);

  const [collapsed, setCollapsed] = useState<Record<InitiativeStatus, boolean>>({
    draft: false,
    in_progress: false,
    completed: true,
  });

  // Auto-collapse Completed when the board crosses into narrow territory; auto-expand when
  // crossing back to wide. Only fires on threshold crossings, so manual toggles are preserved.
  const containerRef = useRef<HTMLDivElement | null>(null);
  const wasNarrowRef = useRef<boolean | null>(null);
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width ?? 0;
      const isNarrow = width < COMPLETED_AUTO_COLLAPSE_WIDTH;
      if (wasNarrowRef.current === isNarrow) return;
      wasNarrowRef.current = isNarrow;
      setCollapsed((prev) => (prev.completed === isNarrow ? prev : { ...prev, completed: isNarrow }));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const handleToggleCollapse = useCallback((status: InitiativeStatus) => {
    setCollapsed((prev) => ({ ...prev, [status]: !prev[status] }));
  }, []);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  );

  const grouped = useMemo(() => {
    const groups: Record<InitiativeStatus, Initiative[]> = {
      draft: [],
      in_progress: [],
      completed: [],
    };
    for (const c of initiatives) {
      const status = getInitiativeStatus(c);
      groups[status].push(c);
    }
    groups.draft = sortByDeadline(groups.draft);
    groups.in_progress = sortByDeadline(groups.in_progress);
    groups.completed = sortByCompletedAt(groups.completed);
    return groups;
  }, [initiatives]);

  const activeInitiative = useMemo(
    () => (activeId ? initiatives.find((c) => c.id === activeId) : undefined),
    [activeId, initiatives],
  );

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(String(event.active.id));
  }, []);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      setActiveId(null);
      const { active, over } = event;
      if (!over) return;

      const initiativeId = String(active.id);
      const targetStatus = String(over.id) as InitiativeStatus;
      const initiative = initiatives.find((c) => c.id === initiativeId);
      if (!initiative) return;

      const currentStatus = getInitiativeStatus(initiative);
      if (currentStatus !== targetStatus) {
        onStatusChange(initiativeId, targetStatus);
      }
    },
    [initiatives, onStatusChange],
  );

  const handleDragCancel = useCallback(() => {
    setActiveId(null);
  }, []);

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <Box
        ref={containerRef}
        sx={{
          display: 'flex',
          maxWidth: 1200,
          mx: 'auto',
          border: '1px solid',
          borderColor: 'divider',
          borderRadius: '8px',
          bgcolor: 'background.paper',
          overflow: 'hidden',
        }}
      >
        {STATUS_ORDER.map((status) => (
          <KanbanColumn
            key={status}
            status={status}
            initiatives={grouped[status]}
            selectedId={selectedId}
            isCollapsed={collapsed[status]}
            onToggleCollapse={() => handleToggleCollapse(status)}
            onSelect={onSelect}
            onEdit={onEdit}
            onDelete={onDelete}
            onStatusChange={onStatusChange}
          />
        ))}
      </Box>
      <DragOverlay dropAnimation={null} zIndex={1300}>
        {activeInitiative ? (
          <Box sx={{ width: 320, opacity: 0.9, pointerEvents: 'none' }}>
            <InitiativeKanbanCard
              initiative={activeInitiative}
              isSelected={false}
              onSelect={() => {}}
              onEdit={() => {}}
              onDelete={() => {}}
              onStatusChange={() => {}}
            />
          </Box>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
};
