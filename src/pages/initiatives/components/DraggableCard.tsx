// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import type { Initiative, InitiativeStatus } from '@/types/initiative';
import { useDraggable } from '@dnd-kit/core';
import Box from '@mui/material/Box';

import { InitiativeKanbanCard } from './InitiativeKanbanCard';

interface DraggableCardProps {
  initiative: Initiative;
  isSelected: boolean;
  onDelete: () => void;
  onStatusChange: (status: InitiativeStatus) => void;
}

export const DraggableCard = ({ initiative, isSelected, onDelete, onStatusChange }: DraggableCardProps) => {
  // dnd-kit's `attributes` are left off: they make the wrapper a focusable button (role, tabIndex,
  // aria-pressed) and describe keyboard dragging, but only the pointer sensor is registered. The
  // card's link and menu button are the controls a keyboard reaches.
  const { listeners, setNodeRef, isDragging } = useDraggable({
    id: initiative.id,
  });

  return (
    <Box
      ref={setNodeRef}
      {...listeners}
      sx={{
        opacity: isDragging ? 0.3 : 1,
        cursor: 'grab',
        position: 'relative',
        zIndex: isDragging ? 1 : 'auto',
        '&:active': { cursor: 'grabbing' },
      }}
    >
      <InitiativeKanbanCard
        initiative={initiative}
        isSelected={isSelected}
        onDelete={onDelete}
        onStatusChange={onStatusChange}
      />
    </Box>
  );
};
