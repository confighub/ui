// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import { Fragment, memo, type ReactElement, useCallback, useRef } from 'react';

import type { ExtendedUnitRead } from '@confighub/rtk-query';
import Box from '@mui/material/Box';
import Skeleton from '@mui/material/Skeleton';

import { componentTheme } from '@/pages/x/apps/componentTheme';
import { useCompareColumnDrag } from '@/pages/x/apps/compare/CompareColumnDnd';
import { LETTER_SX, letterFor } from '@/pages/x/apps/compare/slotLetter';
import { CloseGlyph, SwapGlyph } from '@/pages/x/apps/selectorGlyphs';
import { SWAP_SX } from '@/pages/x/apps/selectorSlotStyles';

import { MAX_COMPARE_SLOTS, removeSlot, swapFirstTwo } from '../model/compare';
import { slotMeta } from './columns';

/**
 * The slots A–E above the grid: one card per compared Unit, with its Space,
 * slug, Target and revision. ✕ clears a slot and the slots after it move
 * left; ⇄ swaps A and B; a card dragged onto another swaps the two (the
 * drag layer is `CompareColumnDnd`, shared with the grid's column heads, so
 * the columns below move with it). After the last Unit an empty slot says
 * which Unit the picker would suggest.
 *
 * The cards are the shape of the Components slots (letter, label, meta line),
 * made wider because a Unit is named by its slug and its Space, and the meta
 * line needs room for "Space · Target · rev N", which a 36px square cannot hold.
 */

export interface SlotRequest {
  /** The slot to fill: an index, or `'add'` for the empty slot. */
  slot: number | 'add';
  anchor: HTMLElement;
}

export interface UnitSlotsProps {
  /** UnitIDs in slot order. */
  ids: readonly string[];
  /** The Units found for those ids. */
  rowsById: ReadonlyMap<string, ExtendedUnitRead>;
  /** The Units are still loading: a slot whose Unit is not found yet shows a placeholder. */
  loading: boolean;
  /** What the empty slot suggests: "prod-temporal", or "web · checkout-prod". */
  suggestion?: string;
  onChange: (ids: readonly string[]) => void;
  /** Choose the Unit for a slot: a click or Enter on a slot, or a click on the empty slot. */
  onRequestPicker: (request: SlotRequest) => void;
  /** The slot whose picker is open (an index, or `'add'`), drawn pressed. */
  openSlot?: number | 'add' | null;
}

/** Every slot drag shares this scope, so a slot only swaps with another slot. */
const SLOTS_DRAG_SCOPE = 'selectors';

const ROW_SX = {
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  gap: '8px',
  padding: '12px 16px',
  borderBottom: `1px solid ${componentTheme.borderDefault}`,
  background: componentTheme.bgSubtle,
  flex: 'none',
} as const;

const CARD_SX = {
  flex: '1 1 180px',
  maxWidth: 330,
  minWidth: 0,
  alignSelf: 'stretch',
  position: 'relative',
  display: 'flex',
} as const;

const FACE_SX = {
  flex: 1,
  minWidth: 0,
  display: 'grid',
  gridTemplateColumns: 'auto minmax(0, 1fr)',
  columnGap: '8px',
  rowGap: '2px',
  alignItems: 'center',
  padding: '8px 30px 8px 10px',
  background: componentTheme.bgDefault,
  border: `1px solid ${componentTheme.borderDefault}`,
  borderRadius: '8px',
  cursor: 'grab',
  font: 'inherit',
  textAlign: 'left',
  color: componentTheme.fgDefault,
  '&:hover': { borderColor: componentTheme.borderEdge },
  '&:focus-visible': { outline: `2px solid ${componentTheme.accent}`, outlineOffset: '1px' },
} as const;

/** A slot whose picker is open. */
const PRESSED_SX = {
  '&[aria-expanded="true"], &[aria-expanded="true"]:hover': {
    background: componentTheme.accentMuted,
    borderColor: componentTheme.accent,
    color: componentTheme.accentEmphasis,
  },
} as const;

const LABEL_SX = {
  fontSize: 13,
  fontWeight: 600,
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
} as const;

const META_SX = {
  gridColumn: 2,
  fontSize: 11.5,
  color: componentTheme.fgSubtle,
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
} as const;

const CLEAR_SX = {
  position: 'absolute',
  top: 6,
  right: 6,
  width: 22,
  height: 22,
  padding: 0,
  border: 'none',
  borderRadius: '4px',
  background: 'none',
  display: 'grid',
  placeItems: 'center',
  color: componentTheme.fgSubtle,
  cursor: 'pointer',
  '&:hover': { background: componentTheme.bgInset, color: componentTheme.fgDefault },
  '&:focus-visible': { outline: `2px solid ${componentTheme.accent}`, outlineOffset: '1px' },
} as const;

const EMPTY_SX = {
  ...FACE_SX,
  flex: '1 1 150px',
  maxWidth: 330,
  alignSelf: 'stretch',
  paddingRight: '10px',
  borderStyle: 'dashed',
  background: 'none',
  cursor: 'default',
  color: componentTheme.fgSubtle,
  '&:hover': {},
} as const;

// Neutral until its picker opens (PRESSED_SX), so it does not compete with the one-Unit state's primary button.
const EMPTY_PICKER_SX = {
  cursor: 'pointer',
  '&:hover': { borderColor: componentTheme.borderEdge },
} as const;

const spaceOf = (row: ExtendedUnitRead | undefined) => row?.Space?.Slug ?? '';
const slugOf = (row: ExtendedUnitRead | undefined) => row?.Unit?.Slug ?? '';

interface SlotCardProps {
  id: string;
  index: number;
  row: ExtendedUnitRead | undefined;
  loading: boolean;
  pressed: boolean;
  onClear: (index: number) => void;
  onRequestPicker: (request: SlotRequest) => void;
}

/**
 * A filled slot. The face is the drag handle, by pointer or keyboard (Space,
 * then the arrow keys); a click on it, or Enter, opens the picker to put
 * another Unit in the slot. ✕ is a sibling of the face, never inside it,
 * since a control cannot hold another control.
 */
const SlotCard = memo(function SlotCard({ id, index, row, loading, pressed, onClear, onRequestPicker }: SlotCardProps): ReactElement {
  const letter = letterFor(index);
  const { setNodeRef, listeners, attributes } = useCompareColumnDrag(id, SLOTS_DRAG_SCOPE);
  const meta = row ? slotMeta(row) : undefined;
  const said = row
    ? `Slot ${letter} holds ${slugOf(row)} in ${spaceOf(row)}. Choose a different Unit.`
    : loading
      ? `Slot ${letter} is loading.`
      : `Slot ${letter} holds a Unit that could not be loaded.`;
  return (
    <Box ref={setNodeRef} data-compare-col={id} data-compare-surface='selectors' sx={CARD_SX}>
      <Box
        {...attributes}
        {...listeners}
        data-testid={`unit-slot-${letter.toLowerCase()}`}
        data-unit-id={id}
        aria-label={said}
        title='Drag to reorder'
        aria-haspopup='dialog'
        aria-expanded={pressed}
        onClick={(e) => onRequestPicker({ slot: index, anchor: e.currentTarget })}
        // Enter chooses another Unit; Space stays the drag's, which would otherwise take both keys.
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            onRequestPicker({ slot: index, anchor: e.currentTarget });
            return;
          }
          listeners?.onKeyDown?.(e);
        }}
        sx={{ ...FACE_SX, ...PRESSED_SX }}
      >
        <Box component='span' sx={LETTER_SX}>
          {letter}
        </Box>
        <Box component='span' sx={LABEL_SX} title={slugOf(row) || undefined} data-testid={`unit-slot-label-${letter.toLowerCase()}`}>
          {row ? slugOf(row) : loading ? <Skeleton variant='text' width='70%' /> : 'Unit not loaded'}
        </Box>
        <Box component='span' sx={{ ...META_SX, display: 'flex' }} title={meta ? `${meta.place} · ${meta.rev}` : undefined} data-testid={`unit-slot-meta-${letter.toLowerCase()}`}>
          {meta ? (
            // Where the Unit is gives way before its revision, which a slot never cuts.
            <>
              <Box component='span' sx={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {meta.place}
              </Box>
              <Box component='span' sx={{ flex: 'none', whiteSpace: 'pre' }}>
                {` · ${meta.rev}`}
              </Box>
            </>
          ) : loading ? (
            <Skeleton variant='text' width='40%' />
          ) : (
            id.slice(0, 8)
          )}
        </Box>
      </Box>
      <Box
        component='button'
        type='button'
        data-testid={`unit-slot-clear-${letter.toLowerCase()}`}
        aria-label={`Clear slot ${letter}`}
        title='Remove this Unit from the comparison'
        onPointerDown={(e) => e.stopPropagation()}
        onClick={() => onClear(index)}
        sx={CLEAR_SX}
      >
        {CloseGlyph}
      </Box>
    </Box>
  );
});

export function UnitSlots({ ids, rowsById, loading, suggestion, onChange, onRequestPicker, openSlot = null }: UnitSlotsProps) {
  const rowRef = useRef<HTMLDivElement | null>(null);
  const latest = useRef(ids);
  latest.current = ids;

  const onClear = useCallback(
    (index: number) => {
      const current = latest.current;
      const next = removeSlot(current, current[index]);
      onChange(next);
      // Focus stays in the row: on the slot that moved into this one, or the one before it.
      // With no slot left, compare mode ends, and CompareController gives focus back to where it was before.
      if (next.length === 0) return;
      const letter = letterFor(Math.min(index, next.length - 1)).toLowerCase();
      requestAnimationFrame(() => rowRef.current?.querySelector<HTMLElement>(`[data-testid="unit-slot-${letter}"]`)?.focus());
    },
    [onChange],
  );

  const emptyLetter = letterFor(ids.length);
  const emptyFace = (
    <>
      <Box component='span' sx={{ ...LETTER_SX, background: componentTheme.fgSubtle }}>
        {emptyLetter}
      </Box>
      <Box component='span' sx={{ ...LABEL_SX, fontWeight: 400 }}>
        Compare against another Unit
      </Box>
      <Box component='span' sx={META_SX} data-testid='unit-slot-suggestion'>
        {suggestion ? `Suggested: ${suggestion}` : 'Add a Unit from the list'}
      </Box>
    </>
  );

  return (
    <Box ref={rowRef} role='group' aria-label='Units being compared' data-testid='unit-slots' sx={ROW_SX}>
      {ids.map((id, index) => (
        <Fragment key={id}>
          <SlotCard
            id={id}
            index={index}
            row={rowsById.get(id)}
            loading={loading}
            pressed={openSlot === index}
            onClear={onClear}
            onRequestPicker={onRequestPicker}
          />
          {index === 0 && ids.length >= 2 && (
            <Box
              component='button'
              type='button'
              data-testid='unit-slot-swap'
              aria-label='Swap A and B'
              title='Swap A and B'
              onClick={() => onChange(swapFirstTwo(latest.current))}
              sx={{ ...SWAP_SX, flex: 'none', boxShadow: 'none' }}
            >
              {SwapGlyph}
            </Box>
          )}
        </Fragment>
      ))}
      {ids.length < MAX_COMPARE_SLOTS && (
        <Box
          component='button'
          type='button'
          data-testid='unit-slot-add'
          aria-haspopup='dialog'
          aria-expanded={openSlot === 'add'}
          aria-label={`Empty slot ${emptyLetter}. Choose a Unit to compare against.`}
          onClick={(e) => onRequestPicker({ slot: 'add', anchor: e.currentTarget })}
          sx={{ ...EMPTY_SX, ...EMPTY_PICKER_SX, ...PRESSED_SX }}
        >
          {emptyFace}
        </Box>
      )}
    </Box>
  );
}
