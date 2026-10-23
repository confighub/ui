// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import {
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  type RefObject,
  useCallback,
  useMemo,
  useRef,
} from 'react';

import AddIcon from '@mui/icons-material/Add';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import CheckIcon from '@mui/icons-material/Check';
import FilterAltOutlinedIcon from '@mui/icons-material/FilterAltOutlined';
import LayersOutlinedIcon from '@mui/icons-material/LayersOutlined';
import RemoveCircleOutlineIcon from '@mui/icons-material/RemoveCircleOutline';
import Box from '@mui/material/Box';
import ClickAwayListener from '@mui/material/ClickAwayListener';
import Divider from '@mui/material/Divider';
import GlobalStyles from '@mui/material/GlobalStyles';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import MenuItem from '@mui/material/MenuItem';
import MenuList from '@mui/material/MenuList';
import Paper from '@mui/material/Paper';
import Popper from '@mui/material/Popper';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useTheme } from '@mui/material/styles';

import { plainKey } from '../keys/usePageShortcuts';
import { Kbd } from '../lenses/parts';
import { fieldById } from '../model/fields';
import type { SortDir, ViewDef } from '../model/types';
import {
  type Shortcut,
  useEscLayer,
  useExplorerContext,
  useRegisterShortcut,
  useRegisterSlot,
} from '../state/context';
import { lensIdGen } from '../state/initial';
import { useWork } from '../state/useExplorer';
import { FlyInLayer } from './FlyIn';
import { type CellAction, canGroupBy, planCellLens } from './cellActions';
import { type CellSelection, SELECTED_ATTR, useCellSelection } from './useCellSelection';
import { useDropToGroup } from './useDropToGroup';

/**
 * The cell popover: a click on a value in the results offers Only this ·
 * Exclude · Group by · Sort ↑↓ (keys O, E, G). ⇧-click more cells of the same
 * column to act on all of them. Only this and Exclude add (or change) a lens,
 * and a chip flies from the cell to that lens. On "All units" the change opens
 * a temporary tab, as every change there does.
 *
 * The popover does not trap focus or block the page, so ⇧-clicks reach the
 * cells; a click anywhere else closes it. This host also registers the
 * `flyIn` slot and the drop of a column header on the Group section.
 */

const POPOVER_WIDTH = 250;
const MAX_VALUE_CHIPS = 3;

type PopoverAction = CellAction | 'group' | 'asc' | 'desc';

const noIds = () => 'preview';

function valueText(v: string | null): string {
  return v === null || v === '' ? 'none' : v;
}

interface PopoverProps {
  selection: CellSelection;
  work: ViewDef;
  paperRef: RefObject<HTMLDivElement>;
  onAction: (action: PopoverAction) => void;
  /** A click outside: the person's focus is already where they clicked. */
  onClose: () => void;
  /** Tab out of the popover: close it and give the focus back to the cell. */
  onLeave: () => void;
}

const ACTION_KEYS: Record<string, PopoverAction> = { o: 'only', e: 'exclude', g: 'group' };

function CellPopover({ selection, work, paperRef, onAction, onClose, onLeave }: PopoverProps) {
  const theme = useTheme();
  const field = fieldById(selection.entity, selection.field);
  const label = field?.label ?? selection.field;
  const n = selection.values.length;
  const only = planCellLens(work, selection.field, selection.values, 'only', noIds);
  const exclude = planCellLens(work, selection.field, selection.values, 'exclude', noIds);
  const groupable = canGroupBy(selection.entity, selection.field);
  const grouped = work.groupBy.includes(selection.field);
  const sortDir: SortDir | null = work.sort?.column === selection.field ? work.sort.dir : null;

  // A virtual anchor: the first cell may scroll out of the virtual list and
  // unmount, and the popover then stays where it was.
  const anchor = useMemo(
    () => ({
      getBoundingClientRect: () =>
        selection.anchor.isConnected
          ? selection.anchor.getBoundingClientRect()
          : selection.anchorRect,
    }),
    [selection.anchor, selection.anchorRect],
  );

  const shown = selection.values.slice(0, MAX_VALUE_CHIPS);
  const more = n - shown.length;

  return (
    <Popper
      open
      anchorEl={anchor}
      // Beside the cell, not under it: the cells below in the same column stay
      // free for ⇧-click. Near the right edge it flips to the left.
      placement='right-start'
      sx={{ zIndex: theme.zIndex.modal }}
      modifiers={[{ name: 'offset', options: { offset: [-6, 10] } }]}
    >
      <ClickAwayListener
        onClickAway={(e) => {
          // A click on another value opens or extends the popover itself.
          if (e.target instanceof Element && e.target.closest('[data-vx-value]')) return;
          onClose();
        }}
      >
        <Paper
          ref={paperRef}
          elevation={8}
          data-testid='vx-cell-popover'
          // With focus in the menu, O/E/G act (the menu would otherwise jump to
          // the item starting with that letter) and Tab leaves, as in any menu.
          onKeyDownCapture={(e: ReactKeyboardEvent) => {
            if (e.metaKey || e.ctrlKey || e.altKey) return;
            if (e.key === 'Tab') {
              e.preventDefault();
              e.stopPropagation();
              onLeave();
              return;
            }
            const action = ACTION_KEYS[e.key.toLowerCase()];
            if (!action) return;
            e.preventDefault();
            e.stopPropagation();
            onAction(action);
          }}
          sx={{ width: POPOVER_WIDTH, borderRadius: 1.5, overflow: 'hidden' }}
        >
          <Stack
            direction='row'
            alignItems='center'
            // One line, so picking more values never makes the popover jump.
            flexWrap='nowrap'
            gap={0.75}
            sx={{ px: 1.25, pt: 1.125, pb: 0.625, minWidth: 0, overflow: 'hidden' }}
          >
            <Typography
              variant='body2'
              sx={{ fontSize: 11.5, color: 'text.secondary', fontWeight: 700, flexShrink: 0 }}
            >
              {label}
            </Typography>
            {shown.map((v) => (
              <Box
                key={v ?? '\u0000'}
                component='span'
                data-testid='vx-cell-popover-value'
                sx={{
                  fontSize: 12,
                  fontWeight: 700,
                  color: 'primary.main',
                  bgcolor: 'primary.light',
                  boxShadow: 'inset 0 0 0 1px var(--rust-ring)',
                  borderRadius: 1,
                  px: 0.75,
                  maxWidth: 180,
                  minWidth: 0,
                  flexShrink: 1,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {valueText(v)}
              </Box>
            ))}
            {more > 0 && (
              <Typography
                variant='body2'
                sx={{
                  fontSize: 11.5,
                  color: 'text.secondary',
                  fontWeight: 700,
                  flexShrink: 0,
                }}
              >
                +{more}
              </Typography>
            )}
          </Stack>
          <MenuList
            dense
            disablePadding
            autoFocusItem={selection.keyboard}
            sx={{ py: 0.5 }}
            aria-label={`Actions for ${label}`}
          >
            <ActionItem
              icon={<FilterAltOutlinedIcon fontSize='small' />}
              text={n > 1 ? `Only these ${n}` : 'Only this'}
              keyHint='O'
              refused={only.kind === 'refused' ? only.reason : null}
              disabled={only.kind === 'refused'}
              onClick={() => onAction('only')}
            />
            <ActionItem
              icon={<RemoveCircleOutlineIcon fontSize='small' />}
              text={n > 1 ? `Exclude these ${n}` : 'Exclude'}
              keyHint='E'
              refused={exclude.kind === 'refused' ? exclude.reason : null}
              disabled={exclude.kind === 'refused'}
              onClick={() => onAction('exclude')}
            />
            {groupable && <Divider sx={{ my: 0.5 }} />}
            {groupable && (
              <ActionItem
                icon={<LayersOutlinedIcon fontSize='small' />}
                text={grouped ? `Grouped by ${label}` : `Group by ${label}`}
                keyHint='G'
                refused={grouped ? `The rows are already grouped by ${label}.` : null}
                disabled={grouped}
                onClick={() => onAction('group')}
              />
            )}
            {(['ASC', 'DESC'] as const).map((dir) => (
              <ActionItem
                key={dir}
                icon={
                  dir === 'ASC' ? (
                    <ArrowUpwardIcon fontSize='small' />
                  ) : (
                    <ArrowDownwardIcon fontSize='small' />
                  )
                }
                text={dir === 'ASC' ? 'Sort ascending' : 'Sort descending'}
                selected={sortDir === dir}
                refused={null}
                onClick={() => onAction(dir === 'ASC' ? 'asc' : 'desc')}
              />
            ))}
          </MenuList>
          <Stack
            direction='row'
            alignItems='center'
            gap={0.75}
            sx={{ px: 1.25, py: 0.75, borderTop: 1, borderColor: 'divider' }}
          >
            <AddIcon sx={{ fontSize: 12, color: 'text.disabled' }} />
            <Typography variant='body2' sx={{ fontSize: 11.5, color: 'text.secondary' }}>
              Shift-click more cells to pick several
            </Typography>
          </Stack>
        </Paper>
      </ClickAwayListener>
    </Popper>
  );
}

interface ActionItemProps {
  icon: ReactNode;
  text: string;
  /** The key that does it, shown at the right; none for the sort items. */
  keyHint?: string;
  /** The current choice (the sort in effect), marked with a check. */
  selected?: boolean;
  /** Why the action cannot be taken; the item is then disabled and says so. */
  refused: string | null;
  onClick: () => void;
  /**
   * Set by MenuList, which reads and clones its direct children: `disabled`
   * makes it skip the item, `autoFocus` focuses the first item.
   */
  disabled?: boolean;
  autoFocus?: boolean;
}

function ActionItem({
  icon,
  text,
  keyHint,
  refused,
  onClick,
  autoFocus,
  selected,
}: ActionItemProps) {
  return (
    <MenuItem
      dense
      disabled={!!refused}
      autoFocus={autoFocus}
      onClick={onClick}
      sx={{ minHeight: 32, alignItems: refused ? 'flex-start' : 'center' }}
    >
      <ListItemIcon sx={{ minWidth: 34, mt: refused ? 0.25 : 0 }}>{icon}</ListItemIcon>
      <ListItemText
        primary={text}
        secondary={refused}
        primaryTypographyProps={{ variant: 'body2' }}
        secondaryTypographyProps={{
          variant: 'body2',
          sx: { fontSize: 11.5, whiteSpace: 'normal' },
        }}
      />
      {!refused && keyHint && <Kbd sx={{ ml: 1 }}>{keyHint}</Kbd>}
      {selected && (
        <CheckIcon sx={{ fontSize: 16, color: 'primary.main', ml: 1 }} aria-label='current' />
      )}
    </MenuItem>
  );
}

/**
 * Give the focus back after the popover closes, never to the page body:
 * 1. the cell it opened from, when that cell is still there;
 * 2. in the table, a value in the row now at (or after) that place;
 * 3. in any layout, its first focusable item (a list row's value, a board
 *    card), else the layout's container itself;
 * 4. the toolbar, when the results are empty.
 * The rows may change under it (Only this, Exclude), so this waits two frames.
 */
function focusNear(selection: CellSelection): void {
  requestAnimationFrame(() => requestAnimationFrame(() => focusNow(selection)));
}

const LAYOUT_CONTAINERS = ['vx-table', 'vx-list', 'vx-board'];
const FOCUSABLE = '[tabindex="0"], button:not([disabled]), [href]';

function focusNow(selection: CellSelection): void {
  if (selection.anchor.isConnected) {
    selection.anchor.focus();
    return;
  }
  const table = document.querySelector('[data-testid="vx-table"]');
  if (table) {
    const rows = Array.from(table.querySelectorAll<HTMLElement>('[data-index]'))
      .map((holder) => ({
        index: Number(holder.dataset.index),
        row: holder.querySelector<HTMLElement>('[data-testid="vx-row"]'),
      }))
      .filter((r): r is { index: number; row: HTMLElement } => r.row !== null)
      .sort((a, b) => a.index - b.index);
    const at = selection.rowIndex ?? 0;
    const target = rows.find((r) => r.index >= at) ?? rows[rows.length - 1];
    if (target) {
      // A value in that row, in the same column when it has one: the row's own
      // focus style is the full-width selection outline, which reads as "picked".
      const value =
        target.row.querySelector<HTMLElement>(
          `[data-vx-value="${CSS.escape(selection.field)}"]`,
        ) ?? target.row.querySelector<HTMLElement>('[data-vx-value]');
      (value ?? target.row).focus();
      return;
    }
  }
  for (const id of LAYOUT_CONTAINERS) {
    const container = document.querySelector<HTMLElement>(`[data-testid="${id}"]`);
    if (!container) continue;
    const item = container.querySelector<HTMLElement>(FOCUSABLE);
    if (item) {
      item.focus();
      return;
    }
    // An empty layout: the container takes the focus, without joining the Tab order.
    if (!container.hasAttribute('tabindex')) container.setAttribute('tabindex', '-1');
    container.focus();
    return;
  }
  document.querySelector<HTMLElement>(`[data-testid="vx-toolbar"] ${FOCUSABLE}`)?.focus();
}

/** Registers `openCellPopover` and `flyIn`, and the drop of a header on Group. */
export function CellPopoverHost() {
  const theme = useTheme();
  const { state, dispatch, slots } = useExplorerContext();
  const work = useWork();
  const { selection, open, close } = useCellSelection(state.activeId, work.layout);
  const paperRef = useRef<HTMLDivElement>(null);

  useRegisterSlot('openCellPopover', open);
  useDropToGroup(work.groupBy, dispatch);

  // Close, then put the focus back near the cells, never on the page body.
  const closeWithFocus = useCallback(() => {
    if (!selection) return;
    close();
    focusNear(selection);
  }, [selection, close]);
  useEscLayer(selection !== null, closeWithFocus);

  const act = useCallback(
    (action: PopoverAction) => {
      if (!selection) return;
      const { field, values } = selection;
      if (action === 'only' || action === 'exclude') {
        const plan = planCellLens(work, field, values, action, lensIdGen);
        if (plan.kind === 'refused') return;
        const anchorEl = selection.cells.find((c) => c.el.isConnected)?.el;
        const from = anchorEl ? anchorEl.getBoundingClientRect() : selection.anchorRect;
        close();
        focusNear(selection);
        dispatch(
          plan.kind === 'add'
            ? { type: 'addLenses', lenses: [plan.lens] }
            : { type: 'updateLens', lens: plan.lens },
        );
        slots.current.flyIn({ from, label: plan.label, lensId: plan.lens.id });
        return;
      }
      close();
      focusNear(selection);
      if (action === 'group') {
        if (!work.groupBy.includes(field) && canGroupBy(selection.entity, field)) {
          dispatch({ type: 'setGroupBy', groupBy: [...work.groupBy, field] });
        }
        return;
      }
      dispatch({
        type: 'setSort',
        sort: { column: field, dir: action === 'asc' ? 'ASC' : 'DESC' },
      });
    },
    [selection, work, dispatch, slots, close],
  );

  const shortcuts = useMemo<Shortcut[]>(
    () =>
      (
        [
          ['o', 'Only this (a picked cell)', 'only'],
          ['e', 'Exclude (a picked cell)', 'exclude'],
          ['g', 'Group by (a picked cell)', 'group'],
        ] as const
      ).map(([key, label, action]) => ({
        id: `cell-popover-${action}`,
        keys: key.toUpperCase(),
        label,
        matches: (e: KeyboardEvent) => selection !== null && plainKey(key)(e),
        run: () => act(action),
      })),
    [selection, act],
  );
  useRegisterShortcut(shortcuts[0]);
  useRegisterShortcut(shortcuts[1]);
  useRegisterShortcut(shortcuts[2]);

  // ↓ from the cell moves into the menu of a popover opened with the mouse.
  const enter = useMemo<Shortcut>(
    () => ({
      id: 'cell-popover-enter',
      keys: '↓',
      label: 'Move into the cell popover',
      matches: (e: KeyboardEvent) =>
        selection !== null &&
        e.key === 'ArrowDown' &&
        !e.metaKey &&
        !e.ctrlKey &&
        !e.altKey &&
        !paperRef.current?.contains(document.activeElement),
      run: () =>
        paperRef.current
          ?.querySelector<HTMLElement>('[role="menuitem"]:not(.Mui-disabled)')
          ?.focus(),
    }),
    [selection],
  );
  useRegisterShortcut(enter);

  return (
    <>
      <GlobalStyles
        styles={{
          [`[data-vx-value][${SELECTED_ATTR}="true"]`]: {
            backgroundColor: theme.palette.primary.light,
            boxShadow: `inset 0 0 0 1.5px ${theme.palette.primary.main}`,
            color: theme.palette.text.primary,
          },
        }}
      />
      {selection && (
        <CellPopover
          selection={selection}
          work={work}
          paperRef={paperRef}
          onAction={act}
          onClose={close}
          onLeave={closeWithFocus}
        />
      )}
      <FlyInLayer />
    </>
  );
}
