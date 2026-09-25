// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * Which deployments are being compared, and the means of changing it.
 *
 * THIS IS THE RELEASES TAB'S SELECTOR, CONTINUED PAST TWO. The chip, the 36px
 * dashed square, and the sheet that drops below rather than over are all the
 * shipped control — they live in `selectorSlotStyles.ts` and both surfaces
 * draw from them. What changes here is only the count: slots keep going, each
 * new one 10px after the last, with the dashed square always at the end.
 *
 * ALL SLOTS ARE EQUAL. Slot A is also the deployment the pane is open on, so
 * the order is the URL. Drag a slot onto another slot to swap the two — see
 * `CompareColumnDnd.tsx`. There is no baseline, and no re-baseline control:
 * every slot gets the same clear (X) and the same picker.
 *
 * THE EMPTY SQUARE KEEPS ITS SHIPPED MEANING. On the Releases tab it means "A
 * against A's own predecessor". Here it means "this deployment against its
 * upstream", which the Configuration tab already shows. So an empty selector row
 * needs no new default state and no new explanation.
 *
 * NOTHING HERE RELEASES ANYTHING. Releasing belongs to the Releases tab; this
 * is a read-only compare surface and carries no action bar at all.
 */

import {
  memo,
  useCallback,
  useMemo,
  useRef,
  useState,
  type PointerEventHandler,
  type ReactElement,
  type ReactNode,
} from 'react';

import Box from '@mui/material/Box';

import { componentTheme } from '../componentTheme';
import { letterFor } from './slotLetter';
import { useCompareColumnDrag } from './CompareColumnDnd';
import { Chevron, CloseGlyph, PlusGlyph } from '../selectorGlyphs';
import {
  BADGE_SX,
  CLEAR_SLOT_SX,
  EMPTY_SLOT_SX,
  EMPTY_SLOT_TRACK_SX,
  LETTER_SX,
  META_SX,
  NAME_SX,
  OPTION_SX,
  SHEET_SX,
  SLOTS_SX,
  SLOT_BADGE_MIN,
  SLOT_CONTAINER_NAME,
  SLOT_DECLARED_SX,
  SLOT_FILLED_SX,
  SLOT_SX,
  SLOT_TOP_SX,
  TAG_SX,
} from '../selectorSlotStyles';

/** One pickable deployment. `id` is `Space.SpaceID`, the deployment's identity everywhere in this view. */
export interface DeploymentOption {
  id: string;
  /** What this deployment is shown as: its variant label, or its Space slug when it has none. */
  label: string;
  /** The Space slug, carried alongside `label` only when `label` is a variant label — so it differs. */
  displayName?: string;
  /** Everything in this deployment has been released to its target. */
  isCurrent?: boolean;
  /** This deployment holds configuration it has not released. */
  isDeclared?: boolean;
  /** The `rel-18 · 12 Sep` line under the name. */
  meta?: string;
  /** How many fields in this deployment differ from its upstream (`upgradeableCount`). */
  changedFields?: number;
  /** Whether the count above can be trusted yet. */
  state?: 'ready' | 'pending' | 'unavailable';
  /** A caveat worth reading before picking, e.g. an oversized unit that was skipped. */
  note?: string;
}

export interface DeploymentSelectorsProps {
  options: readonly DeploymentOption[];
  /** Slot A first, then B, C… Never empty: slot A is always the open deployment. */
  selection: readonly string[];
  onSelectionChange: (next: string[]) => void;
  /** How many slots the row will hold before it stops offering more. */
  maxSlots?: number;
}

/**
 * Five columns already scroll inside the pane. Past that the row stops being a
 * comparison and starts being a spreadsheet, and the pane is the wrong place
 * for one.
 */
const DEFAULT_MAX_SLOTS = 5;

/** From this many slots on, each slot keeps a minimum width and the row scrolls once they no longer fit. */
const MANY_SLOTS = 3;
/** The narrowest a slot gets before the row scrolls; with room to spare, slots grow to share it. */
const SLOT_WIDTH_WHEN_MANY = 136;
const SLOT_GROW_WHEN_MANY_SX = { flex: `1 1 ${SLOT_WIDTH_WHEN_MANY}px`, minWidth: `${SLOT_WIDTH_WHEN_MANY}px` } as const;
const SLOT_GAP_WHEN_MANY = 10;

const SLOTS_MANY_SX = { overflowX: 'auto', borderBottom: 0 } as const;

const SHEET_FILTER_SX = {
  flex: 'none',
  padding: '8px 12px',
  borderBottom: `1px solid ${componentTheme.borderMuted}`,
  background: componentTheme.bgSubtle,
} as const;

const SHEET_INPUT_SX = {
  // width:100% plus padding and a border is 100% PLUS them without this.
  boxSizing: 'border-box',
  width: '100%',
  border: `1px solid ${componentTheme.borderDefault}`,
  borderRadius: `${componentTheme.radiusSm}px`,
  padding: '5px 9px',
  fontSize: 12,
  fontFamily: 'inherit',
  color: componentTheme.fgDefault,
  background: componentTheme.bgDefault,
  '&::placeholder': { color: componentTheme.fgMuted, opacity: 1 },
  '&:focus-visible': { outline: `2px solid ${componentTheme.accent}`, outlineOffset: '-1px' },
} as const;

/** `A`, `B`, `C`… Past Z the index itself is the label; nobody compares 27 deployments. */
function badgeFor(option: DeploymentOption, inSlot = false): ReactNode {
  // In a slot the badge surrenders before the label does: a name the reader
  // cannot make out is worse than a status they can infer.
  const yields = inSlot
    ? { [`@container ${SLOT_CONTAINER_NAME} (max-width: ${SLOT_BADGE_MIN}px)`]: { display: 'none' } }
    : null;

  // No "unreleased" badge: release state is shown on the Releases tab, not here.
  if (option.isCurrent) {
    return (
      <Box
        component="span"
        data-testid="compare-current-badge"
        sx={{
          ...BADGE_SX,
          color: componentTheme.successEmphasis,
          background: componentTheme.successMuted,
          border: `1px solid ${componentTheme.success}`,
          ...yields,
        }}
      >
        current
      </Box>
    );
  }
  return null;
}

/**
 * What the right of a picker row says about the option.
 *
 * A count that has not arrived says `counting…` and a count that failed says
 * `count unavailable`. Neither may render as `0 fields`: "we have not been told"
 * falls into whichever neighbour is nearest unless it is given its own words,
 * and here the nearest neighbour reads as "nothing differs".
 */
function countLabel(option: DeploymentOption): string {
  if (option.state === 'unavailable') return 'count unavailable';
  if (option.state === 'pending' || option.changedFields === undefined) return 'counting…';
  return option.changedFields === 1 ? '1 field' : `${option.changedFields} fields`;
}

interface SlotProps {
  option: DeploymentOption | undefined;
  index: number;
  open: boolean;
  many: boolean;
  onToggle: () => void;
}

function Slot({ option, index, open, many, onToggle }: SlotProps): ReactElement {
  const letter = letterFor(index);
  return (
    <Box
      component="button"
      type="button"
      data-testid={`compare-selector-${letter.toLowerCase()}`}
      aria-haspopup="dialog"
      aria-expanded={open}
      aria-label={
        option
          ? `Selector ${letter} holds ${option.label}${
              option.displayName ? `, Space ${option.displayName}` : ''
            }. Choose a different deployment.`
          : `Selector ${letter} is empty. Choose a deployment.`
      }
      onClick={onToggle}
      sx={{
        ...SLOT_SX,
        ...(option?.isDeclared ? SLOT_DECLARED_SX : null),
        ...(many ? SLOT_GROW_WHEN_MANY_SX : null),
      }}
    >
      <Box component="span" sx={SLOT_TOP_SX}>
        <Box
          component="span"
          sx={{
            ...LETTER_SX,
            background: componentTheme.fgDefault,
          }}
        >
          {letter}
        </Box>
        <Box
          component="span"
          data-testid={`compare-selector-label-${letter.toLowerCase()}`}
          sx={{ ...TAG_SX, ...(option ? null : { color: componentTheme.fgSubtle, fontWeight: 400 }) }}
        >
          {option?.label ?? 'Choose a deployment'}
        </Box>
        {option ? badgeFor(option, true) : null}
        <Box
          component="span"
          sx={{ marginLeft: 'auto', color: componentTheme.fgSubtle, flex: 'none', display: 'inline-flex' }}
        >
          {Chevron}
        </Box>
      </Box>
      {option?.displayName ? <Box component="span" sx={NAME_SX}>{option.displayName}</Box> : null}
      <Box component="span" sx={META_SX}>{option?.meta ?? '—'}</Box>
    </Box>
  );
}

/** Every selector-row drag shares this scope, so a slot can only swap with another slot. */
const SELECTORS_DRAG_SCOPE = 'selectors';

interface FilledSlotProps {
  id: string;
  index: number;
  slot: ReactNode;
  many: boolean;
  onClear: (index: number) => void;
}

/**
 * The wrapper around a filled slot: the clear (X) and the drag target.
 *
 * A COMPONENT OF ITS OWN, not inline in the `.map()` above, because
 * `useCompareColumnDrag` is a hook — it has to run once per slot instance,
 * which a callback body cannot do.
 */
function FilledSlot({ id, index, slot, many, onClear }: FilledSlotProps): ReactElement {
  const letter = letterFor(index);
  const { setNodeRef, listeners } = useCompareColumnDrag(id, SELECTORS_DRAG_SCOPE);
  return (
    <Box
      ref={setNodeRef}
      data-compare-col={id}
      data-compare-surface="selectors"
      // Only the pointer activator, not the full listener set (which would
      // also carry a keyboard activator) — the slot underneath is already a
      // `<button>` with its own Enter/Space handling for the picker, and a
      // keyboard drag sensor on this wrapper would fight it.
      onPointerDown={listeners?.onPointerDown as PointerEventHandler<HTMLDivElement> | undefined}
      sx={{
        ...SLOT_FILLED_SX,
        ...(many ? SLOT_GROW_WHEN_MANY_SX : null),
        // Slot A leads the row; every slot after it — including B, which used
        // to sit past the swap gutter — takes the same 10px gap now that the
        // gutter is gone, at any slot count.
        marginLeft: index === 0 ? 0 : `${SLOT_GAP_WHEN_MANY}px`,
      }}
    >
      {slot}
      <Box
        component="button"
        type="button"
        data-testid={`compare-selector-clear-${letter.toLowerCase()}`}
        onClick={() => onClear(index)}
        onPointerDown={(event) => event.stopPropagation()}
        title="Remove this deployment from the comparison"
        aria-label={`Clear selector ${letter}`}
        sx={CLEAR_SLOT_SX}
      >
        {CloseGlyph}
      </Box>
    </Box>
  );
}

interface PickerProps {
  options: readonly DeploymentOption[];
  selection: readonly string[];
  /** The slot being filled, or `undefined` while the dashed square is adding one. */
  slotIndex: number | undefined;
  onPick: (id: string) => void;
  onClose: () => void;
}

function Picker({ options, selection, slotIndex, onPick, onClose }: PickerProps): ReactElement {
  const [filter, setFilter] = useState('');
  const needle = filter.trim().toLowerCase();
  const matches = useMemo(
    () =>
      needle
        ? options.filter(
            (option) =>
              option.label.toLowerCase().includes(needle) ||
              (option.displayName?.toLowerCase().includes(needle) ?? false),
          )
        : options,
    [options, needle],
  );

  const selectedId = slotIndex === undefined ? undefined : selection[slotIndex];

  return (
    <Box
      role="dialog"
      aria-label={
        slotIndex === undefined
          ? 'Choose a deployment to compare against'
          : `Choose what goes in selector ${letterFor(slotIndex)}`
      }
      data-testid="compare-selector-sheet"
      onKeyDown={(event) => {
        if (event.key !== 'Escape') return;
        event.stopPropagation();
        onClose();
      }}
      sx={SHEET_SX}
    >
      <Box sx={SHEET_FILTER_SX}>
        <Box
          component="input"
          type="text"
          autoFocus
          value={filter}
          placeholder="Filter deployments"
          aria-label="Filter deployments"
          onChange={(event) => setFilter((event.target as HTMLInputElement).value)}
          sx={SHEET_INPUT_SX}
        />
      </Box>
      <Box role="radiogroup" aria-label="Deployments available" sx={{ flex: 1, overflow: 'auto' }}>
        {matches.length === 0 ? (
          <Box sx={{ padding: '14px 12px', fontSize: 12, color: componentTheme.fgMuted }}>
            No deployment matches that.
          </Box>
        ) : null}
        {matches.map((option) => {
          const heldBy = selection.indexOf(option.id);
          const heldElsewhere = heldBy >= 0 && heldBy !== slotIndex;
          // Slot A is the open deployment; a pick that moves another deployment
          // into it opens that one. A held deployment can be swapped into any
          // filled slot, but the dashed "add" square can only take a free one —
          // there is nothing for it to swap with.
          const takenFirm = heldElsewhere && slotIndex === undefined;
          const unavailable = option.state === 'unavailable';
          const disabled = unavailable || takenFirm;
          const title = unavailable
            ? `${option.label} could not be loaded`
            : takenFirm
              ? `${option.label} is already in selector ${letterFor(heldBy)}`
              : '';

          return (
            <Box
              key={option.id}
              component="button"
              type="button"
              role="radio"
              data-testid={`compare-selector-option-${option.label}`}
              aria-checked={option.id === selectedId}
              disabled={disabled}
              title={title}
              onClick={() => onPick(option.id)}
              sx={OPTION_SX}
            >
              <Box component="span" sx={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0, width: '100%' }}>
                <Box
                  component="span"
                  sx={{
                    fontFamily: componentTheme.fontMono,
                    fontSize: 12,
                    fontWeight: 700,
                    color: componentTheme.fgDefault,
                    flex: 'none',
                  }}
                >
                  {option.label}
                </Box>
                {badgeFor(option)}
                <Box
                  component="span"
                  sx={{
                    marginLeft: 'auto',
                    fontFamily: componentTheme.fontMono,
                    fontSize: 10,
                    color: componentTheme.fgMuted,
                    flex: 'none',
                  }}
                >
                  {heldElsewhere ? `in selector ${letterFor(heldBy)}` : countLabel(option)}
                </Box>
              </Box>
              {option.displayName ? (
                <Box
                  component="span"
                  sx={{
                    marginTop: '1px',
                    fontSize: 11.5,
                    color: componentTheme.fgMuted,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    maxWidth: '100%',
                  }}
                >
                  {option.displayName}
                </Box>
              ) : null}
              {option.meta ? (
                <Box
                  component="span"
                  sx={{
                    marginTop: '3px',
                    fontFamily: componentTheme.fontMono,
                    fontSize: 10,
                    color: componentTheme.fgMuted,
                  }}
                >
                  {option.meta}
                </Box>
              ) : null}
              {option.note ? (
                <Box component="span" sx={{ marginTop: '2px', fontSize: 10.5, color: componentTheme.attention }}>
                  {option.note}
                </Box>
              ) : null}
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}

/** `number` is the slot being edited; `'add'` is the dashed square. */
type OpenTarget = number | 'add';

function DeploymentSelectorsInner({
  options,
  selection,
  onSelectionChange,
  maxSlots = DEFAULT_MAX_SLOTS,
}: DeploymentSelectorsProps): ReactElement {
  const [open, setOpen] = useState<OpenTarget | null>(null);
  const slotsRef = useRef<HTMLDivElement | null>(null);

  const optionById = useMemo(() => {
    const map = new Map<string, DeploymentOption>();
    for (const option of options) map.set(option.id, option);
    return map;
  }, [options]);

  const many = selection.length >= MANY_SLOTS;
  const atCapacity = selection.length >= maxSlots;

  const restoreFocus = useCallback((testId: string) => {
    requestAnimationFrame(() => {
      const target = slotsRef.current?.querySelector<HTMLElement>(`[data-testid="${testId}"]`);
      target?.focus();
    });
  }, []);

  const closeAndRestore = useCallback(
    (target: OpenTarget) => {
      setOpen(null);
      restoreFocus(target === 'add' ? 'compare-selector-add' : `compare-selector-${letterFor(target).toLowerCase()}`);
    },
    [restoreFocus],
  );

  const handlePick = useCallback(
    (id: string) => {
      const target = open;
      if (target === null) return;
      const next = [...selection];

      if (target === 'add') {
        if (!next.includes(id)) next.push(id);
      } else {
        const heldBy = next.indexOf(id);
        if (heldBy === target) {
          // Picking what the slot already holds clears it, on any slot —
          // there is no slot that is exempt any more — as long as one would
          // remain.
          if (next.length > 1) next.splice(target, 1);
        } else if (heldBy >= 0) {
          // The target holds a deployment picked into another slot: swap the
          // two. When the target is slot A, this changes which deployment the
          // pane is open on.
          next[heldBy] = next[target] as string;
          next[target] = id;
        } else {
          next[target] = id;
        }
      }

      onSelectionChange(next);
      closeAndRestore(target);
    },
    [open, selection, onSelectionChange, closeAndRestore],
  );

  const handleClear = useCallback(
    (index: number) => {
      const next = [...selection];
      next.splice(index, 1);
      onSelectionChange(next);
      // Clearing slot A moves the next deployment into it — the host reacts to
      // that by opening it — so focus follows to the slot that is now first
      // rather than to the add square a clear normally returns to.
      restoreFocus(index === 0 ? 'compare-selector-a' : 'compare-selector-add');
    },
    [selection, onSelectionChange, restoreFocus],
  );

  return (
    <Box
      ref={slotsRef}
      data-testid="compare-selectors"
      sx={{ ...SLOTS_SX, ...(many ? SLOTS_MANY_SX : null) }}
    >
      {selection.map((id, index) => {
        const option = optionById.get(id);
        const slot = (
          <Slot
            option={option}
            index={index}
            many={many}
            open={open === index}
            onToggle={() => setOpen((current) => (current === index ? null : index))}
          />
        );

        // A lone slot has nothing to compare against, so there is nothing to
        // clear it TO — the pane would be left with no open deployment. Every
        // slot once there are two or more gets the same X, and something to
        // swap with. The wrapper still takes SLOT_FILLED_SX: without it the
        // Slot's flex sizing has no flex parent and it shrinks to a sliver.
        if (selection.length < 2) {
          return (
            <Box key={id} data-compare-col={id} data-compare-surface="selectors" sx={SLOT_FILLED_SX}>
              {slot}
            </Box>
          );
        }

        return (
          <FilledSlot key={id} id={id} index={index} slot={slot} many={many} onClear={handleClear} />
        );
      })}

      {/* The dashed square keeps the same 10px gap after the last slot at
          every slot count. */}
      <Box sx={{ ...EMPTY_SLOT_TRACK_SX, marginLeft: `${SLOT_GAP_WHEN_MANY}px` }}>
        <Box
          component="button"
          type="button"
          data-testid="compare-selector-add"
          data-shape="square"
          aria-haspopup="dialog"
          aria-expanded={open === 'add'}
          disabled={atCapacity}
          title={
            atCapacity
              ? `${maxSlots} deployments is as wide as this comparison goes`
              : 'Compare against another deployment'
          }
          aria-label="Empty slot. Choose a deployment to compare against."
          onClick={() => setOpen((current) => (current === 'add' ? null : 'add'))}
          sx={EMPTY_SLOT_SX}
        >
          {PlusGlyph}
        </Box>
      </Box>

      {open === null ? null : (
        <Picker
          options={options}
          selection={selection}
          slotIndex={open === 'add' ? undefined : open}
          onPick={handlePick}
          onClose={() => closeAndRestore(open)}
        />
      )}
    </Box>
  );
}

export const DeploymentSelectors = memo(DeploymentSelectorsInner);
