// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import { useCallback, useRef, useState } from 'react';

import type { Initiative, InitiativeStatus } from '@/types/initiative';
import { useDroppable } from '@dnd-kit/core';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import IconButton from '@mui/material/IconButton';
import Stack from '@mui/material/Stack';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';

import { DraggableCard } from './DraggableCard';

// Small fudge factor so sub-pixel rounding doesn't leave the fade visible when
// the user has effectively scrolled to the bottom.
const SCROLL_BOTTOM_EPSILON = 1;

const COLUMN_CONFIG: Record<InitiativeStatus, { label: string; dotColor: string; bg: string }> = {
  draft: { label: 'Draft', dotColor: '#9E9E9E', bg: '#fafafa' },
  in_progress: { label: 'In Progress', dotColor: '#ba3d03', bg: '#fff' },
  completed: { label: 'Completed', dotColor: '#4caf50', bg: '#fafafa' },
};

const COLLAPSED_WIDTH = 44;
const COLUMN_MAX_HEIGHT = 'calc(100vh - 240px)';
const FADE_HEIGHT = 28;

interface KanbanColumnProps {
  status: InitiativeStatus;
  initiatives: Initiative[];
  selectedId: string | null;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  onSelect: (id: string) => void;
  onEdit: (id: string) => void;
  onDelete: (initiative: Initiative) => void;
  onStatusChange: (id: string, status: InitiativeStatus) => void;
}

export const KanbanColumn = ({
  status,
  initiatives,
  selectedId,
  isCollapsed,
  onToggleCollapse,
  onSelect,
  onEdit,
  onDelete,
  onStatusChange,
}: KanbanColumnProps) => {
  const config = COLUMN_CONFIG[status];
  const { setNodeRef, isOver } = useDroppable({ id: status });

  // Only show the bottom fade when the cards container actually overflows AND
  // the user hasn't scrolled to the very bottom. Tracked via a callback ref so
  // we can attach/detach the scroll + resize listeners without a useEffect.
  const [showFade, setShowFade] = useState(false);
  const scrollElRef = useRef<HTMLDivElement | null>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);

  const updateFade = useCallback(() => {
    const el = scrollElRef.current;
    if (!el) {
      setShowFade(false);
      return;
    }
    const hasOverflow = el.scrollHeight > el.clientHeight;
    const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - SCROLL_BOTTOM_EPSILON;
    setShowFade(hasOverflow && !atBottom);
  }, []);

  const scrollCallbackRef = useCallback(
    (node: HTMLDivElement | null) => {
      // Tear down any previous observation / listeners.
      if (scrollElRef.current) {
        scrollElRef.current.removeEventListener('scroll', updateFade);
      }
      if (resizeObserverRef.current) {
        resizeObserverRef.current.disconnect();
        resizeObserverRef.current = null;
      }

      scrollElRef.current = node;

      if (!node) {
        setShowFade(false);
        return;
      }

      node.addEventListener('scroll', updateFade, { passive: true });
      const observer = new ResizeObserver(updateFade);
      observer.observe(node);
      // Observe children so that card additions/removals re-evaluate overflow.
      for (const child of Array.from(node.children)) {
        observer.observe(child);
      }
      resizeObserverRef.current = observer;
      updateFade();
    },
    [updateFade],
  );

  if (isCollapsed) {
    return (
      <Tooltip title={`Expand ${config.label}`} placement='top'>
        <Box
          ref={setNodeRef}
          onClick={onToggleCollapse}
          role='button'
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onToggleCollapse();
            }
          }}
          sx={{
            width: COLLAPSED_WIDTH,
            flexShrink: 0,
            py: 1.5,
            px: 0.5,
            borderRight: '1px solid',
            borderColor: 'divider',
            backgroundColor: isOver ? 'action.hover' : config.bg,
            '&:last-child': { borderRight: 'none' },
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 1,
            cursor: 'pointer',
            userSelect: 'none',
            transition: 'background-color 0.2s ease',
            '&:hover': { backgroundColor: 'action.hover' },
          }}
        >
          <Box
            sx={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              bgcolor: config.dotColor,
              flexShrink: 0,
            }}
          />
          <Chip
            label={initiatives.length}
            size='small'
            sx={{ height: 20, fontSize: '0.7rem', fontWeight: 500 }}
          />
          <Typography
            variant='subtitle2'
            fontWeight={600}
            color='text.primary'
            sx={{
              writingMode: 'vertical-rl',
              transform: 'rotate(180deg)',
              whiteSpace: 'nowrap',
            }}
          >
            {config.label}
          </Typography>
        </Box>
      </Tooltip>
    );
  }

  return (
    <Box
      ref={setNodeRef}
      sx={{
        flex: 1,
        minWidth: 0,
        p: 1.5,
        borderRight: '1px solid',
        borderColor: 'divider',
        backgroundColor: isOver ? 'action.hover' : config.bg,
        '&:last-child': { borderRight: 'none' },
        display: 'flex',
        flexDirection: 'column',
        minHeight: 200,
        maxHeight: COLUMN_MAX_HEIGHT,
        transition: 'background-color 0.2s ease',
      }}
    >
      {/* Column header */}
      <Stack
        direction='row'
        alignItems='center'
        spacing={1}
        sx={{ pb: 1.5, mb: 1.5, borderBottom: '1px solid', borderColor: 'divider', flexShrink: 0 }}
      >
        <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: config.dotColor, flexShrink: 0 }} />
        <Typography variant='subtitle2' fontWeight={600} color='text.primary'>
          {config.label}
        </Typography>
        <Chip
          label={initiatives.length}
          size='small'
          sx={{ height: 20, fontSize: '0.7rem', fontWeight: 500, ml: 'auto !important' }}
        />
        <Tooltip title='Collapse'>
          <IconButton
            size='small'
            onClick={onToggleCollapse}
            aria-label={`Collapse ${config.label}`}
            sx={{ p: 0.25 }}
          >
            {status === 'completed' ? (
              <ChevronLeftIcon fontSize='small' />
            ) : (
              <ChevronRightIcon fontSize='small' />
            )}
          </IconButton>
        </Tooltip>
      </Stack>

      {/* Cards - scrollable with hidden scrollbar and bottom fade */}
      <Stack
        ref={scrollCallbackRef}
        spacing={1}
        sx={{
          flex: 1,
          minHeight: 0,
          overflowY: 'auto',
          overflowX: 'hidden',
          scrollbarWidth: 'none',
          msOverflowStyle: 'none',
          '&::-webkit-scrollbar': { display: 'none' },
          // Padding gives hover lift + drop-shadow room so the first/last/side cards aren't clipped
          pt: 1,
          pb: 0.5,
          px: 0.5,
          mx: -0.5,
          // Only fade when content actually overflows and user hasn't scrolled to the bottom.
          ...(showFade
            ? {
                maskImage: `linear-gradient(to bottom, black calc(100% - ${FADE_HEIGHT}px), transparent)`,
                WebkitMaskImage: `linear-gradient(to bottom, black calc(100% - ${FADE_HEIGHT}px), transparent)`,
              }
            : {}),
        }}
      >
        {initiatives.length === 0 ? (
          <Typography
            variant='caption'
            color='text.disabled'
            sx={{ textAlign: 'center', py: 4 }}
          >
            No {config.label.toLowerCase()} initiatives
          </Typography>
        ) : (
          initiatives.map((c) => (
            <DraggableCard
              key={c.id}
              initiative={c}
              isSelected={c.id === selectedId}
              onSelect={() => onSelect(c.id)}
              onEdit={() => onEdit(c.id)}
              onDelete={() => onDelete(c)}
              onStatusChange={(newStatus) => onStatusChange(c.id, newStatus)}
            />
          ))
        )}
      </Stack>
    </Box>
  );
};
