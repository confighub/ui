// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { type KeyboardEvent, useMemo, useState } from 'react';

import type { GroupableCategory } from '@/components/group-nav';
import { FieldPickerDropdown } from '@/components/group-nav/FieldPickerDropdown';
import { type DragEndEvent, useDroppable } from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import AddIcon from '@mui/icons-material/Add';
import CloseIcon from '@mui/icons-material/Close';
import DragIndicatorIcon from '@mui/icons-material/DragIndicator';
import LayersOutlinedIcon from '@mui/icons-material/LayersOutlined';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';

import { useDndHandler } from '../dnd/registry';
import { type EntityRow, fieldById, fieldCatalog } from '../model/fields';
import type { EntityKind } from '../model/types';
import { useExplorerContext } from '../state/context';
import { GROUP_DROP_DATA, GROUP_DROP_ID, levelId, useHeaderDrag } from './groupDnd';
import { Section } from './parts';

/**
 * The view's group levels, outermost first: each with how many groups it
 * makes in the shown rows, a handle to reorder, and × to stop grouping by it.
 * Under them, a drop zone for a column header dragged from the table; the
 * table's drag handler adds the level when the header lands on the zone. A
 * click on the zone (or Enter or Space) opens the same picker as "+ Add".
 * A drag that ends on the zone is not a click on it: the browser sends a click
 * only where the press began too, and nothing on the zone can be dragged.
 */

function categoriesFor(entity: EntityKind, labelKeys: readonly string[]): GroupableCategory[] {
  const all = fieldCatalog(entity, labelKeys);
  const fixed = all.filter((f) => f.category === 'field' || f.category === 'computed');
  const labels = all.filter((f) => f.category === 'label' || f.category === 'space-label');
  const out: GroupableCategory[] = [
    { header: 'Fields', fields: fixed.map((f) => ({ field: f.id, label: f.label })) },
  ];
  if (labels.length) {
    out.push({
      header: 'Labels',
      fields: labels.map((f) => ({ field: f.id, label: f.label })),
      isSubmenu: true,
      searchPlaceholder: 'Filter label keys…',
    });
  }
  return out;
}

interface LevelProps {
  entity: EntityKind;
  field: string;
  index: number;
  groups: number;
  onRemove: () => void;
}

function Level({ entity, field, index, groups, onRemove }: LevelProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable(
    {
      id: levelId(field),
      data: { type: 'group-level', index },
    },
  );
  const def = fieldById(entity, field);
  const isLabel = def?.category === 'label' || def?.category === 'space-label';
  return (
    <Stack
      ref={setNodeRef}
      direction='row'
      alignItems='center'
      spacing={0.75}
      data-testid='vx-group-level'
      data-field={field}
      sx={{
        height: 32,
        pl: 0.25,
        pr: 0.5,
        mb: 0.5,
        borderRadius: 1,
        border: 1,
        borderColor: 'divider',
        bgcolor: 'background.paper',
        fontSize: 13,
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
        '&:hover': { borderColor: 'text.disabled' },
      }}
    >
      <Box
        {...attributes}
        {...listeners}
        aria-label={`Move ${def?.label ?? field}`}
        sx={{
          display: 'grid',
          placeItems: 'center',
          width: 18,
          height: 24,
          cursor: 'grab',
          color: 'text.disabled',
        }}
      >
        <DragIndicatorIcon sx={{ fontSize: 15 }} />
      </Box>
      {index > 0 && (
        <Typography sx={{ fontSize: 12, color: 'text.disabled' }}>then</Typography>
      )}
      {isLabel && (
        <Typography sx={{ fontSize: 10.5, fontWeight: 700, color: 'text.disabled' }}>
          label
        </Typography>
      )}
      <Typography noWrap sx={{ fontSize: 13, fontWeight: 700, minWidth: 0 }}>
        {def?.label ?? field}
      </Typography>
      <Typography
        sx={{
          ml: 'auto !important',
          fontSize: 11.5,
          color: 'text.disabled',
          whiteSpace: 'nowrap',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {groups} group{groups === 1 ? '' : 's'}
      </Typography>
      <IconButton
        size='small'
        aria-label={`Stop grouping by ${def?.label ?? field}`}
        onClick={onRemove}
        sx={{ width: 20, height: 20 }}
      >
        <CloseIcon sx={{ fontSize: 12 }} />
      </IconButton>
    </Stack>
  );
}

interface GroupSectionProps {
  entity: EntityKind;
  groupBy: readonly string[];
  rows: readonly EntityRow[];
  labelKeys: readonly string[];
}

export function GroupSection({ entity, groupBy, rows, labelKeys }: GroupSectionProps) {
  const { dispatch } = useExplorerContext();
  const [pickerAnchor, setPickerAnchor] = useState<HTMLElement | null>(null);
  const { setNodeRef, isOver } = useDroppable({
    id: GROUP_DROP_ID,
    data: GROUP_DROP_DATA,
  });
  const headerDrag = useHeaderDrag();

  const counts = useMemo(
    () =>
      groupBy.map((f) => {
        const def = fieldById(entity, f);
        if (!def) return 0;
        return new Set(rows.map((r) => def.value(r) ?? '')).size;
      }),
    [entity, groupBy, rows],
  );

  const onDragEnd = useMemo(
    () => ({
      onDragEnd: (e: DragEndEvent) => {
        const from = e.active.data.current?.index;
        const to = e.over?.data.current?.index;
        if (typeof from === 'number' && typeof to === 'number' && from !== to)
          dispatch({ type: 'moveGroupLevel', from, to });
      },
    }),
    [dispatch],
  );
  useDndHandler('group-level', onDragEnd);

  const categories = useMemo(() => categoriesFor(entity, labelKeys), [entity, labelKeys]);
  const lit = headerDrag.active;
  const dropText = lit
    ? `Drop to group by ${headerDrag.label ?? 'this column'}`
    : groupBy.length
      ? 'Drop a column header to add a level'
      : 'Drop a column header to group';
  const onZoneKey = (e: KeyboardEvent<HTMLElement>) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    // Space would scroll the column.
    e.preventDefault();
    setPickerAnchor(e.currentTarget);
  };

  return (
    <Section
      label='Group'
      testId='vx-group-section'
      right={
        <Button
          size='small'
          color='inherit'
          startIcon={<AddIcon sx={{ fontSize: '14px !important' }} />}
          onClick={(e) => setPickerAnchor(e.currentTarget)}
          sx={{
            color: 'text.disabled',
            fontSize: 12,
            fontWeight: 700,
            minWidth: 0,
            py: 0,
            px: 0.75,
            '& .MuiButton-startIcon': { mr: 0.375 },
          }}
          data-testid='vx-group-add'
        >
          Add
        </Button>
      }
    >
      <SortableContext items={groupBy.map(levelId)} strategy={verticalListSortingStrategy}>
        {groupBy.map((f, i) => (
          <Level
            key={f}
            entity={entity}
            field={f}
            index={i}
            groups={counts[i] ?? 0}
            onRemove={() =>
              dispatch({ type: 'setGroupBy', groupBy: groupBy.filter((g) => g !== f) })
            }
          />
        ))}
      </SortableContext>
      <Stack
        ref={setNodeRef}
        direction='row'
        alignItems='center'
        spacing={0.75}
        data-testid='vx-group-drop'
        data-lit={lit}
        role='button'
        tabIndex={0}
        aria-label={groupBy.length ? 'Add a group level' : 'Group by a field'}
        onClick={(e) => setPickerAnchor(e.currentTarget)}
        onKeyDown={onZoneKey}
        sx={{
          height: 32,
          px: 1.125,
          borderRadius: 1,
          border: 1,
          borderStyle: lit ? 'solid' : 'dashed',
          borderColor: lit ? 'primary.main' : 'divider',
          bgcolor: lit ? 'primary.light' : 'transparent',
          color: lit ? 'primary.main' : 'text.disabled',
          boxShadow: isOver ? '0 0 0 3px var(--rust-ring)' : 'none',
          fontSize: 12,
          cursor: 'pointer',
          transition: 'background-color .15s, border-color .15s, color .15s',
          '&:focus-visible': { outline: 2, outlineColor: 'primary.main', outlineOffset: 1 },
        }}
      >
        <LayersOutlinedIcon sx={{ fontSize: 14 }} />
        <Typography
          noWrap
          sx={{ fontSize: 12, fontWeight: lit ? 700 : 400, color: 'inherit' }}
        >
          {dropText}
        </Typography>
      </Stack>
      {pickerAnchor && (
        <FieldPickerDropdown
          anchorEl={pickerAnchor}
          open={!!pickerAnchor}
          onClose={() => setPickerAnchor(null)}
          categories={categories}
          usedFields={[...groupBy]}
          onSelect={(field) => {
            setPickerAnchor(null);
            dispatch({ type: 'setGroupBy', groupBy: [...groupBy, field] });
          }}
        />
      )}
    </Section>
  );
}
