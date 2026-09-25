// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import type { Initiative, InitiativeStatus } from '@/types/initiative';
import { useDraggable } from '@dnd-kit/core';
import Box from '@mui/material/Box';

import { InitiativeKanbanCard } from './InitiativeKanbanCard';

interface DraggableCardProps {
  initiative: Initiative;
  isSelected: boolean;
  onSelect: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onStatusChange: (status: InitiativeStatus) => void;
}

export const DraggableCard = ({ initiative, isSelected, onSelect, onEdit, onDelete, onStatusChange }: DraggableCardProps) => {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: initiative.id,
  });

  return (
    <Box
      ref={setNodeRef}
      {...listeners}
      {...attributes}
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
        onSelect={onSelect}
        onEdit={onEdit}
        onDelete={onDelete}
        onStatusChange={onStatusChange}
      />
    </Box>
  );
};
