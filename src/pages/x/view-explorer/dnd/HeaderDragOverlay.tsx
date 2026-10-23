// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import {
  DragOverlay,
  type DropAnimation,
  type Modifier,
  defaultDropAnimationSideEffects,
  useDndContext,
} from '@dnd-kit/core';
import { getEventCoordinates } from '@dnd-kit/utilities';
import DragIndicatorIcon from '@mui/icons-material/DragIndicator';
import LayersOutlinedIcon from '@mui/icons-material/LayersOutlined';
import Box from '@mui/material/Box';

import { fieldById } from '../model/fields';
import { groupByAfterDrop } from '../popovers/cellActions';
import { useActiveTab } from '../state/useExplorer';
import { GROUP_DROP_ID, GROUP_RAIL_DROP_ID, dragItemOf } from './registry';

/**
 * The ghost of a column header while it is dragged: a chip with the column's
 * name that follows the pointer, so the drag can leave the header row and
 * reach the Group section. Over Group it says what the drop will do. The
 * header itself stays in the row and shows where a reorder would put it.
 */

/** A reorder settles the ghost back into the row; a drop on Group just fades it. */
const SETTLE: DropAnimation = {
  duration: 180,
  easing: 'cubic-bezier(0.2, 0, 0, 1)',
  sideEffects: defaultDropAnimationSideEffects({ styles: { active: { opacity: '0.5' } } }),
};

/** The ghost's left edge, right of the pointer. */
const POINTER_GAP_X = 12;
/** The ghost's middle line, a little below the pointer, so it never hides what the pointer is on. */
const POINTER_DROP_Y = 18;
/** Space kept between the Group section and a ghost under it. */
const ZONE_GAP = 6;

/**
 * Hold the ghost right of and a little below the pointer, wherever the header
 * was grabbed. (Kept at the header's own offset, a header grabbed in its
 * middle put the chip far left of the pointer, off the page over the rail.)
 * Over the Group section the ghost drops below it, so it never covers the
 * section's "Drop to group by …" text.
 */
const besidePointer: Modifier = ({ activatorEvent, draggingNodeRect, transform, over }) => {
  const start = activatorEvent ? getEventCoordinates(activatorEvent) : null;
  if (!start || !draggingNodeRect) return transform;
  const x = transform.x + start.x - draggingNodeRect.left + POINTER_GAP_X;
  let y = transform.y + start.y - draggingNodeRect.top - draggingNodeRect.height / 2 + POINTER_DROP_Y;
  if (over?.id === GROUP_DROP_ID) y = Math.max(y, over.rect.bottom + ZONE_GAP - draggingNodeRect.top);
  return { ...transform, x, y };
};

type Mode = 'move' | 'group' | 'none';

function Ghost({ mode, text }: { mode: Mode; text: string }) {
  const Icon = mode === 'move' ? DragIndicatorIcon : LayersOutlinedIcon;
  return (
    // The overlay is the size of the header it came from; the chip sits on its middle line, at its left edge.
    <Box aria-hidden sx={{ height: '100%', display: 'flex', alignItems: 'center' }}>
      <Box
        data-testid='vx-drag-ghost'
        data-mode={mode}
        sx={(t) => ({
          display: 'inline-flex',
          alignItems: 'center',
          gap: 0.75,
          height: 30,
          px: 1.25,
          pl: 0.75,
          maxWidth: 280,
          whiteSpace: 'nowrap',
          cursor: 'grabbing',
          fontSize: 12.5,
          fontWeight: 700,
          borderRadius: 1,
          border: 1,
          bgcolor: 'background.paper',
          borderColor: mode === 'group' ? 'primary.main' : 'divider',
          color: mode === 'none' ? 'text.secondary' : 'text.primary',
          boxShadow: mode === 'group' ? '0 0 0 3px var(--rust-ring), var(--sh-md)' : 'var(--sh-md)',
          transition: t.transitions.create(['border-color', 'box-shadow', 'color'], {
            duration: 120,
          }),
          '@media (prefers-reduced-motion: reduce)': { transition: 'none' },
        })}
      >
        <Icon
          sx={{
            fontSize: 16,
            color: mode === 'group' ? 'primary.main' : 'text.disabled',
            flexShrink: 0,
          }}
        />
        <Box component='span' sx={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {text}
        </Box>
      </Box>
    </Box>
  );
}

export function HeaderDragOverlay() {
  const { active, over } = useDndContext();
  const tab = useActiveTab();
  const item = active ? dragItemOf({ active }) : null;
  const header = item?.type === 'column-header' ? item : null;
  const overGroup = over?.id === GROUP_DROP_ID || over?.id === GROUP_RAIL_DROP_ID;

  let mode: Mode = 'move';
  let text = '';
  if (header) {
    const label =
      header.label ?? fieldById(header.entity, header.field)?.label ?? header.field;
    text = label;
    if (overGroup) {
      if (groupByAfterDrop(header.entity, tab.work.groupBy, header.field)) {
        mode = 'group';
        text = `Group by ${label}`;
      } else {
        mode = 'none';
        text = tab.work.groupBy.includes(header.field)
          ? `Already grouped by ${label}`
          : `${label} cannot be grouped`;
      }
    }
  }

  return (
    <DragOverlay dropAnimation={overGroup ? null : SETTLE} zIndex={1500} modifiers={[besidePointer]}>
      {header ? <Ghost mode={mode} text={text} /> : null}
    </DragOverlay>
  );
}
