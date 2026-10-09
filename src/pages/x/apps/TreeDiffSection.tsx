// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { Fragment, memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';

import Box from '@mui/material/Box';
import Tooltip from '@mui/material/Tooltip';

import { highlightText } from '@/components/entity-data-grid/utils/highlightText';

import { componentTheme } from './componentTheme';
import type { DiffTreeNode } from './diffTree';
import { buildContextTree, buildDiffTree, injectKeyContext, measureTruncation, VALUE_PLACEHOLDER } from './diffTree';
import { SECTION_LABEL_COLORS, VAL_COMPONENTS } from './diffConstants';
import { getInlineDiffPair, type InlineDiffPair, type InlineDiffSegment } from './inlineDiff';
import {
  AfterCell,
  BeforeCell,
  DiffColumnDivider,
  OldValue,
  PathValue,
  PropertyCell,
  ReviewRow,
  SectionLabel,
  SrOnly,
} from './diffStyles';

const INDENT_PX = 12;

/** Marks a leaf row's key cell, so the section can size the key column to the widest one. */
const KEY_CELL_CLASS = 'tree-diff-key';

/**
 * The widest key cell's natural width in px, or null when no leaf is visible.
 * Every cell is set to `max-content` before any is read, so the layout is
 * computed once and not once per cell.
 */
function measureKeyColumn(container: HTMLElement): number | null {
  const cells = Array.from(container.getElementsByClassName(KEY_CELL_CLASS)) as HTMLElement[];
  if (cells.length === 0) return null;
  for (const cell of cells) cell.style.width = 'max-content';
  let widest = 0;
  for (const cell of cells) widest = Math.max(widest, cell.getBoundingClientRect().width);
  for (const cell of cells) cell.style.width = '';
  return Math.ceil(widest);
}

/**
 * Changed-token treatment per column: a subtle tint plus a hairline, mirroring the
 * staged-preview pill in ComponentValuesSection. The token TEXT colour is inherited
 * from the enclosing OldValue/NewValue span, so removals stay red and additions
 * stay green without restating either hue here.
 *
 * `display: inline` is load-bearing: the cell relies on `white-space` +
 * `text-overflow` on its parent Box for truncation and on `measureTruncation` to
 * decide whether to wrap, and an inline-block token would break both.
 *
 * Both these and {@link TOKEN_KEPT_SX} are module constants so that every token
 * span in every row shares one style object — a fresh `sx` per token would make
 * the style engine re-serialise the whole tree on each row render.
 */
const TOKEN_CHANGED_SX = {
  old: {
    display: 'inline',
    fontWeight: 700,
    background: 'rgba(154,0,5,0.10)',
    border: '1px solid rgba(154,0,5,0.28)',
    borderRadius: '3px',
    padding: '0 2px',
    WebkitBoxDecorationBreak: 'clone',
    boxDecorationBreak: 'clone',
  },
  new: {
    display: 'inline',
    fontWeight: 700,
    background: 'rgba(21,128,61,0.12)',
    border: '1px solid rgba(21,128,61,0.30)',
    borderRadius: '3px',
    padding: '0 2px',
    WebkitBoxDecorationBreak: 'clone',
    boxDecorationBreak: 'clone',
  },
} as const;

/** Tokens the two values share, dimmed so the changed ones carry the colour. */
const TOKEN_KEPT_SX = { display: 'inline', color: componentTheme.fgMuted } as const;

/**
 * A cell holding a block of text keeps its line breaks, and so is never truncated to
 * one line: there is no single line to truncate to.
 */
const PREFORMATTED_CELL_SX = { whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' } as const;

/**
 * The text of one side-by-side value cell.
 *
 * Memoised because its props are reference-stable — the segment arrays come from
 * the inline-diff cache — while its parent row re-renders on every hover and every
 * wrap measurement.
 */
const DiffCellValue = memo(({ value, segments, tone, filterText, preformatted = false }: { value: string; segments?: InlineDiffSegment[]; tone: 'old' | 'new'; filterText: string; preformatted?: boolean }): ReactNode => {
  if (segments) {
    return (
      <>
        {segments.map((seg, i) => {
          if (!seg.changed) return <Box key={i} component="span" sx={TOKEN_KEPT_SX}>{seg.text}</Box>;
          // A box that spans a line break is drawn once per line it touches, the
          // empty end of the line before included. Boxing each line's own text keeps
          // the highlight on the characters that changed.
          if (preformatted && seg.text.includes('\n')) {
            return (
              <Fragment key={i}>
                {seg.text.split('\n').map((line, j) => (
                  <Fragment key={j}>
                    {j > 0 && '\n'}
                    {line && <Box component="span" sx={TOKEN_CHANGED_SX[tone]}>{line}</Box>}
                  </Fragment>
                ))}
              </Fragment>
            );
          }
          return <Box key={i} component="span" sx={TOKEN_CHANGED_SX[tone]}>{seg.text}</Box>;
        })}
      </>
    );
  }
  if (filterText) return <>{highlightText(value, filterText)}</>;
  return <>{value}</>;
});

DiffCellValue.displayName = 'DiffCellValue';

/**
 * Opt-in DOM hooks.
 *
 * When `domHooks` is undefined — the default, and what every pre-existing caller
 * passes — the rendered DOM is unchanged, attribute for attribute: every use
 * site below is guarded on the object being present.
 *
 * It exists so a caller that needs to address the tree's cells (a test, or an
 * assistive-technology affordance the shared tree cannot infer) can do so
 * without forking the renderer.
 */
export interface TreeDiffDomHooks {
  /** Stem for `data-testid` attributes on value cells, folder rows and chevrons. */
  testIdPrefix: string;
  /**
   * Visually-hidden prefixes rendered INSIDE the old/new value spans, so the
   * before/after distinction is not carried by colour alone.
   */
  srValuePrefix?: { old: string; new: string };
}

interface TreeDiffSectionProps {
  entry: { unitId: string; fieldDiffs: { path: string; oldValue: string; newValue: string }[] };
  allPaths?: { path: string; value: string }[];
  keyPrefix: string;
  label: string;
  variant?: 'upgrade' | 'apply' | 'gated' | 'variation' | 'data';
  filterText?: string;
  variantOverrides?: Map<string, ('upgrade' | 'apply' | 'gated' | 'variation')[]>;
  hideLabel?: boolean;
  /** When true, renders path + value only (no before column, no color). Used for single-revision view. */
  viewOnly?: boolean;
  /** When true, renders all paths from allPaths as context tree (changed highlighted, unchanged dimmed).
   *  Requires allPaths to be provided. */
  showAllContext?: boolean;
  columnStyle: CSSProperties;
  onDividerMouseDown: (columnIndex: 0 | 1, e: React.MouseEvent) => void;
  isDragging?: boolean;
  /** See {@link TreeDiffDomHooks}. Omit for today's exact DOM. */
  domHooks?: TreeDiffDomHooks;
  /**
   * A tree the caller built itself, rendered as given. For paths that cannot be
   * rebuilt by splitting `fieldDiffs` on dots, such as a server-computed diff whose
   * array elements are named by merge key. `entry.fieldDiffs`, `allPaths` and
   * `filterText` are not consulted.
   */
  tree?: DiffTreeNode[];
}

const ChevronRightIcon = () => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: 10, height: 10 }}>
    <path d="M6 4l4 4-4 4" />
  </svg>
);

/** Count visible rows (leaves + folders) in tree order. */
function countRows(nodes: DiffTreeNode[]): number {
  let count = 0;
  for (const node of nodes) {
    count += 1;
    if (node.children) count += countRows(node.children);
  }
  return count;
}

function hasChangedDescendant(node: DiffTreeNode): boolean {
  if (node.type === 'leaf') return !node.context;
  return (node.children ?? []).some(hasChangedDescendant);
}

/** Recursively renders a diff tree node with 3-column layout. */
const TreeNodeRow = memo(({ node, depth, variant, filterText = '', pathPrefix = '', variantOverrides, rowIndex = 0, columnStyle, allPaths, changedPaths, changedDiffs, viewOnly = false, domHooks }: { node: DiffTreeNode; depth: number; variant: 'upgrade' | 'apply' | 'gated' | 'variation' | 'data'; filterText?: string; pathPrefix?: string; variantOverrides?: Map<string, ('upgrade' | 'apply' | 'gated' | 'variation')[]>; rowIndex?: number; columnStyle: CSSProperties; allPaths?: { path: string; value: string }[]; changedPaths?: Set<string>; changedDiffs?: Map<string, { oldValue: string; newValue: string }>; viewOnly?: boolean; domHooks?: TreeDiffDomHooks }): ReactNode => {
  const [expanded, setExpanded] = useState(() => hasChangedDescendant(node));
  const toggle = useCallback(() => setExpanded((prev) => !prev), []);
  const fullPath = pathPrefix ? `${pathPrefix}.${node.key}` : node.key;
  const striped = rowIndex % 2 === 1;

  // Wrap detection state (used for leaf nodes only, but hooks must be unconditional)
  const [autoWrap, setAutoWrap] = useState(false);
  const [hovered, setHovered] = useState(false);
  const cellRefs = useRef<(HTMLDivElement | null)[]>([null, null]);
  const rowRef = useRef<HTMLDivElement>(null);

  const setCellRef0 = useCallback((el: HTMLDivElement | null) => { cellRefs.current[0] = el; }, []);
  const setCellRef1 = useCallback((el: HTMLDivElement | null) => { cellRefs.current[1] = el; }, []);

  const isLeaf = node.type === 'leaf' && node.diff != null;
  const wrap = isLeaf && (autoWrap || hovered);
  const preformatted = isLeaf && !!node.preformatted;

  const col1 = (columnStyle as Record<string, string>)['--col1-width'] ?? '40%';
  const col2 = (columnStyle as Record<string, string>)['--col2-width'] ?? '28%';
  const keyCol = (columnStyle as Record<string, string>)['--key-col-width'];

  useLayoutEffect(() => {
    if (!isLeaf) return;
    setAutoWrap(measureTruncation(cellRefs.current));
  }, [isLeaf, node.diff?.oldValue, node.diff?.newValue, node.key, col1, col2, keyCol]);

  useEffect(() => {
    if (!isLeaf) return;
    const row = rowRef.current;
    if (!row) return;
    const observer = new ResizeObserver(() => {
      setAutoWrap(measureTruncation(cellRefs.current));
    });
    observer.observe(row);
    return () => observer.disconnect();
  }, [isLeaf]);

  /**
   * Which characters inside the value changed, for the red/green columns.
   *
   * Null — meaning "render the value flat, as before" — whenever there is nothing
   * to compare or something else already owns the text: an active filter (search
   * highlighting wins), a dimmed context row, the single-value viewOnly mode, an
   * added or removed path where one side is only a placeholder, a pair too long to
   * align (whose whole-value segments would render as a wall of per-line boxes), and
   * a pair whose tokens are all shared (dimming every token would signal a change
   * that isn't there), and a pair the tree's builder marked as compared whole.
   */
  const inlineDiff: InlineDiffPair | null = useMemo(() => {
    if (viewOnly || node.context || node.wholeValues || filterText) return null;
    if (!node.diff) return null;
    if (node.diff.oldValue === VALUE_PLACEHOLDER || node.diff.newValue === VALUE_PLACEHOLDER) return null;
    const pair = getInlineDiffPair(node.diff.oldValue, node.diff.newValue);
    if (pair.truncated) return null;
    if (!pair.old.some((s) => s.changed) && !pair.new.some((s) => s.changed)) return null;
    return pair;
  }, [viewOnly, node.context, node.wholeValues, node.diff, filterText]);

  // Context expansion state for folder nodes (which segment is expanded)
  const [expandedSegment, setExpandedSegment] = useState<number | null>(null);

  const segments = useMemo(() => node.key.split('.'), [node.key]);

  const contextPrefix = useMemo(() => {
    if (expandedSegment === null) return null;
    const selectedSegments = segments.slice(0, expandedSegment + 1);
    return pathPrefix ? pathPrefix + '.' + selectedSegments.join('.') : selectedSegments.join('.');
  }, [expandedSegment, segments, pathPrefix]);

  const contextTree = useMemo(
    () => contextPrefix && allPaths && changedPaths
      ? buildContextTree(contextPrefix, allPaths, changedPaths, changedDiffs)
      : null,
    [contextPrefix, allPaths, changedPaths, changedDiffs],
  );

  // --- Leaf rendering ---

  if (isLeaf && node.diff) {
    // Context leaf: dimmed, single value in after column
    if (node.context) {
      return (
        <ReviewRow $striped={striped} $plain sx={{ alignItems: 'center', minHeight: 22, py: '1px', opacity: 0.45 }}>
          <PropertyCell
            className={KEY_CELL_CLASS}
            sx={{ display: 'flex', alignItems: 'center', gap: 0, paddingLeft: `${16 + depth * INDENT_PX}px`, fontSize: 12, fontFamily: componentTheme.fontMono, color: componentTheme.fgSubtle }}
          >
            <Box component="span" sx={{ width: 10, flexShrink: 0 }} />
            <PathValue style={{ color: componentTheme.fgSubtle, minWidth: 0, overflowWrap: 'break-word' }}>{node.key}</PathValue>
          </PropertyCell>
          <BeforeCell />
          <AfterCell sx={{ fontSize: 12, fontFamily: componentTheme.fontMono }}>
            <Box
              {...(domHooks ? { 'data-testid': `${domHooks.testIdPrefix}-context-value` } : {})}
              sx={{ overflow: 'hidden', minWidth: 0, whiteSpace: 'nowrap', textOverflow: 'ellipsis', color: componentTheme.fgSubtle }}
            >
              {node.diff.newValue}
            </Box>
          </AfterCell>
        </ReviewRow>
      );
    }

    if (viewOnly) {
      return (
        <ReviewRow $striped={striped} $plain sx={{ alignItems: 'center' }}>
          <PropertyCell
            className={KEY_CELL_CLASS}
            sx={{ display: 'flex', alignItems: 'center', gap: 0, paddingLeft: `${16 + depth * INDENT_PX}px`, fontSize: 12, fontFamily: componentTheme.fontMono }}
          >
            <Box component="span" sx={{ width: 10, flexShrink: 0 }} />
            <PathValue style={{ color: componentTheme.fgDefault, fontWeight: 600, minWidth: 0, overflowWrap: 'break-word' }}>
              {filterText ? highlightText(node.key, filterText) : node.key}
            </PathValue>
          </PropertyCell>
          <AfterCell sx={{ fontSize: 12, fontFamily: componentTheme.fontMono, color: componentTheme.fgDefault }}>
            <Box sx={{ overflow: 'hidden', minWidth: 0, whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
              {filterText ? highlightText(node.diff.newValue, filterText) : node.diff.newValue}
            </Box>
          </AfterCell>
        </ReviewRow>
      );
    }

    const overrides = variantOverrides?.get(fullPath);
    const variants = overrides && overrides.length > 0 ? overrides : [variant === 'data' ? 'upgrade' as const : variant];

    return (
      <ReviewRow
        ref={rowRef}
        $striped={striped}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        sx={{ alignItems: autoWrap || preformatted ? 'flex-start' : 'center' }}
      >
        <PropertyCell
          className={KEY_CELL_CLASS}
          sx={{ display: 'flex', alignItems: 'center', gap: 0, paddingLeft: `${16 + depth * INDENT_PX}px`, fontSize: 12, fontFamily: componentTheme.fontMono, color: componentTheme.fgMuted }}
        >
          <Box component="span" sx={{ width: 10, flexShrink: 0 }} />
          <PathValue style={{ color: componentTheme.fgDefault, fontWeight: 600, minWidth: 0, overflowWrap: 'break-word' }}>{filterText ? highlightText(node.key, filterText) : node.key}</PathValue>
        </PropertyCell>
        <BeforeCell sx={{ fontSize: 12, fontFamily: componentTheme.fontMono }}>
          {overrides && overrides.length > 0 ? null : (
            <Box ref={setCellRef0} sx={{ overflow: 'hidden', minWidth: 0, ...(preformatted ? PREFORMATTED_CELL_SX : wrap ? { whiteSpace: 'normal', overflowWrap: 'break-word' } : { whiteSpace: 'nowrap', textOverflow: 'ellipsis' }) }}>
              <OldValue {...(domHooks ? { 'data-testid': `${domHooks.testIdPrefix}-old-value` } : {})}>
                {domHooks?.srValuePrefix && <SrOnly>{domHooks.srValuePrefix.old}</SrOnly>}
                <DiffCellValue value={node.diff.oldValue} segments={inlineDiff?.old} tone="old" filterText={filterText} preformatted={preformatted} />
              </OldValue>
            </Box>
          )}
        </BeforeCell>
        <AfterCell sx={{ display: 'flex', gap: '6px', fontSize: 12, fontFamily: componentTheme.fontMono }}>
          {variants.map((v, vi) => {
            const ValComp = VAL_COMPONENTS[v];
            return (
              <Box key={v} ref={vi === 0 ? setCellRef1 : undefined} sx={{ overflow: 'hidden', flex: 1, minWidth: 0, textAlign: 'left', ...(preformatted ? PREFORMATTED_CELL_SX : wrap ? { whiteSpace: 'normal', overflowWrap: 'break-word' } : { whiteSpace: 'nowrap', textOverflow: 'ellipsis' }) }}>
                <ValComp {...(domHooks ? { 'data-testid': `${domHooks.testIdPrefix}-new-value` } : {})}>
                  {domHooks?.srValuePrefix && <SrOnly>{domHooks.srValuePrefix.new}</SrOnly>}
                  <DiffCellValue value={node.diff!.newValue} segments={inlineDiff?.new} tone="new" filterText={filterText} preformatted={preformatted} />
                </ValComp>
              </Box>
            );
          })}
        </AfterCell>
      </ReviewRow>
    );
  }

  // --- Folder rendering ---

  const childIndices: number[] = [];
  const childNodes = contextTree ?? node.children ?? [];
  if (childNodes.length > 0) {
    let idx = rowIndex + 1;
    for (const child of childNodes) {
      childIndices.push(idx);
      idx += countRows([child]);
    }
  }

  const hasContext = !!allPaths && allPaths.length > 0;

  // Build the folder row label: either the remaining segments after the expanded one,
  // or the full key. When a segment is expanded, the folder label becomes the prefix
  // up to that segment.
  const folderLabel = expandedSegment !== null
    ? segments.slice(0, expandedSegment + 1).join('.')
    : node.key;

  // The remaining segments after the expanded one are now represented in the context tree,
  // so we don't show them in the folder label.

  return (
    <Box>
      <ReviewRow
        $striped={striped}
        $plain
        onClick={toggle}
        {...(domHooks
          ? {
              'data-testid': `${domHooks.testIdPrefix}-folder`,
              // Disclosure semantics. Guarded on `domHooks` so the pre-existing
              // callers keep byte-identical DOM; for callers that opt in, the
              // folder row is reachable by Tab, toggles on Enter/Space, and
              // announces its collapsed/expanded state.
              role: 'button',
              tabIndex: 0,
              'aria-expanded': expanded,
              onKeyDown: (e: React.KeyboardEvent) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  toggle();
                }
              },
            }
          : {})}
        sx={{
          alignItems: 'center',
          minHeight: 20,
          cursor: 'pointer',
          '&:hover': {
            background: componentTheme.bgInset,
            '& .seg-dot': { opacity: 0.8 },
            '& .seg-label': { textDecorationColor: `${componentTheme.borderMuted}` },
          },
          ...(domHooks && {
            '&:focus-visible': {
              outline: `2px solid ${componentTheme.accent}`,
              outlineOffset: '-2px',
            },
          }),
          ...(node.context && { opacity: 0.45 }),
        }}
      >
        <PropertyCell sx={{ width: 'auto', flexShrink: 1, display: 'flex', alignItems: 'center', gap: 0, paddingLeft: `${16 + depth * INDENT_PX}px`, fontSize: 11, fontFamily: componentTheme.fontMono, color: componentTheme.fgSubtle }}>
          <Box
            component="span"
            {...(domHooks ? { 'data-testid': `${domHooks.testIdPrefix}-chevron` } : {})}
            sx={{
              display: 'inline-flex',
              alignItems: 'center',
              transition: 'transform .15s',
              transform: expanded ? 'rotate(90deg)' : 'none',
              color: componentTheme.fgSubtle,
              flexShrink: 0,
              // The only unconditional change in this component: a 150ms
              // transform is exactly what `prefers-reduced-motion` is for, and
              // the rule is inert for anyone without the OS setting.
              '@media (prefers-reduced-motion: reduce)': { transition: 'none' },
            }}
          >
            <ChevronRightIcon />
          </Box>
          {hasContext && !node.context ? (
            // Render segments as individually clickable spans
            segments.map((seg, i) => {
              // Only show segments up to expandedSegment when context is active
              if (expandedSegment !== null && i > expandedSegment) return null;

              // Count extra context fields at this segment level
              const segPrefix = (pathPrefix ? pathPrefix + '.' : '') + segments.slice(0, i + 1).join('.');
              const segSearchPrefix = segPrefix + '.';
              const totalAtLevel = allPaths!.filter((e) => e.path.startsWith(segSearchPrefix)).length;
              const changedAtLevel = [...changedPaths!].filter((p) => p.startsWith(segSearchPrefix)).length;
              const extraCount = totalAtLevel - changedAtLevel;

              const segEl = (
                <Box
                  component="span"
                  className="seg-label"
                  onClick={(e: React.MouseEvent) => {
                    e.stopPropagation();
                    if (extraCount > 0) setExpandedSegment((prev) => prev === i ? null : i);
                  }}
                  sx={{
                    cursor: extraCount > 0 ? 'pointer' : 'default',
                    borderRadius: '2px',
                    px: '1px',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 0,
                    transition: 'background .1s, color .1s, text-decoration-color .15s',
                    textDecoration: 'underline',
                    textDecorationColor: 'transparent',
                    textUnderlineOffset: 2,
                    ...(expandedSegment === i && { textDecorationColor: `${componentTheme.variation} !important` }),
                    '& .seg-chevron': { width: 0, opacity: 0, transition: 'width .1s, opacity .1s' },
                    '&:hover': { color: componentTheme.fgDefault, ...(extraCount > 0 && { '& .seg-chevron': { width: 10, opacity: 0.6 } }) },
                  }}
                >
                  {filterText ? highlightText(seg, filterText) : seg}
                  <Box
                    component="span"
                    className="seg-chevron"
                    sx={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      overflow: 'hidden',
                      flexShrink: 0,
                      transform: expandedSegment === i ? 'rotate(90deg)' : 'rotate(0deg)',
                      transition: 'transform .15s',
                    }}
                  >
                    <ChevronRightIcon />
                  </Box>
                </Box>
              );

              return (
                <Fragment key={i}>
                  {i > 0 && <Box component="span" className="seg-dot" sx={{ color: componentTheme.fgSubtle, opacity: 0.4, mx: '1px', transition: 'opacity .15s, mx .15s', userSelect: 'none' }}>.</Box>}
                  <Tooltip
                    title={extraCount > 0 ? `show ${extraCount} more` : 'all fields visible'}
                    placement="top"
                    arrow
                    enterDelay={400}
                    slotProps={{
                      tooltip: { sx: { fontSize: 11, fontFamily: componentTheme.fontSans, py: 0.25, px: 0.75 } },
                    }}
                  >
                    {segEl}
                  </Tooltip>
                </Fragment>
              );
            })
          ) : (
            <PathValue>{filterText ? highlightText(folderLabel, filterText) : folderLabel}</PathValue>
          )}
        </PropertyCell>
      </ReviewRow>
      {expanded && childNodes.map((child, i) => (
        <TreeNodeRow
          key={child.key}
          node={child}
          depth={depth + 1}
          variant={variant}
          filterText={filterText}
          pathPrefix={contextPrefix ?? fullPath}
          variantOverrides={variantOverrides}
          rowIndex={childIndices[i]}
          columnStyle={columnStyle}
          allPaths={allPaths}
          changedPaths={changedPaths}
          changedDiffs={changedDiffs}
          viewOnly={viewOnly}
          domHooks={domHooks}
        />
      ))}
    </Box>
  );
});

TreeNodeRow.displayName = 'TreeNodeRow';

/** Renders a section of field diffs as a collapsible tree with 3-column layout. */
export const TreeDiffSection = memo(({ entry, allPaths, keyPrefix, label, variant = 'upgrade', filterText = '', variantOverrides, hideLabel = false, viewOnly = false, showAllContext = false, columnStyle, onDividerMouseDown, isDragging, domHooks, tree: suppliedTree }: TreeDiffSectionProps): ReactNode => {
  const changedPaths = useMemo(() => new Set(entry.fieldDiffs.map((d) => d.path)), [entry.fieldDiffs]);
  const changedDiffs = useMemo(() => {
    const m = new Map<string, { oldValue: string; newValue: string }>();
    for (const d of entry.fieldDiffs) m.set(d.path, { oldValue: d.oldValue, newValue: d.newValue });
    return m;
  }, [entry.fieldDiffs]);
  const lower = filterText.toLowerCase();
  const filteredDiffs = filterText
    ? entry.fieldDiffs.filter((d) =>
        d.path.toLowerCase().includes(lower) ||
        d.oldValue.toLowerCase().includes(lower) ||
        d.newValue.toLowerCase().includes(lower),
      )
    : entry.fieldDiffs;

  const tree = useMemo(() => {
    if (suppliedTree) return suppliedTree;
    if (showAllContext && allPaths) {
      return buildContextTree('', allPaths, changedPaths, changedDiffs);
    }
    const dt = buildDiffTree(filteredDiffs);
    if (!allPaths) return dt;
    return injectKeyContext(dt, allPaths);
  }, [suppliedTree, showAllContext, filteredDiffs, allPaths, changedPaths, changedDiffs]);

  const startIndices = useMemo(() => {
    const indices: number[] = [];
    let idx = 0;
    for (const node of tree) {
      indices.push(idx);
      idx += countRows([node]);
    }
    return indices;
  }, [tree]);

  /*
   * The key column takes only the width its keys need, so the value columns get
   * the rest. Capped at 40% of the row so one long key cannot squeeze the values.
   * Measured again whenever the container resizes, which an expanded or
   * collapsed folder also does.
   */
  const containerRef = useRef<HTMLDivElement>(null);
  const [keyWidth, setKeyWidth] = useState<number | null>(null);
  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const measure = () => setKeyWidth(measureKeyColumn(container));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(container);
    return () => observer.disconnect();
  }, [tree]);
  const sizedColumnStyle = useMemo(
    () => (keyWidth == null ? columnStyle : ({ ...columnStyle, '--key-col-width': `min(${keyWidth}px, 40%)` } as CSSProperties)),
    [columnStyle, keyWidth],
  );

  if (!suppliedTree && filterText && filteredDiffs.length === 0) return null;

  return (
    <>
      {!hideLabel && <SectionLabel sx={SECTION_LABEL_COLORS[variant]}>{label}</SectionLabel>}
      <Box ref={containerRef} data-diff-columns style={sizedColumnStyle} sx={{ position: 'relative' }}>
        {!viewOnly && <DiffColumnDivider $position="first" $dragging={isDragging} onMouseDown={(e) => onDividerMouseDown(0, e)} />}
        {!viewOnly && <DiffColumnDivider $position="second" $dragging={isDragging} onMouseDown={(e) => onDividerMouseDown(1, e)} />}
        {tree.map((node, i) => (
          <TreeNodeRow
            key={`${keyPrefix}-${entry.unitId}-${node.key}`}
            node={node}
            depth={0}
            variant={variant}
            filterText={filterText}
            variantOverrides={variantOverrides}
            rowIndex={startIndices[i]}
            columnStyle={sizedColumnStyle}
            allPaths={allPaths}
            changedPaths={changedPaths}
            changedDiffs={changedDiffs}
            viewOnly={viewOnly}
            domHooks={domHooks}
          />
        ))}
      </Box>
    </>
  );
});

TreeDiffSection.displayName = 'TreeDiffSection';
