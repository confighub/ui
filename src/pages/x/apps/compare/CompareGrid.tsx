// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * N deployments as N columns, inside a pane that is 380 to 650px wide.
 *
 * ONLY THE FIELD COLUMN FREEZES; every value column scrolls sideways under it.
 * The pane never widens itself, never becomes a page and never restacks a
 * row — the existing pane resize handle stays the only width control.
 * Widening would take space from the graph, which is where the user picks
 * what to compare; stacking values per row would break the vertical scan
 * down one deployment, which is the thing this grid is for.
 *
 * NO COLUMN FREEZES, because there is no reference column any more: blue
 * means "the deployments disagree", not "differs from a frozen column", so
 * there is no colour that would point at nothing once its column scrolled
 * out of view.
 *
 * Three deployments fit without scrolling at all (220 + 3 × 104 = 532 inside a
 * 560px pane), so the scroll only has work to do at four and five. Container
 * images are hoisted above this grid, where they get the pane's full width —
 * a registry-qualified reference does not fit a 104px column and is where the
 * long strings live.
 */

import { memo, useCallback, useMemo, useRef, useState, type ReactElement } from 'react';

import Box from '@mui/material/Box';

import { componentTheme } from '../componentTheme';
import {
  KEY_COLUMN_PX,
  KEY_TRACK_SX,
  PAGE_KEY_TRACK_SX,
  PAGE_ROW_END_PX,
  PAGE_VALUE_TRACK_SX,
  VALUE_TRACK_SX,
} from './compareTracks';
import { useComparePageLayout } from './compareLayout';
import { CompareCell } from './CompareCell';
import { useCompareColumnDrag } from './CompareColumnDnd';
import { CompareValueEditor } from './CompareValueEditor';
import { editBlockReason, editKey, stagedKind, type StagedCompareEdit } from './compareEditing';
import { cutPathLeft, elideFolderLabel, mergeSingleChildFolders } from './compareTree';
import { LETTER_SX, letterFor } from './slotLetter';
import { COMPARE_STAGED_TOKENS } from './rowTypeTokens';
import { rowDiffers, type CompareColumnInput, type CompareLeafRow, type CompareRow } from './deploymentCompareModel';

export interface CompareGridProps {
  columns: readonly CompareColumnInput[];
  rows: readonly CompareRow[];
  /**
   * Folders that must stay open however the user collapsed them.
   *
   * A staged edit pins its row into the list past the filter; a pinned row inside
   * a collapsed ancestor is unreachable, so the pin silently does nothing — the
   * exact failure pinning exists to prevent.
   */
  forceExpanded?: ReadonlySet<string>;
  /** Pending changes, keyed by `editKey`. Absent when the grid is read-only. */
  stagedEdits?: ReadonlyMap<string, StagedCompareEdit>;
  /** The unit these rows belong to, so a staged edit can name its own. */
  unitSlug?: string;
  /** Stage a change. Absent means the grid takes no edits at all. */
  onStageEdit?: (edit: StagedCompareEdit) => void;
  /**
   * The drag scope for this grid's column heads, unique per document group so
   * a head drag never lands on another group's heads. Absent means this grid
   * is mounted without a `CompareColumnDnd` wrapper, so its heads take no drag.
   */
  dndScope?: string;
}

const INDENT_BASE_PX = 16;
/** The shipped configuration tree's own indent step. */
const INDENT_PX = 10;
/**
 * Roughly what the 220px key column holds at 12.5px mono, before indent.
 * A budget in characters rather than pixels because the label is shortened in
 * the model, where there is nothing to measure against.
 */
const KEY_PADDING_RIGHT_PX = 12;
/** The fold chevron sits before a folder's label and takes room from it. */
const FOLD_CHEVRON_PX = 12;
/** The Configuration tab's tree sets folder rows at 11.5px, under its 12.5px keys. */
const FOLDER_FONT_PX = 11.5;
/** JetBrains Mono advances 0.6em per character. Monospace, so a character budget is exact rather than a guess. */
const MONO_ADVANCE_PX = FOLDER_FONT_PX * 0.6;

/** How many characters actually fit beside a folder row's chevron at this depth. */
function folderLabelBudget(depth: number): number {
  const available =
    KEY_COLUMN_PX - (INDENT_BASE_PX + depth * INDENT_PX) - KEY_PADDING_RIGHT_PX - FOLD_CHEVRON_PX;
  return Math.max(6, Math.floor(available / MONO_ADVANCE_PX));
}

/**
 * NOT A SCROLL CONTAINER. The pane has exactly one, in
 * `ComponentCompareSection`, and every document group lives inside it.
 *
 * A scroller per group was the second half of the alignment defect: each group
 * kept its own `scrollLeft`, so scrolling the Deployment left of the ConfigMap
 * put their value columns at different x — two runs of columns that were each
 * internally straight and did not line up with each other. Tracks shared by
 * declaration are not enough; the groups have to move together too.
 */
const GRID_SX = { width: '100%' } as const;

const HEAD_SX = {
  display: 'flex',
  width: '100%',
  position: 'sticky',
  top: 0,
  zIndex: 6,
  background: componentTheme.bgDefault,
  borderBottom: `1px solid ${componentTheme.borderDefault}`,
} as const;

const HEAD_CELL_SX = {
  ...VALUE_TRACK_SX,
  padding: '5px 8px',
  display: 'flex',
  alignItems: 'center',
  gap: '5px',
  borderLeft: `1px solid ${componentTheme.borderSubtle}`,
  background: componentTheme.bgDefault,
} as const;

const HEAD_WHO_SX = {
  fontFamily: componentTheme.fontMono,
  fontSize: 10.5,
  fontWeight: 600,
  color: componentTheme.fgMuted,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
} as const;

const ROW_SX = {
  display: 'flex',
  width: '100%',
  boxSizing: 'border-box',
  borderBottom: `1px solid ${componentTheme.borderSubtle}`,
  minHeight: 22,
  alignItems: 'stretch',
  background: componentTheme.bgDefault,
  position: 'relative',
} as const;

/**
 * The 2px left-edge bar the shipped tree puts on a staged row.
 *
 * On the ROW, not the cell, because staging is a fact about the row even when
 * only one column of it changed — and because a staged row that looked like any
 * other row is the defect this is here to close.
 */
const STAGED_BAR_SX = {
  position: 'absolute',
  left: 0,
  top: 0,
  bottom: 0,
  width: 2,
  // ABOVE the frozen key cell, which is `zIndex: 3` with an opaque background
  // and starts at the same x. The bar was rendering all along and being painted
  // over — the same reason the comparison badge needed a z-index on the node.
  zIndex: 4,
  pointerEvents: 'none',
} as const;

/** The shipped staging checkbox: checked means "included in the next apply". */
const STAGED_CHECKBOX_SX = {
  flex: 'none',
  width: 11,
  height: 11,
  marginRight: '5px',
  borderRadius: '2px',
  border: 0,
  padding: 0,
  cursor: 'pointer',
  display: 'grid',
  placeItems: 'center',
  color: componentTheme.fgOnEmphasis,
  '&:focus-visible': { outline: `2px solid ${componentTheme.accent}`, outlineOffset: '1px' },
} as const;

const KEY_CELL_SX = {
  ...KEY_TRACK_SX,
  position: 'sticky',
  left: 0,
  zIndex: 3,
  display: 'flex',
  alignItems: 'center',
  fontFamily: componentTheme.fontMono,
  fontSize: 12.5,
  color: componentTheme.fgDefault,
  paddingRight: '12px',
  background: 'inherit',
  // Elide, never wrap: a two-line key makes a 39px row out of a 22px contract.
  whiteSpace: 'nowrap',
  overflow: 'hidden',
} as const;

const VALUE_CELL_SX = {
  ...VALUE_TRACK_SX,
  borderLeft: `1px solid ${componentTheme.borderSubtle}`,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'flex-end',
  // No vertical padding: the row's 22px is the density contract, and padding
  // here stacks on the pill's own to make a taller row than either declares.
  padding: '0 8px',
  background: 'inherit',
} as const;

/**
 * The page layout's cells (`compareLayout.ts`): the same cells on its wider
 * tracks, a 34px head of two lines, and 16px after the last column so its
 * values do not touch the frame.
 */
const PAGE_HEAD_SX = { ...HEAD_SX, boxSizing: 'border-box', paddingRight: `${PAGE_ROW_END_PX}px` } as const;
const PAGE_ROW_SX = { ...ROW_SX, paddingRight: `${PAGE_ROW_END_PX}px` } as const;
const PAGE_HEAD_CELL_SX = { ...HEAD_CELL_SX, ...PAGE_VALUE_TRACK_SX, height: 34, padding: '0 8px' } as const;
const PAGE_KEY_CELL_SX = { ...KEY_CELL_SX, ...PAGE_KEY_TRACK_SX } as const;
const PAGE_VALUE_CELL_SX = { ...VALUE_CELL_SX, ...PAGE_VALUE_TRACK_SX } as const;
const PAGE_HEAD_WHO_SX = {
  ...HEAD_WHO_SX,
  fontFamily: componentTheme.fontSans,
  fontSize: 11.5,
  fontWeight: 600,
} as const;
const PAGE_HEAD_PRIMARY_SX = { ...PAGE_HEAD_WHO_SX, lineHeight: 1.25, color: componentTheme.fgDefault } as const;
const PAGE_HEAD_SECONDARY_SX = {
  ...PAGE_HEAD_WHO_SX,
  fontSize: 11,
  fontWeight: 400,
  lineHeight: 1.25,
  color: componentTheme.fgSubtle,
} as const;

/** The page layout's indent: smaller steps, so a long path keeps the room. */
const PAGE_INDENT_BASE_PX = 12;
const PAGE_INDENT_PX = 8;
/** JetBrains Mono advances 0.6em per character; the keys are 12.5px. */
const KEY_ADVANCE_PX = 12.5 * 0.6;
/** What the "by position" mark beside a key takes, with its margin. */
const POSITIONAL_MARK_PX = 58;

/**
 * A text cut on the LEFT, so its end always shows: the text is laid out right
 * to left for the ellipsis, and the marks around it keep the characters in
 * their own order.
 */
const LEFT_CUT_SX = {
  minWidth: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  direction: 'rtl',
  textAlign: 'left',
} as const;

/** Where the last segment starts: after the last dot outside a `[...]` token. */
function lastSegmentAt(path: string): number {
  let depth = 0;
  for (let i = path.length - 1; i >= 0; i -= 1) {
    const char = path[i];
    if (char === ']') depth += 1;
    else if (char === '[') depth -= 1;
    else if (char === '.' && depth === 0) return i + 1;
  }
  return 0;
}

/**
 * A path in the page layout, cut on the left at a segment boundary to fit
 * `budget` characters (`cutPathLeft`), so the field's own name always shows;
 * the whole path is in its title. Before the key column is measured, the end
 * is cut by the CSS ellipsis.
 */
function CutPath({ path, title, budget, muted }: { path: string; title: string; budget: number | null; muted?: boolean }): ReactElement {
  const shown = budget === null ? path : cutPathLeft(path, budget);
  const at = lastSegmentAt(shown);
  return (
    <Box component="span" title={title} sx={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
      {at > 0 ? (
        <Box component="span" sx={{ color: componentTheme.fgMuted }}>
          {shown.slice(0, at)}
        </Box>
      ) : null}
      <Box component="span" sx={muted ? undefined : { color: componentTheme.fgDefault }}>
        {shown.slice(at)}
      </Box>
    </Box>
  );
}

/** How many characters a key fits beside its indent, or null before the column is measured. */
function keyBudget(keyWidth: number | null, indentPx: number, advancePx: number, reservedPx: number): number | null {
  if (keyWidth === null) return null;
  return Math.max(6, Math.floor((keyWidth - indentPx - KEY_PADDING_RIGHT_PX - reservedPx) / advancePx));
}

/**
 * Which end of a head line to cut, so what tells the columns apart stays: a
 * line whose values share a longer start than end (`checkout-prod-us-east`,
 * `checkout-prod-us-west`) is cut on the left.
 */
function cutSide(values: readonly string[]): 'start' | 'end' {
  const distinct = [...new Set(values)];
  if (distinct.length < 2) return 'end';
  const shortest = Math.min(...distinct.map((v) => v.length));
  let prefix = 0;
  while (prefix < shortest && distinct.every((v) => v[prefix] === distinct[0][prefix])) prefix += 1;
  let suffix = 0;
  while (suffix < shortest && distinct.every((v) => v[v.length - 1 - suffix] === distinct[0][distinct[0].length - 1 - suffix])) suffix += 1;
  return prefix > suffix ? 'start' : 'end';
}

function HeadLine({ text, side, sx }: { text: string; side: 'start' | 'end'; sx: object }): ReactElement {
  return side === 'start' ? (
    <Box component="span" sx={{ ...sx, ...LEFT_CUT_SX, display: 'block' }}>
      {'\u200E'}
      {text}
      {'\u200E'}
    </Box>
  ) : (
    <Box component="span" sx={{ ...sx, display: 'block' }}>
      {text}
    </Box>
  );
}

/**
 * The fold chevron every collapse toggle in the compare surface uses —
 * exported so `ComponentCompareSection`'s unit-header toggle draws the exact
 * same glyph, rotation and transition rather than a hand-copied twin that can
 * drift from this one.
 */
export function FoldChevron({ open }: { open: boolean }): ReactElement {
  return (
    <Box
      component="span"
      sx={{
        display: 'inline-flex',
        color: componentTheme.fgSubtle,
        flex: 'none',
        marginRight: '2px',
        transform: open ? 'rotate(90deg)' : 'none',
      }}
    >
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" style={{ width: 10, height: 10 }} aria-hidden>
        <path d="M6 3.5 10.5 8 6 12.5" />
      </svg>
    </Box>
  );
}

interface CompareColumnHeadProps {
  column: CompareColumnInput;
  index: number;
  /** This document group's drag scope, or `undefined` when the grid is mounted without a `CompareColumnDnd` wrapper. */
  scope: string | undefined;
  /** Which end of each head line to cut, in the page layout. */
  cuts?: { primary: 'start' | 'end'; secondary: 'start' | 'end' };
}

/**
 * One column head — a plain header when `scope` is absent, a drag source AND
 * drop target when it is present. See `CompareColumnDnd.tsx` for the wrapper
 * this needs to actually swap columns on drop.
 */
function CompareColumnHead({ column, index, scope, cuts }: CompareColumnHeadProps): ReactElement {
  const { setNodeRef, listeners, attributes } = useCompareColumnDrag(column.deploymentId, scope);
  const page = useComparePageLayout();
  const letter = column.letter ?? letterFor(index);
  const heading = page ? column.heading : undefined;
  return (
    <Box
      ref={setNodeRef}
      data-testid={`compare-column-${letter.toLowerCase()}`}
      data-compare-col={column.deploymentId}
      data-compare-surface="grid"
      title={
        heading
          ? `${heading.primary} · ${heading.secondary}`
          : column.displayName
            ? `${column.label} — ${column.displayName}`
            : column.label
      }
      {...(scope ? attributes : undefined)}
      {...(scope ? listeners : undefined)}
      role="columnheader"
      aria-roledescription={scope ? 'column; drag to swap' : undefined}
      sx={{
        ...(page ? PAGE_HEAD_CELL_SX : HEAD_CELL_SX),
        ...(scope
          ? {
              cursor: 'grab',
              '&:focus-visible': { outline: `2px solid ${componentTheme.accent}`, outlineOffset: '-2px' },
            }
          : null),
      }}
    >
      <Box component="span" sx={LETTER_SX}>{letter}</Box>
      {heading ? (
        <Box component="span" sx={{ minWidth: 0, flex: 1 }}>
          <HeadLine text={heading.primary} side={cuts?.primary ?? 'end'} sx={PAGE_HEAD_PRIMARY_SX} />
          <HeadLine text={heading.secondary} side={cuts?.secondary ?? 'end'} sx={PAGE_HEAD_SECONDARY_SX} />
        </Box>
      ) : (
        <Box component="span" sx={page ? PAGE_HEAD_WHO_SX : HEAD_WHO_SX}>{column.label}</Box>
      )}
    </Box>
  );
}

function CompareGridInner({
  columns,
  rows: givenRows,
  stagedEdits,
  unitSlug,
  onStageEdit,
  forceExpanded,
  dndScope,
}: CompareGridProps): ReactElement {
  const page = useComparePageLayout();
  const rows = useMemo(() => (page ? mergeSingleChildFolders(givenRows) : givenRows), [page, givenRows]);
  const headCellSx = page ? PAGE_HEAD_CELL_SX : HEAD_CELL_SX;
  const keyTrackSx = page ? PAGE_KEY_TRACK_SX : KEY_TRACK_SX;
  const keyCellSx = page ? PAGE_KEY_CELL_SX : KEY_CELL_SX;
  const valueCellSx = page ? PAGE_VALUE_CELL_SX : VALUE_CELL_SX;
  const rowSx = page ? PAGE_ROW_SX : ROW_SX;
  const indentBase = page ? PAGE_INDENT_BASE_PX : INDENT_BASE_PX;
  const indentStep = page ? PAGE_INDENT_PX : INDENT_PX;
  const headCuts = useMemo(
    () =>
      page
        ? {
            primary: cutSide(columns.map((c) => c.heading?.primary ?? '')),
            secondary: cutSide(columns.map((c) => c.heading?.secondary ?? '')),
          }
        : undefined,
    [page, columns],
  );

  // The page layout's key column grows with the page; its width says how much of a path fits.
  const [keyWidth, setKeyWidth] = useState<number | null>(null);
  const keyObserver = useRef<ResizeObserver | null>(null);
  const measureKeyColumn = useCallback(
    (el: HTMLElement | null) => {
      keyObserver.current?.disconnect();
      keyObserver.current = null;
      if (!el || !page) return;
      // Whole pixels: a sub-pixel change during a window drag would re-render every row for nothing.
      const observer = new ResizeObserver(() => setKeyWidth(Math.round(el.getBoundingClientRect().width)));
      observer.observe(el);
      keyObserver.current = observer;
    },
    [page],
  );
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => new Set<string>());
  /** Which cell is open for editing — `identityPath` and column index. */
  const [editing, setEditing] = useState<{ path: string; column: number } | null>(null);

  const beginEdit = useCallback((path: string, column: number) => {
    setEditing({ path, column });
  }, []);

  const unstage = useCallback(
    (row: CompareLeafRow, index: number) => {
      const target = row.editTargets[index];
      if (!target || !onStageEdit || !unitSlug) return;
      // Unchecking discards the pending change, as unchecking a manual edit does
      // in the shipped tree. Restoring the value it had is what removes it from
      // the staged map.
      onStageEdit({
        deploymentId: target.deploymentId,
        unitSlug,
        identityPath: row.identityPath,
        positionalPath: target.positionalPath,
        resource: target.resource,
        before: row.cells[index]?.literal,
        after: row.cells[index]?.literal ?? '',
      });
    },
    [onStageEdit, unitSlug],
  );

  const commitEdit = useCallback(
    (row: CompareLeafRow, index: number, next: string) => {
      setEditing(null);
      const target = row.editTargets[index];
      const before = row.cells[index]?.literal;
      if (!target || !onStageEdit || !unitSlug) return;
      // Typing the value back the way it was is not a change.
      if (before !== undefined && next === before) return;
      onStageEdit({
        deploymentId: target.deploymentId,
        unitSlug,
        identityPath: row.identityPath,
        positionalPath: target.positionalPath,
        resource: target.resource,
        before,
        after: next,
      });
    },
    [onStageEdit, unitSlug],
  );

  const toggleFolder = useCallback((identityPath: string) => {
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(identityPath)) next.delete(identityPath);
      else next.add(identityPath);
      return next;
    });
  }, []);

  /**
   * Hide everything under a collapsed folder — its whole subtree, at any depth,
   * not just its immediate leaves.
   */
  /**
   * For each collapsed folder, how many fields differ under it, per column.
   *
   * WHY A COLLAPSED FOLDER MUST NOT SHOW BLANKS. Expanded, empty value cells are
   * correct — the folder has no value of its own. Collapsed, the same blanks sit
   * beside a row the user cannot see into, and read as data that failed to load.
   * That is the same confusion as the stuck "loading" and the false "all fields
   * agree": fine in the model, misleading on screen.
   *
   * Counted once per rows-and-columns change rather than per row, so a large
   * unit does not walk its subtree on every render.
   */
  const subtreeCounts = useMemo(() => {
    const counts = new Map<string, number[]>();
    rows.forEach((row, index) => {
      if (row.type !== 'folder') return;
      const tally = new Array<number>(columns.length).fill(0);
      for (let j = index + 1; j < rows.length; j += 1) {
        const next = rows[j];
        if (!next || next.depth <= row.depth) break;
        if (next.type !== 'leaf') continue;
        // Two conditions, and both are needed. The ROW must be one that
        // differs, and this COLUMN must be one of the reasons — a column
        // agreeing with the others inside a disagreeing row has nothing to
        // report, and saying otherwise would inflate every count.
        // `continue`, NOT `return`: this is a for-loop inside a forEach callback,
        // and returning would abandon the whole folder — skipping `counts.set`
        // and leaving it with no badge at all rather than a smaller one.
        if (!rowDiffers(next.cells)) continue;
        next.cells.forEach((cell, column) => {
          if (cell.kind === 'differs' || cell.kind === 'absent') {
            tally[column] = (tally[column] ?? 0) + 1;
          }
        });
      }
      counts.set(row.identityPath, tally);
    });
    return counts;
  }, [rows, columns.length]);

  const visible = useMemo(() => {
    const out: CompareRow[] = [];
    let hiddenBelow: number | null = null;
    for (const row of rows) {
      if (hiddenBelow !== null && row.depth > hiddenBelow) continue;
      hiddenBelow = null;
      out.push(row);
      if (row.type === 'folder' && collapsed.has(row.identityPath) && !forceExpanded?.has(row.identityPath)) {
        hiddenBelow = row.depth;
      }
    }
    return out;
  }, [rows, collapsed, forceExpanded]);

  return (
    <Box sx={GRID_SX} data-testid="compare-grid">
      <Box sx={page ? PAGE_HEAD_SX : HEAD_SX} role="row">
        <Box ref={measureKeyColumn} sx={{ ...headCellSx, ...keyTrackSx, borderLeft: 0, position: 'sticky', left: 0, zIndex: 7 }} />
        {columns.map((column, index) => (
          <CompareColumnHead
            key={column.deploymentId}
            column={column}
            index={index}
            scope={dndScope}
            cuts={headCuts}
          />
        ))}
      </Box>

      {visible.map((row) => {
        if (row.type === 'folder') {
          const open = !collapsed.has(row.identityPath) || (forceExpanded?.has(row.identityPath) ?? false);
          return (
            <Box key={`folder:${row.identityPath}`} sx={rowSx} role="row" data-testid="compare-folder-row">
              <Box
                component="button"
                type="button"
                aria-expanded={open}
                onClick={() => toggleFolder(row.identityPath)}
                sx={{
                  // First, so it resets the <button>'s UA font without also
                  // resetting the size and family set below. After them, the
                  // shorthand wins and the label renders at the inherited size.
                  font: 'inherit',
                  ...keyCellSx,
                  // Explicit because this cell alone is a <button>, and a cell
                  // on a shared track may not bring a box of its own — its UA
                  // border-box is the reason this was the only correct column
                  // back when every other cell was content-box. The vertical
                  // padding is reset for the same reason, not for a measured
                  // symptom: the row's 22px minimum currently absorbs it, so
                  // this keeps a UA default from deciding the row's height if
                  // the content ever grows past that minimum.
                  boxSizing: 'border-box',
                  paddingTop: 0,
                  paddingBottom: 0,
                  paddingLeft: `${indentBase + row.depth * indentStep}px`,
                  color: componentTheme.fgMuted,
                  fontSize: FOLDER_FONT_PX,
                  border: 0,
                  background: 'inherit',
                  textAlign: 'left',
                  cursor: 'pointer',
                  '&:focus-visible': { outline: `2px solid ${componentTheme.accent}`, outlineOffset: '-2px' },
                }}
              >
                <FoldChevron open={open} />
                {page ? (
                  <CutPath
                    path={row.label}
                    title={row.identityPath}
                    budget={keyBudget(keyWidth, indentBase + row.depth * indentStep, MONO_ADVANCE_PX, FOLD_CHEVRON_PX)}
                    muted
                  />
                ) : (
                  <Box
                    component="span"
                    title={row.label}
                    sx={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', fontFamily: componentTheme.fontMono }}
                  >
                    {elideFolderLabel(row.label, folderLabelBudget(row.depth))}
                  </Box>
                )}
              </Box>
              {columns.map((column, index) => {
                const differing = open ? 0 : (subtreeCounts.get(row.identityPath)?.[index] ?? 0);
                return (
                  <Box
                    key={column.deploymentId}
                    data-compare-col={column.deploymentId}
                    data-compare-surface="grid"
                    sx={valueCellSx}
                  >
                    {differing > 0 ? (
                      <Box
                        component="span"
                        data-testid="compare-folder-count"
                        title={`${differing} ${differing === 1 ? 'field differs' : 'fields differ'} under ${row.label} in ${column.label}`}
                        sx={{
                          fontFamily: componentTheme.fontMono,
                          fontSize: 10,
                          fontWeight: 600,
                          color: componentTheme.variationEmphasis,
                        }}
                      >
                        {`${differing}F`}
                      </Box>
                    ) : null}
                  </Box>
                );
              })}
            </Box>
          );
        }

        const rowStaged = unitSlug
          ? columns
              .map((column) => stagedEdits?.get(editKey(column.deploymentId, unitSlug, row.identityPath)))
              .find((edit) => edit !== undefined)
          : undefined;
        return (
          <Box
            key={`leaf:${row.folderPath}:${row.identityPath}`}
            sx={{
              ...rowSx,
              background: rowStaged
                ? COMPARE_STAGED_TOKENS[stagedKind(rowStaged)].tint
                : componentTheme.bgSubtle,
            }}
            role="row"
            data-testid="compare-leaf-row"
            data-identity-path={row.identityPath}
            data-positional={row.isPositional ? 'true' : 'false'}
            data-staged={rowStaged ? stagedKind(rowStaged) : undefined}
          >
            {rowStaged ? (
              <Box
                data-testid="compare-staged-bar"
                sx={{ ...STAGED_BAR_SX, background: COMPARE_STAGED_TOKENS[stagedKind(rowStaged)].fill }}
              />
            ) : null}
            <Box
              data-testid="compare-key-cell"
              sx={{
                ...keyCellSx,
                paddingLeft: `${indentBase + row.depth * indentStep}px`,
              }}
            >
              {page ? (
                <CutPath
                  path={row.leafKey}
                  title={row.identityPath}
                  budget={keyBudget(
                    keyWidth,
                    indentBase + row.depth * indentStep,
                    KEY_ADVANCE_PX,
                    row.isPositional ? POSITIONAL_MARK_PX : 0,
                  )}
                />
              ) : (
                <Box
                  component="span"
                  title={row.identityPath}
                  sx={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}
                >
                  {row.leafKey}
                </Box>
              )}
              {row.isPositional ? (
                <Box
                  component="span"
                  title="This list gives its elements no identity, so they could only be lined up by position. A reordered list would compare unrelated elements."
                  sx={{
                    marginLeft: '4px',
                    flex: 'none',
                    fontFamily: componentTheme.fontSans,
                    fontSize: 9.5,
                    fontWeight: 700,
                    color: componentTheme.attention,
                  }}
                >
                  by position
                </Box>
              ) : null}
            </Box>
            {row.cells.map((cell, index) => {
              const blockReason = editBlockReason(row, index);
              const canEdit = onStageEdit !== undefined && unitSlug !== undefined && !blockReason;
              const staged = stagedEdits?.get(
                editKey(columns[index]?.deploymentId ?? '', unitSlug ?? '', row.identityPath),
              );
              const isEditing = editing?.path === row.identityPath && editing.column === index;
              return (
                <Box
                  key={columns[index]?.deploymentId ?? index}
                  data-column={index}
                  data-compare-col={columns[index]?.deploymentId}
                  data-compare-surface="grid"
                  onClick={canEdit ? () => beginEdit(row.identityPath, index) : undefined}
                  sx={valueCellSx}
                >
                  <CompareCell
                    cell={cell}
                    unavailable={columns[index]?.unavailable}
                    columnLabel={columns[index]?.label ?? columns[index]?.letter ?? letterFor(index)}
                    staged={staged ? { kind: stagedKind(staged), after: staged.after } : undefined}
                    blockReason={blockReason}
                    editable={canEdit}
                  />
                  {staged && !isEditing ? (
                    <Box
                      component="button"
                      type="button"
                      data-testid="compare-staged-checkbox"
                      aria-label={`Discard the staged change to ${columns[index]?.label ?? ''} ${row.leafKey}`}
                      title="Staged for the next apply. Click to discard it."
                      onClick={(event) => {
                        event.stopPropagation();
                        unstage(row, index);
                      }}
                      sx={{
                        ...STAGED_CHECKBOX_SX,
                        background: COMPARE_STAGED_TOKENS[stagedKind(staged)].fill,
                      }}
                    >
                      <svg viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 7, height: 7 }} aria-hidden>
                        <path d="M1.5 5.2 4 7.5 8.5 2.5" />
                      </svg>
                    </Box>
                  ) : null}
                  {isEditing ? (
                    <CompareValueEditor
                      initialValue={staged?.after ?? cell.literal ?? ''}
                      label={`${columns[index]?.label ?? columns[index]?.letter ?? letterFor(index)} ${row.leafKey}`}
                      // The last two columns would push an editor past the pane,
                      // so theirs opens leftward instead.
                      alignEnd={index >= columns.length - 2}
                      onCommit={(next) => commitEdit(row, index, next)}
                      onCancel={() => setEditing(null)}
                    />
                  ) : null}
                </Box>
              );
            })}
          </Box>
        );
      })}
    </Box>
  );
}

export const CompareGrid = memo(CompareGridInner);
