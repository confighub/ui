// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { createContext, Fragment, memo, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import Box from '@mui/material/Box';
import Checkbox from '@mui/material/Checkbox';
import Divider from '@mui/material/Divider';
import InputBase from '@mui/material/InputBase';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Tooltip from '@mui/material/Tooltip';
import { highlightText } from '@/components/entity-data-grid/utils/highlightText';
import type { ResourceProtection } from '@confighub/rtk-query';
import { buildFieldPathMeta, deleteValueAtPath, parseUnitData, setValueAtPath } from './configParser';
import type { FieldEntry, FieldPathMeta } from './configParser';
import { buildGroupedPaths, buildPaths, countLogicalChanges, unionUpstreamOnlyPaths } from './entryBuilders';
import { componentTheme } from './componentTheme';
import { ABSENT, NO_VALUE_LABEL, isEmptyValue, isRemovalSentinel, isYamlToolchain } from './componentValues';
import type { MergedUnit, ComponentDeployment, VariationEntry } from './componentTypes';
import { buildContextTree, buildPrefixIndex, buildResourceGroupedTree, computeDocumentScopes, docStageKey, injectKeyContext, injectPendingFolders, MASSIVE_UNIT_THRESHOLD, stageKeyDocId, stageKeyPath, type DiffTreeNode, type DocumentIdentity, type DocumentScope, type PrefixIndex } from './diffTree';
import { AfterCell, PathValue, PropertyCell, ReviewRow, UpgradePreviewDimRow } from './diffStyles';
import { getInlineDiff, type InlineDiffSegment } from './inlineDiff';
import { InspectPanel } from './InspectPanel';
import { pathContainsArrayIndex } from './componentKeyUtils';
import { ComposerRow, type ComposingDescriptor } from './ComponentKeyComposer';

// ============================================================================
// UTILS
// ============================================================================

/**
 * Narrow the unit's per-document leaves to those the caller wants rendered.
 *
 * `visiblePaths` is always a subset of `allPaths` — the flat, DEDUPLICATED
 * bare-path list the filter/narrow logic works on. It is used purely as a
 * membership test here: values come from each document's OWN leaf, so a path that
 * exists in several documents (`apiVersion`, `kind`, ...) renders each document's
 * real value instead of the single merged last-write-wins one.
 *
 * Paths in `visiblePaths` with no structured leaf — upstream-only promotable rows
 * and just-committed deletes, which exist in `allPaths` but not in the unit's data
 * — are synthesised into the LAST document. That mirrors setValueAtPath, which
 * creates new keys in the last object-typed document, and it keeps a
 * single-document unit at exactly ONE group so it renders bare (unwrapped), as it
 * does today. `segments` is unused for tree shape, hence left empty.
 */
function selectGroupedEntries(
  groupedEntries: FieldEntry[],
  visiblePaths: { path: string; value: string }[],
): FieldEntry[] {
  const visible = new Set(visiblePaths.map((p) => p.path));
  const structured = groupedEntries.filter((e) => visible.has(e.path));

  const known = new Set(groupedEntries.map((e) => e.path));
  const lastResource = groupedEntries.length > 0
    ? groupedEntries[groupedEntries.length - 1].resource
    : undefined;
  const synthetic = visiblePaths
    .filter((p) => !known.has(p.path))
    .map((p): FieldEntry => ({ path: p.path, segments: [], value: p.value, resource: lastResource }));

  return synthetic.length > 0 ? [...structured, ...synthetic] : structured;
}

/**
 * Logical change count over a set of STAGE KEYS. Groups keys by their owning
 * document first, then counts logical changes within each document, so a bare path
 * staged in two documents counts as two — not one. For single-document units every
 * key is bare (docId undefined), so this collapses to a single `countLogicalChanges`
 * over the bare paths, identical to the pre-scoping count.
 */
function countLogicalChangesScoped(keys: Iterable<string>): number {
  const byDoc = new Map<string, string[]>();
  for (const k of keys) {
    const docId = stageKeyDocId(k) ?? '';
    const bare = stageKeyPath(k);
    const list = byDoc.get(docId);
    if (list) list.push(bare); else byDoc.set(docId, [bare]);
  }
  let total = 0;
  for (const paths of byDoc.values()) total += countLogicalChanges(paths);
  return total;
}

/** Stable default for NodeRowProps.isProtected / ComponentValuesSectionProps.isProtected
 *  when the caller hasn't wired real MutationSources-backed data yet — "unknown reads as
 *  unprotected" (Finding 2's safe default). A module-level constant so it never changes
 *  identity across renders. */
function isProtectedFallback(): boolean {
  return false;
}

/**
 * Group staged protection entries (stage key → target Protected value) into
 * the `ResourceProtection[]` shape `SetUnitProtection` expects — one entry per
 * resource, each carrying a `Protected` map of BARE path → target value.
 * Mirrors protectedPaths.ts's own resource-matching scheme: `fieldPathMeta`
 * (built from the unit's own current data, `buildFieldPathMeta`) supplies each
 * path's resource identity, and paths with no resource (a single-document
 * unit) group together under an empty `{}` Resource — matching
 * `buildProtectedPathLookup`'s "single entry answers for every path" rule for
 * the read side, so a write here is found by that same read path later. Every
 * key handed in must already be array-index-free (Finding 1's guard, applied
 * at the kebab item) — a positional array path stored here would be written
 * under a key format the merge engine's own lookup never produces or matches.
 */
function buildResourceProtectionPayload(
  staged: Map<string, boolean>,
  fieldPathMeta: Map<string, FieldPathMeta>,
): ResourceProtection[] {
  const byResource = new Map<string, ResourceProtection>();
  for (const [key, target] of staged) {
    const bare = stageKeyPath(key);
    const resource = fieldPathMeta.get(bare)?.resource;
    const resourceKey = JSON.stringify(resource ?? {});
    let entry = byResource.get(resourceKey);
    if (!entry) {
      entry = { Resource: resource, Protected: {} };
      byResource.set(resourceKey, entry);
    }
    (entry.Protected as Record<string, boolean>)[bare] = target;
  }
  return [...byResource.values()];
}

function formatRelativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diffMs / 1000);
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  const mo = Math.floor(d / 30);
  if (mo < 12) return `${mo}mo ago`;
  return `${Math.floor(mo / 12)}y ago`;
}


// ============================================================================
// STAGED-STATES VISUAL TOKENS
// ============================================================================
// Cohesive per-change-type colour system from the designer's "staged-states"
// spec (mockups/toggle-styles/staged-states.html). Each change type owns a hue;
// every control, the value treatment, the row tint, and the 2px left-edge accent
// bar all use that hue so a row is glance-scannable. The big fix vs. the prior
// implementation: the manual-EDIT revert/control is YELLOW (#ca8a04), never purple.

// ── UPGRADE (purple) ──
const UP_FILL = '#7c3aed';          // checkbox fill when staged
const UP_BAR = '#6d28d9';           // left-edge accent bar
const UP_TOK_TEXT = '#5b21b6';      // changed-char token text
const UP_TOK_BG = 'rgba(109,40,217,.12)';
const UP_TOK_BORDER = 'rgba(109,40,217,.28)';
const UP_BORDER = 'rgba(109,40,217,.22)';   // empty (unstaged) checkbox border
const UP_TINT = 'rgba(109,40,217,.045)';    // staged row tint
const UP_TINT_HOVER = 'rgba(109,40,217,.08)';

// ── MANUAL EDIT (yellow) ──
// The EDIT changed-char highlight MIRRORS the upgrade's char highlight exactly
// (same bg/border alphas, same bold colored text) — just swapped to the YELLOW
// palette — so a staged edit's inline diff displays identically to an upgrade's,
// differing only in hue. Clear gold-yellow (yellow-600 #ca8a04), NOT amber-brown.
const EDIT_CONTROL = '#ca8a04';     // checkbox fill when staged — gold-YELLOW (yellow-600)
const EDIT_BAR = '#ca8a04';         // left-edge accent bar
const EDIT_TOK_TEXT = '#a16207';    // changed-char token text (yellow-700, the readable text limit)
const EDIT_TOK_BG = 'rgba(234,179,8,.16)';    // yellow-500 tint behind changed chars
const EDIT_TOK_BORDER = 'rgba(234,179,8,.5)'; // yellow-500 border around changed chars
const EDIT_BORDER = 'rgba(234,179,8,.22)';  // empty (unchecked) checkbox border
const EDIT_TINT = 'rgba(234,179,8,.07)';    // staged row tint
const EDIT_TINT_HOVER = 'rgba(234,179,8,.12)';

// ── DELETE (red) ──
const DEL_FILL = '#dc2626';         // checkbox fill when staged
const DEL_BAR = '#dc2626';
const DEL_BORDER = 'rgba(220,38,38,.22)';
const DEL_TINT = 'rgba(220,38,38,.04)';
const DEL_TINT_HOVER = 'rgba(220,38,38,.075)';

// ── ADD (green) ──
const ADD_FILL = '#16a34a';         // checkbox fill when staged
const ADD_VAL_TEXT = '#15803d';
const ADD_BAR = '#16a34a';
const ADD_BORDER = 'rgba(22,163,74,.22)';
const ADD_TINT = 'rgba(22,163,74,.045)';
const ADD_TINT_HOVER = 'rgba(22,163,74,.08)';

// ── Neutral value colours ──
const VAL_MUTED = '#59636e';        // committed / blocked / unchanged-diff chars

// ── PROTECT / "kept on merge" (rust — componentTheme.accent) ──
// Lowest-precedence staged type: a row that ONLY has a staged protection change
// (no value edit/upgrade/delete/add) gets this tint + bar. Reuses the existing
// `accent` token (already the pane's action/selection rust) rather than inventing
// a new hue — this is the first place it drives a ROW_TYPE_TOKENS entry.
// PROT_TINT is a literal, not componentTheme.accentMuted: accentMuted
// (rgba(186,61,3,.055)) reads roughly half the visual weight of its sibling row
// tints (edit .07, upgrade .045 but paired with a bold border) at 460px/1x — this
// flat hex is matched to the same lightness band as UP_TINT/EDIT_TINT instead.
const PROT_BAR = componentTheme.accent;
const PROT_TINT = '#fdf2ec';
const PROT_TINT_HOVER = '#fbe6d7';

/** A staged leaf row resolves to exactly one change type, driving the cohesive
 *  colour of its control + tint + left bar. Mirrors StagedChangeType but is the
 *  RENDER-time discriminant (an unstaged-but-upgradable row has type undefined).
 *  'protect' is the lowest-precedence type — see the rowChangeType derivation
 *  below (upgrade > edit > delete > add > protect). */
type RowChangeType = 'upgrade' | 'edit' | 'delete' | 'add' | 'protect';

/** Per-type render tokens: control fill (checkbox) / control colour (revert glyph),
 *  the row tint + its hover, and the 2px left-edge accent bar colour. */
const ROW_TYPE_TOKENS: Record<RowChangeType, {
  fill: string;
  tint: string;
  tintHover: string;
  bar: string;
}> = {
  upgrade: { fill: UP_FILL, tint: UP_TINT, tintHover: UP_TINT_HOVER, bar: UP_BAR },
  edit: { fill: EDIT_CONTROL, tint: EDIT_TINT, tintHover: EDIT_TINT_HOVER, bar: EDIT_BAR },
  delete: { fill: DEL_FILL, tint: DEL_TINT, tintHover: DEL_TINT_HOVER, bar: DEL_BAR },
  add: { fill: ADD_FILL, tint: ADD_TINT, tintHover: ADD_TINT_HOVER, bar: ADD_BAR },
  protect: { fill: PROT_BAR, tint: PROT_TINT, tintHover: PROT_TINT_HOVER, bar: PROT_BAR },
};

// Shared hover timing: tooltip only opens after 0.5s dwell on the element.
// enterNextDelay forces a fresh dwell per pill so scanning the row never pops
// tooltips constantly.
const TOOLTIP_HOVER_DELAY = { enterDelay: 500, enterNextDelay: 500 } as const;

/**
 * Payload for committing a unit's STAGED upgrade picks (true-staging model).
 * - 'upgrade-all': every available upgrade for this unit is staged → the parent
 *   should use the wholesale `upgrade: true` server mutation (one shot).
 * - 'patch-data': a subset is staged → the staged changes have been merged into a
 *   single `data` document; the parent sends ONE upload to the unit's data endpoint.
 */
export type StagedCommitPayload =
  | { kind: 'upgrade-all' }
  | { kind: 'patch-data'; data: string };

/**
 * Sentinel value stored in `stagedEditedValues` to mark a STAGED manual DELETE
 * of a key (the "remove key" flow deferred until commit). Distinguished from a
 * real user-typed value by reference identity is impossible across a Map, so we
 * use a unique unlikely string and a guard helper. At commit time a staged path
 * whose edited value is this sentinel resolves to `deleteValueAtPath`.
 */
export const STAGED_DELETE_SENTINEL = '\x00__confighub_staged_delete__\x00';
export function isStagedDeleteSentinel(value: string | undefined): boolean {
  return value === STAGED_DELETE_SENTINEL;
}


// ============================================================================
// ICONS
// ============================================================================

const ChevronRightIcon = () => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: 10, height: 10 }}>
    <path d="M6 4l4 4-4 4" />
  </svg>
);

const InspectIcon = () => (
  <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ width: 11, height: 11 }}>
    <circle cx="6" cy="6" r="4" />
    <line x1="9.2" y1="9.2" x2="12.5" y2="12.5" />
    <line x1="4.5" y1="6" x2="7.5" y2="6" strokeWidth="1" opacity="0.7" />
    <line x1="6" y1="4.5" x2="6" y2="7.5" strokeWidth="1" opacity="0.7" />
  </svg>
);

// ============================================================================
// PILL TOOLTIP
// ============================================================================

const tooltipSx = {
  p: 0,
  background: componentTheme.bgDefault,
  border: `1px solid ${componentTheme.borderMuted}`,
  borderRadius: '6px',
  boxShadow: '0 2px 8px rgba(0,0,0,.10)',
  maxWidth: 'none',
  // Never intercept the pointer — the tooltip overlaps the value/editing surface,
  // so it must be click-through (clicks pass to the value to enter inline edit).
  pointerEvents: 'none' as const,
};

// ============================================================================
// T1 — "ACTION FIRST" TOOLTIP
// ============================================================================
// The designer's T1 (Action First) treatment from
// mockups/toggle-styles/action-tooltip.html: the value-hover tooltip is
// restructured so the ACTION is the glanceable hero.
//   1. TOP line = the ACTION: a small change-type icon + a plain-language verb,
//      rendered in the change-type COLOUR (12.5px, ~660 weight).
//   2. a hairline divider.
//   3. the mono VALUE (or current→proposed diff) — quiet (fg-muted 11.5px).
//   4. a small MUTED status line (the old "UPSTREAM (OVERRIDDEN)" context) —
//      demoted to quiet grey subtext (fg-subtle 10.5px).
// The colour is always PAIRED with the verb text + an icon, never colour-only,
// so the action stays accessible.

/** A 13px up-arrow — "stage / accept the incoming upgrade or upstream value". */
const T1ArrowUpIcon = () => (
  <svg width="13" height="13" viewBox="0 0 13 13" fill="none" style={{ flexShrink: 0 }}>
    <path d="M6.5 10V3m0 0L3.5 6m3-3L9.5 6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

/** A 13px circular-arrow — "unstage / discard a staged change". */
const T1UndoIcon = () => (
  <svg width="13" height="13" viewBox="0 0 13 13" fill="none" style={{ flexShrink: 0 }}>
    <path d="M2 4.5C2.8 2.8 4.5 1.7 6.5 1.7c2.6 0 4.8 2.1 4.8 4.8S9.1 11.3 6.5 11.3c-2 0-3.7-1.2-4.4-2.9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    <path d="M2 2v3h3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

/** A 13px pencil — "edit this value". */
const T1EditIcon = () => (
  <svg width="13" height="13" viewBox="0 0 13 13" fill="none" style={{ flexShrink: 0 }}>
    <path d="M9.5 1.5l2 2-6.5 6.5L3 10.5l.5-2 6.5-6.5z" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

/** A 13px lock — "blocked / locally overridden". */
const T1LockIcon = () => (
  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" style={{ flexShrink: 0 }}>
    <rect x="2" y="5.5" width="8" height="5.5" rx="1.5" stroke="currentColor" strokeWidth="1.4" />
    <path d="M4 5.5V4a2 2 0 014 0v1.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
  </svg>
);

/** A 13px minus-in-circle — "remove / delete". */
const T1RemoveIcon = () => (
  <svg width="13" height="13" viewBox="0 0 13 13" fill="none" style={{ flexShrink: 0 }}>
    <circle cx="6.5" cy="6.5" r="4.7" stroke="currentColor" strokeWidth="1.4" />
    <path d="M4.3 6.5h4.4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

/** A 13px plus-in-circle — "add". */
const T1AddIcon = () => (
  <svg width="13" height="13" viewBox="0 0 13 13" fill="none" style={{ flexShrink: 0 }}>
    <circle cx="6.5" cy="6.5" r="4.7" stroke="currentColor" strokeWidth="1.4" />
    <path d="M6.5 4.3v4.4M4.3 6.5h4.4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

/** Per-type colour for the T1 action line, matching the mockup's tokens. */
const T1_ACTION_COLOR = {
  upgrade: '#7c3aed', // up-c
  blocked: '#9a6700', // bl-c
  staged: '#6d28d9',  // st-c
  edit: '#4b5563',    // ed-c
  delete: '#dc2626',  // staged-states delete red
  add: '#16a34a',     // staged-states add green
} as const;

type T1ActionType = keyof typeof T1_ACTION_COLOR;

/**
 * T1 "Action First" tooltip body. The action verb (top, coloured, with an icon)
 * is the hero; the value and an optional muted status descend below a hairline
 * divider. Used for every actionable value pill in the component treeview.
 */
const ActionTooltipContent = ({
  type,
  icon,
  action,
  value,
  noValue,
  status,
}: {
  /** Change type — drives the action line colour (paired with the verb + icon). */
  type: T1ActionType;
  /** The action-line icon glyph. */
  icon: ReactNode;
  /** The plain-language action verb (the glanceable hero). */
  action: string;
  /** The mono value / current→proposed context shown below the divider. */
  value: ReactNode;
  /** When true, render the value line italic + muted ("no value" placeholder). */
  noValue?: boolean;
  /** Optional muted status subtext (e.g. the old overridden context). */
  status?: string;
}) => (
  <Box sx={{ minWidth: 196, maxWidth: 248, display: 'flex', flexDirection: 'column' }}>
    {/* 1 — ACTION (hero): icon + verb in the change-type colour. */}
    <Box
      sx={{
        display: 'flex', alignItems: 'center', gap: '6px',
        px: 1.5, pt: '10px', pb: '8px',
        fontFamily: componentTheme.fontSans,
        fontSize: 12.5, fontWeight: 660,
        color: T1_ACTION_COLOR[type],
      }}
    >
      {icon}
      {action}
    </Box>
    {/* 2 — hairline divider. */}
    <Box sx={{ height: '1px', mx: 1.5, background: componentTheme.borderSubtle }} />
    {/* 3 — the (quiet) mono value / diff. */}
    <Box
      sx={{
        px: 1.5, pt: '6px', pb: status ? '3px' : '8px',
        fontFamily: componentTheme.fontMono, fontSize: 11.5,
        color: componentTheme.fgMuted, wordBreak: 'break-all', lineHeight: 1.4,
        ...(noValue && { fontStyle: 'italic' }),
      }}
    >
      {noValue ? NO_VALUE_LABEL : value}
    </Box>
    {/* 4 — small, MUTED status line (demoted context). */}
    {status && (
      <Box
        sx={{
          px: 1.5, pb: '8px',
          fontFamily: componentTheme.fontSans, fontSize: 10.5,
          color: componentTheme.fgSubtle, lineHeight: 1.4,
        }}
      >
        {status}
      </Box>
    )}
  </Box>
);

const PillTooltipContent = ({
  fullValue,
  accentColor,
  meta,
  action,
  italic,
}: {
  fullValue: string;
  accentColor?: string;
  meta?: { label: string; createdAt?: string; description?: string };
  action?: string;
  italic?: boolean;
}) => {
  const noValue = isEmptyValue(fullValue);
  return (
  <Box sx={{ minWidth: 140, maxWidth: 280 }}>
    <Box sx={{
      px: 1.5, py: 1,
      fontFamily: componentTheme.fontMono,
      fontSize: 11,
      color: accentColor ?? componentTheme.fgDefault,
      wordBreak: 'break-all',
      lineHeight: 1.4,
      borderBottom: `1px solid ${componentTheme.borderSubtle}`,
      ...((italic || noValue) && { fontStyle: 'italic' }),
    }}>
      {noValue ? NO_VALUE_LABEL : fullValue}
    </Box>
    {(meta || action) && (
      <Box sx={{ px: 1.5, py: 0.75, display: 'flex', flexDirection: 'column', gap: '2px' }}>
        {meta && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Box sx={{ fontSize: 10, fontFamily: componentTheme.fontSans, color: componentTheme.fgSubtle, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              {meta.label}
            </Box>
            {meta.createdAt && (
              <Box sx={{ fontSize: 10, fontFamily: componentTheme.fontSans, color: componentTheme.fgMuted }}>
                {formatRelativeTime(meta.createdAt)}
              </Box>
            )}
          </Box>
        )}
        {meta?.description && (
          <Box sx={{ fontSize: 10, fontFamily: componentTheme.fontSans, color: componentTheme.fgDefault, fontStyle: 'italic', lineHeight: 1.3 }}>
            {meta.description}
          </Box>
        )}
        {action && (
          <Box sx={{ fontSize: 10, fontFamily: componentTheme.fontSans, color: componentTheme.fgMuted, mt: meta ? '2px' : 0 }}>
            {action}
          </Box>
        )}
      </Box>
    )}
  </Box>
  );
};

// ============================================================================
// PILL COMPONENTS
// ============================================================================

/**
 * Stage/unstage control for an upgradable leaf row — a compact MUI Checkbox.
 * Checked = staged, unchecked = unstaged; clicking toggles via onToggle (wired to
 * the existing onStagePath/onUnstagePath). Purple when checked, neutral grey when
 * not. BLOCKED (locally-overridden) rows dim the box (disabled-looking, amber
 * tint) — checking force-includes the overridden upstream value (same as the old
 * blocked pill); the dashed provenance border on the value itself now carries the
 * "this is locally overridden" signal, so no separate lock glyph is rendered here.
 * The `upgrade-pill` class is retained on the wrapper so the row's
 * `:has(.upgrade-pill:hover)` inline-diff-preview reveal keeps working, and the
 * data-testid / data-staged hooks are preserved for the staging tests + E2E.
 */
const UpgradeCheckbox = ({
  staged,
  blocked,
  changeType,
  onToggle,
}: {
  staged?: boolean;
  blocked?: boolean;
  /** The change type this control commits — drives its FILL colour: upgrade =
   *  purple #7c3aed, edit = yellow #ca8a04, delete = red #dc2626, add = green
   *  #16a34a. A blocked row's lock is amber + the box is disabled. */
  changeType?: RowChangeType;
  onToggle?: () => void;
}) => {
  // Resolve the per-type checkbox fill + unchecked border. Default = upgrade purple.
  const fill = blocked
    ? componentTheme.attentionEmphasis
    : ROW_TYPE_TOKENS[changeType ?? 'upgrade'].fill;
  // Unchecked border tints toward the type so an empty box still reads its intent.
  const emptyBorder =
    changeType === 'edit' ? EDIT_BORDER
      : changeType === 'delete' ? DEL_BORDER
        : changeType === 'add' ? ADD_BORDER
          : UP_BORDER;
  return (
  <Box
    component="span"
    className={`upgrade-pill${blocked ? ' upgrade-pill-blocked' : ''}${staged ? ' upgrade-pill-staged' : ''}`}
    data-testid="component-upgrade-pill"
    data-staged={staged ? 'true' : 'false'}
    sx={{ display: 'inline-flex', alignItems: 'center', gap: '2px', flexShrink: 0 }}
  >
    <Checkbox
      size="small"
      checked={!!staged}
      onChange={onToggle}
      sx={{
        padding: '2px',
        // Empty box: subtle type-tinted border (via the icon stroke colour). Checked
        // box: solid type fill. Blocked box is dimmed (opacity .55) to read "disabled".
        color: blocked ? componentTheme.attention : emptyBorder,
        '&.Mui-checked': { color: fill },
        ...(blocked && { opacity: 0.55 }),
        '& .MuiSvgIcon-root': { fontSize: 18 },
        '&:hover': {
          backgroundColor:
            changeType === 'edit' ? 'rgba(234,179,8,.12)'
              : changeType === 'delete' ? 'rgba(220,38,38,.08)'
                : changeType === 'add' ? 'rgba(22,163,74,.08)'
                  : blocked ? 'rgba(154,103,0,.08)'
                    : 'rgba(124,58,237,.08)',
          // Empty upgrade box brightens its border to the full hue on hover (spec).
          ...(!staged && !blocked && { color: ROW_TYPE_TOKENS[changeType ?? 'upgrade'].fill }),
        },
      }}
    />
  </Box>
  );
};

const CurrentPill = ({
  value,
  filterText,
  changeType,
  previewChangeType,
  muted,
  isAbsent,
  editable,
  previewSegments,
  previewRemoved,
  oldValueForPreview,
  differsFromUpstream,
  kept,
}: {
  value: string;
  filterText: string;
  /** The resolved change type for a staged row — drives the inline-diff value
   *  treatment. undefined for a plain/unstaged row. The per-type row tint + left
   *  bar live on the ReviewRow, not the value pill (values stay flat). */
  changeType?: RowChangeType;
  /** The change type the PREVIEW (current→proposed inline diff) represents. Set
   *  even on UNSTAGED upgradable rows so the hover-revealed diff colours correctly
   *  (purple token highlight for an upgrade, green for an add, yellow for an edit).
   *  Falls back to changeType when omitted. */
  previewChangeType?: RowChangeType;
  /** BLOCKED / COMMITTED rows render their value in muted grey (#59636e) — no
   *  change is possible (blocked) or the change is already applied (committed). */
  muted?: boolean;
  /** When true, renders a muted "no value" placeholder instead of the value text. */
  isAbsent?: boolean;
  /** When true (row has an edit handler and isn't removing), hovering the value
   *  shows a dotted "click to edit inline" underline. Not set for non-editable
   *  values (context name leaves, disabled rows). */
  editable?: boolean;
  /** When provided, hovering the sibling stage control (.upgrade-pill) swaps the
   *  current text for this inline diff preview via the .pill-group :has() rule. */
  previewSegments?: InlineDiffSegment[];
  /** When true the upstream deletes this value; hovering the upgrade pill shows a red strikethrough ghost. */
  previewRemoved?: boolean;
  /**
   * The value being replaced, for a plain value CHANGE (not add/delete) in a
   * read-only diff view (e.g. the Releases tab) — rendered struck-through and
   * muted immediately before the incoming value, so both sides of the change
   * are visible without a staging control to hover. Undefined everywhere else
   * (the Upgrade/Apply tabs keep their existing hover-only preview, since
   * there the "before" value is always the row's own unstaged current text).
   */
  oldValueForPreview?: string;
  /** True when this value differs from upstream, or has an uncommitted staged
   *  edit. Opens the pill's transparent 1px reserve as a dashed stroke — no
   *  layout shift, because the border box is always drawn. Superseded by
   *  `kept`: a kept value renders solid regardless of this flag (see `kept`). */
  differsFromUpstream?: boolean;
  /**
   * True when this path is protected — "kept on merge" — either committed
   * (the current effective MutationSources protection) or freshly staged via
   * the kebab. Firms the pill's border from dashed to SOLID, in the SAME
   * `borderEdge` colour as the dashed stroke — only the style changes, not
   * the colour. Solid REPLACES dashed rather than composing with it: a kept
   * value that also differs from upstream still renders solid, never both.
   * This is also what fills the "fourth cell" — protected + matches-upstream
   * now draws a solid border where before nothing rendered, because `kept`
   * doesn't depend on `differsFromUpstream` at all.
   */
  kept?: boolean;
}) => (
  <Box
    component="span"
    className={`current-pill${previewRemoved ? ' has-remove-preview' : ''}`}
    /*
     * `data-fidelity` marks inline treatments that carry meaning VISUALLY and
     * have no semantics to bind to. There is no ARIA role for "this token
     * changed" and inventing one would be wrong — it is the presentation of a
     * value, not a widget — so the contract needs an explicit hook.
     *
     * Added unconditionally rather than behind an opt-in prop: these attributes
     * are inert, change nothing rendered and nothing announced, and gating them
     * would thread a prop through a dozen render sites for no benefit. The
     * opt-in pattern exists for `TreeDiffSection`'s `domHooks`, which also
     * switches on disclosure semantics (role, tabIndex, aria-expanded) and so
     * genuinely alters behaviour. This does not.
     *
     * The value cell needs one despite looking structural: the contract's
     * single-value-column invariant is "every leaf row carries exactly one
     * value cell sharing a left edge within its block", and without a hook
     * there is nothing to count.
     */
    data-fidelity="value-cell"
    sx={{
      display: 'inline-flex',
      // Right-align the value so it sits hard against the right column (just left of
      // the checkbox). Long/wrapped values stay right-aligned.
      alignItems: 'flex-start',
      justifyContent: 'flex-end',
      flexWrap: 'wrap',
      textAlign: 'right',
      minWidth: 0,
      // Match the 20px pill so the value box doesn't inflate the dense row.
      minHeight: 20,
      boxSizing: 'border-box',
      // Flat: render the value as plain inline text (no border/background/box).
      padding: '2px 4px',
      borderRadius: '4px',
      borderWidth: '1px',
      borderStyle: 'solid',
      borderColor: 'transparent',
      background: 'transparent',
      color: componentTheme.fgDefault,
      // Value text at the mockup's 12px (slightly smaller than the 12.5px key), for density.
      fontSize: 12,
      fontFamily: componentTheme.fontMono,
      fontWeight: 500,
      // BLOCKED / COMMITTED: muted grey value (no change possible / already applied).
      ...(muted && { color: VAL_MUTED }),
      // Border resolution: KEPT (protected) wins outright — solid, same edge
      // colour as the dashed stroke, never composed with dashed. Otherwise,
      // differs-from-upstream (or an uncommitted staged edit) opens the
      // always-reserved 1px border as a dashed stroke. Neither → transparent.
      ...(kept && { borderStyle: 'solid', borderColor: componentTheme.borderEdge }),
      ...(!kept && differsFromUpstream && { borderStyle: 'dashed', borderColor: componentTheme.borderEdge }),
      // border-style is NOT included here: CSS cannot interpolate it, so animating
      // it would snap mid-fade instead of transitioning.
      transition: 'border-color .12s, box-shadow .12s, background .12s, transform .18s cubic-bezier(0.34,1.56,0.64,1)',
      // Editable values signal "click to edit inline" with a subtle dotted underline
      // on hover (standard inline-edit convention). Whichever value-text element is
      // VISIBLE gets the underline: `.current-text` on an UNSTAGED row, or
      // `.current-preview` (the persistent current→proposed inline diff) on a STAGED
      // row — because the `.pill-staged` reveal hides `.current-text` and shows
      // `.current-preview`, so a staged row would otherwise show NO edit affordance.
      // `.current-text` is gated `:not(.is-absent)` so the "no value" placeholder is
      // never underlined; `.current-preview` only renders on a row that has a
      // proposed value, so it needs no absent guard. No background tint: the dotted
      // underline is the sole, lighter affordance.
      ...(editable && {
        '&:hover .current-text:not(.is-absent), &:hover .current-preview': {
          textDecoration: 'underline dotted',
          textDecorationColor: 'rgba(15,17,21,.28)',
          textDecorationThickness: '1px',
          textUnderlineOffset: '2px',
          cursor: 'text',
        },
      }),
    }}
  >
    <Box
      className={`current-text${(isAbsent || isEmptyValue(value)) ? ' is-absent' : ''}`}
      data-fidelity={isAbsent || isEmptyValue(value) ? 'value-absent' : undefined}
      sx={{
        lineHeight: 1.35,
        overflowWrap: 'break-word',
        minWidth: 0,
        wordBreak: 'break-word',
        ...((isAbsent || isEmptyValue(value)) && { color: componentTheme.fgSubtle, fontStyle: 'italic', fontSize: 11, opacity: 0.85 }),
      }}
    >
      {isAbsent || isEmptyValue(value) ? NO_VALUE_LABEL : (filterText ? highlightText(value, filterText) : value)}
    </Box>
    {oldValueForPreview !== undefined && (
      <>
        <Box
          component="span"
          className="current-old-preview"
          data-fidelity="value-superseded"
          sx={{
            display: 'none',
            lineHeight: 1.35,
            textDecoration: 'line-through',
            color: componentTheme.fgSubtle,
            ...(isEmptyValue(oldValueForPreview) && { fontStyle: 'italic' }),
          }}
        >
          {isEmptyValue(oldValueForPreview) ? NO_VALUE_LABEL : oldValueForPreview}
        </Box>
        <Box
          component="span"
          className="current-old-preview"
          aria-hidden="true"
          // The reveal marker for the original value beside it. Decorative, so
          // it is hidden from assistive tech and measured at the non-text tier.
          data-fidelity="original-preview"
          sx={{ display: 'none', lineHeight: 1.35, color: componentTheme.fgSubtle, opacity: 0.7 }}
        >
          →
        </Box>
      </>
    )}
    {previewSegments && (() => {
      // Resolve the preview's effective change type once.
      const effectiveType = previewChangeType ?? changeType;
      // UPGRADE and EDIT use the IDENTICAL inline token-diff treatment — the
      // unchanged chars dim to muted grey and the CHANGED chars get a subtle
      // bg + border + bold colored highlight — differing ONLY in colour:
      // upgrade is purple, edit is yellow. This makes a staged edit display
      // identically to a staged upgrade. ADD renders the proposed value flat
      // (green) since there is no original to diff against character-by-character.
      const isTokenDiff = effectiveType === 'upgrade' || effectiveType === 'edit';
      // Per-type changed-token highlight palette (mirrored alphas, swapped hue).
      const tokText = effectiveType === 'edit' ? EDIT_TOK_TEXT : UP_TOK_TEXT;
      const tokBg = effectiveType === 'edit' ? EDIT_TOK_BG : UP_TOK_BG;
      const tokBorder = effectiveType === 'edit' ? EDIT_TOK_BORDER : UP_TOK_BORDER;
      return (
      <Box
        component="span"
        className="current-preview"
        data-fidelity="value-preview"
        sx={{
          display: 'none',
          lineHeight: 1.35,
          // ADD → plain green text (weight 580). UPGRADE/EDIT dim the unchanged
          // chars (#59636e) and box only the changed chars (purple / yellow below).
          ...(effectiveType === 'add' && { color: ADD_VAL_TEXT, fontWeight: 580 }),
          ...(isTokenDiff && { color: VAL_MUTED }),
        }}
      >
        {previewSegments.map((seg, idx) =>
          // UPGRADE and EDIT box their CHANGED chars with the identical subtle
          // highlight structure (bg + border + bold colored text), differing only
          // in colour (purple vs yellow). ADD renders flat in its type colour.
          seg.changed && isTokenDiff ? (
            <Box
              key={idx}
              component="span"
              data-fidelity="token-changed"
              sx={{
                color: tokText,
                fontWeight: 700,
                background: tokBg,
                border: `1px solid ${tokBorder}`,
                borderRadius: '3px',
                padding: '0 3px',
                WebkitBoxDecorationBreak: 'clone',
                boxDecorationBreak: 'clone',
              }}
            >
              {seg.text}
            </Box>
          ) : (
            <Box key={idx} component="span" data-fidelity="token-kept">{seg.text}</Box>
          ),
        )}
      </Box>
      );
    })()}
    {previewRemoved && (
      <Box
        component="span"
        className="current-removed"
        data-fidelity="value-removed"
        sx={{ display: 'none', textDecoration: 'line-through', color: componentTheme.danger, opacity: 0.6, lineHeight: 1.35, ...(isEmptyValue(value) && { fontStyle: 'italic' }) }}
      >
        {isEmptyValue(value) ? NO_VALUE_LABEL : value}
      </Box>
    )}
  </Box>
);


// ============================================================================
// ACCEPTED / FLASHING MEMBERSHIP CONTEXT
// ============================================================================

/**
 * stagedPaths changes on every stage/unstage (a NEW Set each time). Previously it
 * was drilled through every recursive NodeRow as a prop, so each toggle replaced
 * the Set identity and the memo comparator cascaded a re-render through every
 * folder in the tree. Only LEAF rows actually read per-path membership, so we
 * serve them via context instead: changing the Set re-renders only the
 * context-consuming leaves, and folders never participate in the cascade.
 */
interface MembershipContextValue {
  stagedPaths: Set<string>;
  /**
   * Paths whose staged upgrade was just COMMITTED (path → the committed value, or a
   * removal sentinel for a committed delete). After commit, RTK refetches and the
   * path drops out of upgradeFieldDiffs/upgradablePaths; this keeps the row visible
   * in the Upgradable view showing its now-applied value with a "done" indicator,
   * matching the legacy frozenUpgradeDiffs behavior. Like stagedPaths it is served
   * via context (read only by leaves) and changes only on commit — never on
   * stage/unstage — so it does not churn the tree.
   */
  committedDiffs: Map<string, string>;
  /** Of committedDiffs, the paths that were ADDS (upstream-only at commit time) —
   * they show a green `+`; other committed value-changes show a done check. */
  committedAddPaths: Set<string>;
  /**
   * Per committed (non-removal) path: the downstream value at commit time (undefined =
   * absent, i.e. an ADD). A committed value is a temporary optimistic snapshot shown so a
   * just-committed ADD/CHANGE displays instantly, BEFORE the RTK refetch of unit.data
   * converges. A leaf compares this baseline against the live downstreamValueByPath to
   * decide, at render, whether the refetch has landed (value diverged) and display should
   * hand back to the authoritative node.diff.newValue — WITHOUT deleting the committedDiffs
   * entry, which must persist to keep the committed "done" row visible. */
  committedBaseline: Map<string, string | undefined>;
  /** Live current downstream value per path (same source that feeds node.diff.newValue).
   * Changes on every refetch, so a leaf's convergence check re-evaluates with no effect. */
  downstreamValueByPath: Map<string, string>;
  /**
   * Staged MANUAL edits: path → the user-typed value (or STAGED_DELETE_SENTINEL
   * for a staged removal). A staged edit defers the write until commit, so the
   * row renders its current→edited preview with the staged tint and a revert
   * affordance. Sticky across tab switches; cleared only on Discard, successful
   * commit, or unit identity change. Like stagedPaths it is served via context
   * (read by leaves) so an edit re-renders only the affected leaf.
   */
  stagedEditedValues: Map<string, string>;
  /** Revert a staged manual edit: discard the edit and unstage the path. */
  onRevertEdit: (path: string) => void;
  /**
   * Staged PROTECTION changes: stage key → the TARGET `Protected` value the
   * user picked ("Keep on merge" → true, "Let merges update this" → false).
   * A path with no entry here has no staged protection change (its displayed
   * state is whatever `isProtected(path)` reports — the committed baseline).
   * Distinct from `stagedEditedValues`/`stagedPaths`: a protection change is
   * never a value write and never joins the `N staged` value-change count
   * (see `onToggleProtection`). Sticky across `clearStagedSignal` (same
   * reasoning as manual edits); cleared only by `discardAllSignal` or a
   * successful protection commit.
   */
  stagedProtection: Map<string, boolean>;
  /**
   * Stage (or un-stage, if it would be a no-op) a protection change for one
   * path. `targetProtected` is the value the user is choosing ("Keep on
   * merge" passes true, "Let merges update this" passes false). If it equals
   * the path's CURRENT effective (committed) protection, the staged entry is
   * removed instead of set — clicking then clicking back is a true no-op, and
   * "protect 6 where 4 are already protected" stages exactly 2.
   */
  onToggleProtection: (stageKey: string, targetProtected: boolean) => void;
}

const MembershipContext = createContext<MembershipContextValue>({
  stagedPaths: new Set(),
  committedDiffs: new Map(),
  committedAddPaths: new Set(),
  committedBaseline: new Map(),
  downstreamValueByPath: new Map(),
  stagedEditedValues: new Map(),
  onRevertEdit: () => {},
  stagedProtection: new Map(),
  onToggleProtection: () => {},
});

// ============================================================================
// TYPES
// ============================================================================

/** An optimistically-rendered empty folder not yet persisted to the server. */
interface PendingFolder {
  fullPath: string; // e.g. "metadata.newGroup"
  key: string;      // final segment only, e.g. "newGroup"
}

interface NodeRowProps {
  node: DiffTreeNode;
  depth: number;
  filterText: string;
  filterMode: 'all' | 'upgradable' | 'changed';
  /**
   * Read-only diff viewing (task #62 — e.g. the Releases tab's "Unreleased
   * changes" section): disables every staging/editing affordance (the
   * upgrade-pill checkbox, inline value editing, the kebab "Add row"/"Remove
   * key" menu) and swaps copy that implies a commit action ("will be
   * committed on Upgrade") for neutral, accurate wording. Defaults to
   * false/undefined everywhere else, so Upgrade/Apply call sites are
   * byte-identical to before this prop existed.
   */
  readOnly?: boolean;
  pathPrefix: string;
  upgradeFieldDiffs: Map<string, string>;
  variationFieldDiffs: Map<string, string>;
  /** Paths differing between upstream HEAD and the unit's CURRENT committed data
   *  (never the dry-run) — drives the value border. See VariationEntry.liveFieldDiffs. */
  liveVariationPaths: Set<string>;
  allPaths: { path: string; value: string }[];
  /** Paths present upstream but absent downstream — rendered with an absent ("—") current value. */
  upstreamOnlyPaths: Set<string>;
  changedPaths: Set<string>;
  changedDiffs: Map<string, { oldValue: string; newValue: string }>;
  /** Precomputed prefix-index for O(log n)/O(1) descendant lookups (replaces per-folder allPaths scans). */
  prefixIndex: PrefixIndex;
  /** Toggle this path into the local STAGED set (true-staging: no write happens). */
  onStagePath: (path: string) => void;
  /** Remove this path from the local STAGED set. */
  onUnstagePath: (path: string) => void;
  /** Inline value EDIT (user types a custom value) — DEFERRED: records into the
   *  staged-edit map (no immediate write). Commit applies it via the patch-data merge. */
  onStageEdit?: (path: string, newValue: string) => void;
  /** Used ONLY by the add-row composer (creating a brand-new key writes immediately).
   *  Inline value edits go through onStageEdit instead. */
  onSetFieldValue?: (path: string, newValue: string, meta?: FieldPathMeta) => Promise<void>;
  /** Remove a created upstream-only key (used by inline edit revert). */
  onDeleteFieldValue?: (path: string, meta?: FieldPathMeta) => Promise<void>;
  /**
   * CURRENT effective protection for a bare path — the COMMITTED baseline
   * (independent of anything staged), sourced from the unit's lazily-fetched
   * `MutationSources` via `buildProtectedPathLookup`. Treats "not yet fetched"
   * as `false` (not protected) — the safe default per protectedPaths.ts /
   * lock-interaction Finding 2: worst case is a redundant protect (the
   * backend no-ops it), never a silent unprotect. Defaults to `() => false`
   * when the caller hasn't wired real data yet.
   */
  isProtected?: (path: string) => boolean;
  /**
   * Tell the caller this unit's protection data is now needed (a leaf or
   * folder kebab was opened) so it can lazily fetch `MutationSources` for it
   * if it hasn't already. Safe to call repeatedly — the caller dedupes.
   */
  onRequestProtectionData?: () => void;
  /**
   * The source document this row belongs to, inherited from the nearest
   * ancestor wrapper. Undefined for single-document units (and for every unit
   * before grouping existed), which is why every consumer treats undefined as
   * "no scoping needed" rather than "not writable".
   */
  documentScope?: DocumentIdentity;
  upgradeCreatedAt?: string;
  upgradeDescription?: string;
  upgradeSourceName?: string;
  upgradeRevisionNum?: number;
  upgradeSourceSpaceId?: string;
  upgradeSourceUnitId?: string;
  /** `unit.upgradeEntry?.historical` — see that field's doc comment (componentTypes.ts). Picks the 'edit' (yellow) token-diff palette over 'upgrade' (purple) for this unit's field diffs. */
  upgradeIsHistorical?: boolean;
  headRevisionCreatedAt?: string;
  headRevisionDescription?: string;
  // Inspect panel
  spaceId: string;
  unitId: string;
  /** Optimistic per-path overlay for this unit: null = field deleted, string = value override. */
  valueOverlay?: Map<string, string | null>;
  /** Path → FieldPathMeta map for resource identity lookup when invoking set-attributes. */
  fieldPathMeta?: Map<string, FieldPathMeta>;
  inspectPath: string | null;
  onInspectPath: (path: string | null) => void;
  variationEntry?: VariationEntry;
  deploymentName?: string;
  /** Raw inputs used to compute sibling-variant values for the inspected leaf. */
  deployments?: ComponentDeployment[];
  unitsByDeployment?: Map<string, Array<{
    slug: string;
    spaceId: string;
    unitId: string;
    toolchainType?: string;
    data?: string;
    validationErrors?: unknown;
  }>>;
  // Add/remove key feature props
  composing: ComposingDescriptor | null;
  pendingRemovals: Set<string>;
  recentlyAddedPaths: Set<string>;
  onOpenComposer: (desc: ComposingDescriptor) => void;
  onCommitComposer: (desc: ComposingDescriptor, key: string, value: string) => Promise<void>;
  onCancelComposer: () => void;
  onRemove: (fullPath: string) => void;
  onUndoRemove: (fullPath: string) => void;
}

interface ComponentValuesSectionProps {
  unit: MergedUnit;
  filterText?: string;
  /**
   * `'changed'` narrows to `changedPaths` — every path `upgradeEntry.fieldDiffs`
   * reports, with no `variationPaths` exclusion. Distinct from `'upgradable'`,
   * which excludes any path a local override blocks from actually upgrading:
   * for a consumer showing what a write WOULD do (never what a live upgrade
   * blocks), that exclusion can legitimately throw out every real change — it
   * did, for the rollout page's synthetic `MergedUnit`s, where the exclusion
   * emptied the tree on a unit with three genuine diffs. `'changed'` is the
   * narrowing `'all'` mode's own highlighting already uses; this only makes it
   * possible to request as the VISIBLE set too, not just the highlighted one.
   */
  filterMode?: 'all' | 'upgradable' | 'changed';
  scopeFilter?: 'local-overrides' | 'local-only' | 'kept-on-merge' | null;
  /** See NodeRowProps.readOnly — disables staging/editing affordances and swaps commit-implying copy for neutral wording. Defaults to false. */
  readOnly?: boolean;
  /** Reports this unit's current staged LOGICAL-change count up to the side pane
   * (for the footer chip / button enablement). Logical, not raw leaf count: an
   * added array element spanning several leaves counts as one. */
  onStagedCountChange?: (unitId: string, count: number) => void;
  /** Increment to COMMIT this unit's staged set (true-staging: nothing was written until now). */
  commitStagedSignal?: number;
  /** Increment to CLEAR this unit's staged UPGRADE picks without committing.
   *  Fired on LEAVING the Upgradable tab — STICKY manual edits are preserved. */
  clearStagedSignal?: number;
  /** Increment to DISCARD EVERYTHING staged for this unit — upgrade picks AND
   *  sticky manual edits. Fired by the explicit footer "Discard" button. */
  discardAllSignal?: number;
  /** Increment to STAGE every available upgrade for this unit (select-all; does not commit). */
  stageAllSignal?: number;
  /** Commit this unit's staged batch in ONE call. Resolves true on success (staged set is then cleared). */
  onCommitStaged?: (payload: StagedCommitPayload) => Promise<boolean>;
  /**
   * Commit this unit's staged PROTECTION changes in ONE call, via the
   * dedicated `SetUnitProtection` endpoint — a SEPARATE revision from the
   * value-write `onCommitStaged` call, and fired FIRST when both are staged
   * (see the commit-signal effect: protecting an existing key before an
   * upgrade lands means the upgrade can't clobber it; a lock on a
   * same-commit new key is disallowed instead of reordered — you cannot
   * stage a lock on a key that does not exist yet). Resolves true on
   * success (this unit's staged protection is then cleared).
   */
  onCommitProtection?: (protection: ResourceProtection[]) => Promise<boolean>;
  onSetFieldValue?: (path: string, newValue: string, meta?: FieldPathMeta) => Promise<void>;
  onDeleteFieldValue?: (path: string, meta?: FieldPathMeta) => Promise<void>;
  /** CURRENT effective (committed) protection lookup — see NodeRowProps.isProtected. */
  isProtected?: (path: string) => boolean;
  /** See NodeRowProps.onRequestProtectionData. */
  onRequestProtectionData?: () => void;
  /** Reports this unit's current staged PROTECTION-change count (total, and of
   * those how many target `Protected: true`) up to the side pane (for the bar
   * disclosure). Counted separately from the value-staged count — see
   * MembershipContextValue.stagedProtection. */
  onStagedProtectionChange?: (unitId: string, total: number, protectCount: number) => void;
  /**
   * Reports, for THIS unit, how many of its staged MANUAL EDITS (non-delete
   * `stagedEditedValues` entries — a plain typed value, the card 3 scenario)
   * are currently staged, and of those, how many are NOT yet effectively kept
   * (`total`, `unkept`). Drives the bar's "N staged · both may be overwritten"
   * vs "N staged · both kept on merge" disclosure (Section 6/card 3 & 8) —
   * deliberately excludes staged UPGRADE picks (accepting an incoming value
   * isn't the "silently overwritten later" risk this disclosure warns about).
   */
  onStagedEditKeepSummaryChange?: (unitId: string, total: number, unkept: number) => void;
  /**
   * Increment to stage a protect (target true) for every one of this unit's
   * currently staged-edited-but-not-yet-kept paths — the "Keep both on
   * merge" bar button (card 3b). Scoped to `stagedEditedValues ∩ stagedPaths`
   * only, never staged upgrade picks.
   */
  keepStagedEditsSignal?: number;
  /**
   * Increment to undo exactly what `keepStagedEditsSignal` (or an individual
   * kebab click on an edited-and-now-kept row) staged: removes the
   * `stagedProtection` entry for every path that is in BOTH `stagedPaths` and
   * `stagedEditedValues` — never a protection change staged independently on
   * an unedited row (card 3's "Undo keep" — a staging-level undo, distinct
   * from Discard).
   */
  undoKeepStagedEditsSignal?: number;
  /**
   * Increment to STAGE an unprotect (target false) for every one of this
   * unit's currently checkable, effectively-kept paths (`keptOnMergePaths`) —
   * the Scope chip's flattened-view "Stop keeping N keys" bulk action
   * (Section 7/card 4b/Finding 5). Stages only; the normal commit machinery
   * (now showing a "scope changes" bar state, Section 6) does the write.
   */
  stopKeepingAllSignal?: number;
  /** Optimistic per-path overlay for this unit: null = field deleted, string = value override. */
  valueOverlay?: Map<string, string | null>;
  deployments?: ComponentDeployment[];
  unitsByDeployment?: Map<string, Array<{
    slug: string;
    spaceId: string;
    unitId: string;
    toolchainType?: string;
    data?: string;
    validationErrors?: unknown;
  }>>;
}

// ============================================================================
// TREE BUILDER
// ============================================================================

// ============================================================================
// TREE HELPERS
// ============================================================================

/** Count descendant leaf nodes recursively (for "Remove group & N keys" label). */
function countLeaves(nodes: DiffTreeNode[]): number {
  let count = 0;
  for (const n of nodes) {
    if (n.type === 'leaf') count++;
    else count += countLeaves(n.children ?? []);
  }
  return count;
}

/**
 * Collect the BARE dot-paths of every leaf DESCENDANT of `nodes`, prefixed by
 * `prefix` (the folder's own fullPath) — used by the folder kebab's "Keep
 * group & N keys" action (Finding 3 of the lock-interaction plan). A single
 * SetProtection write AT the folder path would only protect leaves that
 * inherit from it (the read ladder's ancestor rung); a leaf that already
 * carries its own EXACT PathMutationMap entry — the normal case for anything
 * ever edited/overridden — is untouched by an ancestor write, so the folder
 * action must enumerate and write each leaf individually. Mirrors NodeRow's
 * own `fullPath` computation: a path-transparent (document wrapper) node
 * resolves to its parent's prefix rather than extending it.
 */
function collectLeafPaths(nodes: DiffTreeNode[], prefix: string): string[] {
  const paths: string[] = [];
  for (const n of nodes) {
    const childPath = n.pathTransparent ? prefix : (prefix ? `${prefix}.${n.key}` : n.key);
    if (n.type === 'leaf') paths.push(childPath);
    else paths.push(...collectLeafPaths(n.children ?? [], childPath));
  }
  return paths;
}

// ============================================================================
// RECURSIVE TREE NODE ROW
// ============================================================================

// Indent step per nesting level. Matches the mockup's 10px-per-level rail.
const INDENT_PX = 10;

/**
 * Custom memo comparator for NodeRow — a plain shallow prop compare.
 *
 * stagedPaths is no longer a prop (see MembershipContext): it changes on every
 * stage/unstage and used to be drilled through every row, forcing a full-tree
 * comparator cascade on each toggle. It is now served to leaves via context, so
 * changing it re-renders ONLY the consuming leaves and folders are untouched.
 * pendingRemovals & recentlyAddedPaths are still props but are likewise read only
 * by leaves, so they get the same per-path treatment below rather than a shallow
 * identity compare. The remaining props are stable across staging toggles, so a
 * shallow compare keeps the whole tree from re-rendering on per-path staging.
 */
function nodeRowPropsAreEqual(prev: NodeRowProps, next: NodeRowProps): boolean {
  for (const key of Object.keys(next) as (keyof NodeRowProps)[]) {
    // pendingRemovals & recentlyAddedPaths change identity on every mutation but
    // are only read by LEAF rows (see the leaf block below). Skip them in the
    // shallow loop and compare per-path at leaves / by identity at folders so a
    // single path mutation does not cascade a re-render through every folder.
    // (stagedPaths is no longer a prop — it comes from MembershipContext — so it
    // is not part of this comparator.)
    if (
      key === 'pendingRemovals' ||
      key === 'recentlyAddedPaths'
    ) continue;
    if (prev[key] !== next[key]) return false;
  }
  const isLeaf = next.node.type === 'leaf' && next.node.diff != null;
  if (isLeaf) {
    const path = next.pathPrefix ? `${next.pathPrefix}.${next.node.key}` : next.node.key;
    return prev.pendingRemovals.has(path) === next.pendingRemovals.has(path)
        && prev.recentlyAddedPaths.has(path) === next.recentlyAddedPaths.has(path);
  }
  return prev.pendingRemovals === next.pendingRemovals
      && prev.recentlyAddedPaths === next.recentlyAddedPaths;
}

const NodeRow = memo(({
  node,
  depth,
  filterText,
  filterMode,
  readOnly,
  pathPrefix,
  upgradeFieldDiffs,
  variationFieldDiffs,
  liveVariationPaths,
  allPaths,
  upstreamOnlyPaths,
  changedPaths,
  changedDiffs,
  prefixIndex,
  onStagePath,
  onUnstagePath,
  onStageEdit,
  onSetFieldValue,
  onDeleteFieldValue,
  isProtected,
  onRequestProtectionData,
  valueOverlay,
  fieldPathMeta,
  upgradeCreatedAt,
  upgradeDescription,
  upgradeSourceName,
  upgradeRevisionNum,
  upgradeSourceSpaceId,
  upgradeSourceUnitId,
  upgradeIsHistorical,
  headRevisionCreatedAt,
  headRevisionDescription,
  spaceId,
  unitId,
  inspectPath,
  onInspectPath,
  variationEntry,
  deploymentName,
  deployments,
  unitsByDeployment,
  composing,
  pendingRemovals,
  recentlyAddedPaths,
  onOpenComposer,
  onCommitComposer,
  onCancelComposer,
  onRemove,
  onUndoRemove,
  documentScope,
}: NodeRowProps): ReactNode => {
  // A path-transparent node (the per-document wrapper from buildResourceGroupedTree)
  // has a human LABEL for a key ("Service guestbook"), not a config path segment, so
  // it must not extend the path: it resolves to its parent's prefix. That keeps every
  // descendant on its BARE dot-path (`spec.replicas`, never
  // `Service guestbook.spec.replicas`), which is the namespace all the
  // changedPaths / upgradeFieldDiffs / prefixIndex / setValueAtPath lookups use.
  const fullPath = node.pathTransparent
    ? pathPrefix
    : pathPrefix ? `${pathPrefix}.${node.key}` : node.key;

  // TARGETING IDENTITY — the OTHER job, deliberately kept apart from `fullPath`.
  // Anything that ADDRESSES this row (composer targeting, menu actions, React
  // keys) must use this, never `fullPath`: a wrapper's fullPath is its parent's
  // prefix — `''` at the top level — which every sibling wrapper shares AND which
  // is falsy, so it both collides in lookups and slips through truthiness guards.
  // For every ordinary node the two are identical, so behaviour there is unchanged.
  const rowId = node.document?.id ?? fullPath;

  // The document this row lives in: wrappers declare it, descendants inherit it.
  // Undefined for a single-document unit — no scoping needed, nothing to confuse.
  const docScope = node.document ?? documentScope;
  // The key this row's STAGED state is stored under. Scoped to the owning document
  // so staging one document's `apiVersion` never stages a sibling document's copy
  // of the same bare path. For a single-document unit docScope is undefined, so the
  // key IS the bare path — behaviour there is byte-identical to before scoping.
  const stageKey = docStageKey(docScope, fullPath);
  // Gate for every "add a key" action under this row. A document that is not
  // uniquely addressable (duplicate/absent resource identity, or a toolchain whose
  // writes ignore the resource scope) would swallow the write into the LAST
  // document — a different resource than the user pointed at. Disable instead.
  const canAddRows = docScope === undefined || docScope.writable;
  const addBlockedReason = canAddRows
    ? ''
    : 'Adding keys is unavailable here: this document can\'t be told apart from the others in this unit, so the change could land in the wrong resource.';

  // Per-path STAGED membership comes from context, not props, so that staging a
  // path re-renders only the mounted leaves that read it — folders (which never
  // read membership) are not part of the cascade. With lazy expansion the set of
  // mounted leaves is O(visible), so this stays cheap.
  const { stagedPaths, committedDiffs, committedAddPaths, committedBaseline, downstreamValueByPath, stagedEditedValues, onRevertEdit, stagedProtection, onToggleProtection } = useContext(MembershipContext);

  // Lazy expansion: folders default to COLLAPSED so a massive unit only mounts
  // O(visible) NodeRows instead of O(all leaves). Folders that are ancestors of a
  // changed/upgrading/overridden path auto-expand so the user still sees what
  // changed when the tree opens. Children of a collapsed folder are NOT mounted
  // (see the `expanded && ...` guard on the child map below) — we deliberately do
  // not use MUI <Collapse>, which keeps collapsed children mounted.
  // Document wrappers open by default: they resolve to the empty path, which is in
  // no auto-expand set, so on a massive unit they would otherwise collapse and hide
  // an entire document behind one row. The real folders beneath them still follow
  // the normal lazy-expansion rules.
  const [expanded, setExpanded] = useState(
    () => node.pathTransparent || prefixIndex.shouldAutoExpand(fullPath),
  );
  const [expandedSegment, setExpandedSegment] = useState<number | null>(null);
  // Auto-expand when dry-run poll updates make this folder's descendant an upgrade
  // candidate (prefixIndex is rebuilt on each poll). Never auto-collapse so manual
  // collapses the user made within the session are preserved.
  useEffect(() => {
    if (prefixIndex.shouldAutoExpand(fullPath)) setExpanded(true);
  }, [prefixIndex, fullPath]);
  const [editingValue, setEditingValue] = useState<string | null>(null);
  const [leafMenuAnchorEl, setLeafMenuAnchorEl] = useState<null | HTMLElement>(null);
  const [folderMenuAnchorEl, setFolderMenuAnchorEl] = useState<null | HTMLElement>(null);
  const editingValueRef = useRef<string | null>(null);

  const toggle = useCallback(() => {
    setExpanded((prev) => {
      // Collapsing the folder must also reset any in-row segment expansion. Otherwise
      // the path label keeps its expanded "click-me" styling (underline + rotated
      // chevron) and its truncated chain while the values it revealed are now hidden —
      // the orphaned, confusing state you hit when collapsing via the row instead of
      // re-clicking the segment.
      if (prev) setExpandedSegment(null);
      return !prev;
    });
  }, []);

  // Pre-compute leaf derived values here so handleSave can reference them via useCallback
  const upgradeValue = upgradeFieldDiffs.get(fullPath);
  // STAGED: the user picked this upgrade locally; nothing is written until commit.
  const isStaged = stagedPaths.has(stageKey);
  // COMMITTED: this path's staged upgrade was committed; its upstream diff has
  // cleared (refetch) but we keep the row visible in a "done" state. The frozen
  // committed value drives the delete/add visual (red strikethrough / green add).
  const committedValue = committedDiffs.get(stageKey);
  const isCommitted = committedValue !== undefined && !isStaged && upgradeValue === undefined;
  // Apply optimistic overlay: undefined = no overlay, null = deleted, string = new value.
  const overlayEntry = valueOverlay?.has(fullPath) ? valueOverlay.get(fullPath) : undefined;
  // A just-committed ADD/CHANGE snapshotted its applied value into committedDiffs. Prefer
  // it for the displayed pill text so a newly-added upstream-only path shows its real value
  // immediately, instead of the '' placeholder (ADD) or the stale pre-commit value (CHANGE)
  // that lingers until the unit.data/upgradeEntry refetch converges.
  //
  // This is a DISPLAY-SOURCE choice made at render — NOT an edit to committedDiffs, which
  // must keep the entry so the committed "done" row stays visible in the narrowed view.
  // `converged` is true once the refetch has landed: the live downstream value for this
  // path has diverged from the baseline captured at commit time (or already equals the
  // committed value). Once converged we fall back to the authoritative node.diff.newValue —
  // even a server-normalized one — so the committed snapshot can never go permanently stale.
  // Gated on isCommitted so a NEW upstream diff for the same path (which flips isCommitted
  // false) also falls back immediately — otherwise the pill, and the getInlineDiff preview
  // it feeds, would show the stale committed value. A committed DELETE (removal sentinel)
  // is NOT a value to display — it keeps the absent/struck-through treatment, excluded here.
  const converged = committedBaseline.has(stageKey)
    && (downstreamValueByPath.get(fullPath) !== committedBaseline.get(stageKey)
      || downstreamValueByPath.get(fullPath) === committedValue);
  const hasCommittedValue = isCommitted && !isRemovalSentinel(committedValue) && !converged;
  const _rawCurrentValue = overlayEntry != null
    ? overlayEntry
    : hasCommittedValue
      ? committedValue
      : (node.diff?.newValue ?? '');
  // Upstream-only field: present upstream, absent downstream. Shown with an absent indicator.
  // Also absent when the overlay marks the field as deleted (null). A path with a committed
  // (non-removal) value is no longer absent — it now has a real downstream value to show.
  const isAbsentCurrent = overlayEntry === null
    || (overlayEntry === undefined && !hasCommittedValue && upstreamOnlyPaths.has(fullPath));
  // Always reflect the CURRENT value here (absent → "—"). Staging must NOT collapse
  // this to the upstream value: the row keeps showing the current→proposed diff (via
  // previewSegments / current-preview) so the user can still review every change
  // before committing. Only the pill (up-arrow → undo) and the staged tint change.
  const displayedCurrentValue = isAbsentCurrent ? ABSENT : _rawCurrentValue;
  const overriddenUpstreamValue = variationFieldDiffs.get(fullPath);
  const showOverriddenUpstreamPill = overriddenUpstreamValue !== undefined && upgradeValue === undefined;

  // STAGED MANUAL EDIT: the user typed a value (or a delete sentinel) for this
  // path; the write is DEFERRED until commit. Distinct from an upgrade pick: the
  // edited value is what the row previews as "proposed" and overrides any upstream
  // value at commit time.
  const stagedEditValue = stagedEditedValues.get(stageKey);
  const hasStagedEdit = stagedEditValue !== undefined;
  const isStagedDelete = hasStagedEdit && isStagedDeleteSentinel(stagedEditValue);
  // A staged edit differs from upstream the moment it is typed; liveVariationPaths
  // is built from COMMITTED data and cannot see it until commit.
  const differsFromUpstream = hasStagedEdit || liveVariationPaths.has(fullPath);

  // "Kept on merge" (protection) — EFFECTIVE state for this row: a staged
  // protection change (if any) always wins over the committed baseline, so a
  // lock the user just staged renders solid immediately, with no round trip.
  // `currentlyProtected` defaults to false when protection data hasn't been
  // fetched yet (Finding 2's safe default — see NodeRowProps.isProtected).
  const currentlyProtected = (isProtected ?? isProtectedFallback)(fullPath);
  const stagedProtectionForRow = stagedProtection.get(stageKey);
  const effectiveKept = stagedProtectionForRow ?? currentlyProtected;

  // Inline edit STAGES (no immediate write): record the typed value and mark the
  // path staged so the row renders its pending current→edited preview. Editing is
  // available when an onStageEdit handler exists.
  const handleSave = useCallback(async () => {
    const val = editingValueRef.current;
    if (val === null || !onStageEdit) return;
    if (val === displayedCurrentValue) { setEditingValue(null); return; }
    // Saving an empty string on an absent-downstream path is a no-op: the only
    // valid action is typing a real value (add) or cancelling. Staging '' would
    // cause a wrong ADD preview, a wrong setValueAtPath call at commit, and a
    // wrong strikethrough DELETE post-commit via isRemovalSentinel('').
    if (val === '' && isAbsentCurrent) { setEditingValue(null); return; }
    onStageEdit(stageKey, val);
    setEditingValue(null);
  }, [displayedCurrentValue, stageKey, isAbsentCurrent, onStageEdit]);

  // A wrapper's key is a human LABEL, not a dot-path, so it must stay atomic:
  // splitting it would render "Deployment my.app" as a fake two-segment path chain
  // and feed the fragment "Deployment my" to the path-keyed prefix lookups below.
  const segments = useMemo(
    () => (node.pathTransparent ? [node.key] : node.key.split('.')),
    [node.key, node.pathTransparent],
  );

  const contextPrefix = useMemo(() => {
    // Never derive a path prefix from a wrapper's label (see `segments` above).
    if (expandedSegment === null || node.pathTransparent) return null;
    const segs = segments.slice(0, expandedSegment + 1).join('.');
    return pathPrefix ? `${pathPrefix}.${segs}` : segs;
  }, [expandedSegment, segments, pathPrefix, node.pathTransparent]);

  const contextTree = useMemo(
    () => contextPrefix ? buildContextTree(contextPrefix, allPaths, changedPaths, changedDiffs, prefixIndex) : null,
    [contextPrefix, allPaths, changedPaths, changedDiffs, prefixIndex],
  );

  // Computed only when this leaf is the inspected one — values for the same
  // field across other variants in this column (units sharing the same slug).
  // `deploymentName` carries `unit.slug` from the caller; `spaceId` is `unit.spaceId`.
  const siblingVariants = useMemo(() => {
    if (inspectPath !== fullPath) return undefined;
    if (!deployments || !unitsByDeployment || !deploymentName) return undefined;
    const slug = deploymentName;
    const result: Array<{
      deploymentId: string;
      displayName: string;
      value: string | undefined;
      isCurrent: boolean;
    }> = [];
    for (const dep of deployments) {
      const sibs = unitsByDeployment.get(dep.deploymentId);
      if (!sibs) continue;
      const sib = sibs.find((s) => s.slug === slug);
      if (!sib) continue;
      const value = parseUnitData(sib.data ?? '').get(fullPath);
      result.push({
        deploymentId: dep.deploymentId,
        displayName: dep.displayName,
        value,
        // ComponentDeployment.deploymentId is set from Space.SpaceID (see componentData.ts), matching MergedUnit.spaceId
        isCurrent: dep.deploymentId === spaceId,
      });
    }
    return result;
  }, [deployments, unitsByDeployment, deploymentName, inspectPath, fullPath, spaceId]);

  if (node.type === 'leaf' && node.diff != null) {
    // Use the pre-computed values from the top of NodeRow
    const isInspecting = inspectPath === fullPath;
    const isRemoving = pendingRemovals.has(fullPath);
    const isNewlyAdded = recentlyAddedPaths.has(fullPath);
    // Array-element rows (e.g. env.0.name, dot-index) — disable Remove: deleting a
    // single key inside an array element would corrupt the array structure.
    const isArrayRow = pathContainsArrayIndex(fullPath);

    // A just-committed row keeps the correct symbol after refetch clears the
    // upstream diff:
    //   - committed removal sentinel → DELETE (red −, strikethrough)
    //   - committed path that was upstream-only at commit → ADD (green +)
    //   - otherwise → a plain value-CHANGE (no +/- symbol)
    const isCommittedDelete = isCommitted && isRemovalSentinel(committedValue);
    const isCommittedAdd = isCommitted && !isRemovalSentinel(committedValue) && committedAddPaths.has(stageKey);

    // Inline diff preview: token-level LCS shown superimposed on the current pill
    // when hovering the upgrade pill (via CSS :has()). Covers both the live upgrade
    // and the blocked overridden-upstream cases.
    // A removal is the absence sentinel ('-') OR an empty string ('') — see
    // isRemovalSentinel. Both mean the upstream drops this path on upgrade, so the
    // current value renders struck-through (and the pill tooltip shows "deleted").
    const isDeleteUpgrade = isRemovalSentinel(upgradeValue);
    // Blocked deletion: the upstream wants to delete this field, but a local
    // variation keeps it. Mirror the regular deletion preview behaviour on hover.
    const isBlockedDeleteUpgrade = showOverriddenUpstreamPill && isRemovalSentinel(overriddenUpstreamValue);
    // A staged MANUAL edit takes precedence over any upstream value as the
    // "proposed" preview — the user's typed value is what will be committed. A
    // staged delete previews as a removal (struck-through current value).
    const incomingValue = hasStagedEdit
      ? (isStagedDelete ? undefined : stagedEditValue)
      : (isBlockedDeleteUpgrade)
        ? undefined
        : (upgradeValue !== undefined && !isDeleteUpgrade)
          ? upgradeValue
          : (showOverriddenUpstreamPill ? overriddenUpstreamValue : undefined);
    const previewSegments = incomingValue !== undefined
      ? getInlineDiff(displayedCurrentValue, incomingValue)
      : undefined;
    // A BLOCKED deletion is not a deletion that is happening: upstream dropped
    // the path, the local value keeps it, and the outcome is that the value
    // STAYS. In auto mode the removal visuals this flag drives (the red `−`,
    // the struck-through value, the delete-coloured pill) are all revealed by
    // HOVERING the row's lock — at rest a blocked row is an ordinary row, and
    // the strikethrough is a preview of what syncing WOULD do.
    //
    // A read-only mount has no lock to hover and nothing to sync, so it never
    // reaches the preview state those visuals belong to — it only inherited
    // their at-rest half. That is the reported bug: in rollout mode's All view
    // a locally-overridden path whose upstream value is gone rendered as a red,
    // struck-through deletion of a value that is not going anywhere, on paths
    // the ChangeOrder does not even touch (rollout's `variationEntry` carries
    // only paths the promotion leaves alone — see `buildVariationEntry`).
    //
    // Excluded HERE, at the source, rather than at each of the four places this
    // flag is painted, so no fifth one can reappear. `readOnly` is the only
    // guard needed: with it false, auto mode's value is unchanged.
    const previewRemoved =
      isStagedDelete || isDeleteUpgrade || (isBlockedDeleteUpgrade && !readOnly) || isCommittedDelete;
    // Upstream-only key being ADDED by the upgrade (present upstream, absent downstream).
    // A staged manual edit on an absent path is also an ADD.
    const previewAdded = (isAbsentCurrent && !isStagedDelete && (hasStagedEdit || upgradeValue !== undefined) && !isDeleteUpgrade) || isCommittedAdd;

    // readOnly (task #62): nothing is ever staged in a read-only mount, so
    // every staging-derived signal below (isUnchangedField, isStagedRow, and
    // therefore rowChangeType) would resolve to "nothing is happening" even
    // when the entry itself carries a real incoming change. Both need to
    // derive from the entry instead — the same previewRemoved / previewAdded
    // / upgradeValue already computed above for the pill preview.
    const readOnlyChanged = previewRemoved || previewAdded || upgradeValue !== undefined;

    // The Upgrade button commits ONLY staged changes, so the hover preview must dim
    // exactly the rows that WON'T change when it's clicked. A row stays opaque iff it
    // will change: a staged pick (isStaged — includes a checked "sync with upstream"
    // override), a staged manual edit (hasStagedEdit), or an already-committed row.
    // An UNCHECKED upstream upgrade will NOT be committed, so it dims like any other
    // unchanged row — having an upstream value available is irrelevant once unchecked.
    const isUnchangedField = readOnly
      ? !readOnlyChanged
      : !isStaged && !hasStagedEdit && !isCommitted;

    // RESOLVED change type for the cohesive staged-states styling. Only a STAGED
    // row (staged upgrade pick, staged manual edit/delete/add, or a staged
    // protection-only change) gets a type → a row tint + 2px left-edge accent
    // bar + a type-coloured control. Precedence (lowest listed last):
    //   • staged manual DELETE → delete (red)
    //   • staged manual edit/upgrade on an ABSENT path → add (green)
    //   • staged manual EDIT (non-delete) → edit (yellow)
    //   • staged upgrade pick that REMOVES the field → delete (red)
    //   • staged upgrade pick that ADDS a new field → add (green)
    //   • staged upgrade pick (value change) → upgrade (purple)
    //   • staged PROTECTION change, nothing else staged → protect (rust) — the
    //     new, LOWEST-precedence rung (card 6): additive, doesn't touch any
    //     branch above. Editing an already-kept value shows EDIT here, not
    //     protect — the solid border (kept, Section 2) carries the lock
    //     signal independently of the rail.
    // Blocked + committed rows resolve to NO type (no tint, no bar) — handled below.
    const isStagedRow = (isStaged || hasStagedEdit) && !isCommitted;
    const rowChangeType: RowChangeType | undefined = readOnly
      ? previewRemoved
        ? 'delete'
        : previewAdded
          ? 'add'
          : upgradeValue !== undefined
            ? (upgradeIsHistorical ? 'edit' : 'upgrade')
            : undefined
      : !isStagedRow
        ? (stagedProtection.has(stageKey) ? 'protect' : undefined)
        : isStagedDelete || (isStaged && isDeleteUpgrade)
          ? 'delete'
          : previewAdded
            ? 'add'
            : hasStagedEdit
              ? 'edit'
              : 'upgrade';

    // readOnly (task #62) disables every editing affordance regardless of
    // which handlers happen to be wired — onStageEdit is always non-null
    // internally (it's this component's OWN callback, not a caller-supplied
    // prop), so without this check a "read-only" render would still let a
    // user open the kebab menu / click-to-edit and silently no-op.
    const hasEditHandlers = !readOnly && (onStageEdit != null || onSetFieldValue != null || onDeleteFieldValue != null);
    // Inline value editing is available when an edit-staging handler is wired.
    const canEditInline = !readOnly && onStageEdit != null;

    return (
      <Fragment>
      <UpgradePreviewDimRow className={isUnchangedField ? 'field-unchanged' : undefined}>
      <ReviewRow
        $plain
        data-testid="component-leaf-row"
        data-change-type={rowChangeType ?? 'none'}
        data-differs-upstream={differsFromUpstream ? 'true' : 'false'}
        data-protected={effectiveKept ? 'true' : 'false'}
        sx={{
          // Tight rows: kill the row's vertical padding and lower the min-height
          // floor (border-box means padding alone wouldn't shrink the 28px floor).
          py: 0, minHeight: 22,
          alignItems: 'center', cursor: 'default',
          // COMMITTED ("done") rows dim to .88 opacity per spec; a context leaf
          // stays at its existing .8; everything else full opacity.
          opacity: isCommitted ? 0.88 : node.context ? 0.8 : 1,
          ...(isRemoving
            ? { background: componentTheme.dangerFaint }
            : rowChangeType
              // STAGED rows: a low-alpha type-coloured tint + a 2px left-edge accent
              // bar (the glance-scannable signal). Hover deepens the tint slightly.
              ? {
                  background: ROW_TYPE_TOKENS[rowChangeType].tint,
                  '&::after': {
                    content: '""',
                    position: 'absolute',
                    left: 0,
                    top: 0,
                    bottom: 0,
                    width: '2px',
                    background: ROW_TYPE_TOKENS[rowChangeType].bar,
                    borderRadius: '0 1px 1px 0',
                    pointerEvents: 'none',
                  },
                  '&:hover': { background: ROW_TYPE_TOKENS[rowChangeType].tintHover, '& .kebab-btn': { opacity: 0.9 } },
                }
              // NORMAL unstaged leaf/VALUE row: a subtle light-grey RESTING
              // background (bgSubtle #f6f8fa) so value rows read distinctly from
              // the plain/white folder/path rows. This is only the BASE — the
              // staged tint (above), isRemoving (above) and inspecting (below)
              // all set their own background and REPLACE this grey rather than
              // blend, so a staged row reads as its type colour, not muddy grey.
              // Hover still lifts to bgInset.
              : { background: componentTheme.bgSubtle, '&:hover': { background: componentTheme.bgInset, '& .kebab-btn': { opacity: 0.9 } } }
          ),
          ...(isInspecting && !isRemoving && !rowChangeType && { background: 'rgba(124,58,237,.04)' }),
          // BLOCKED + COMMITTED rows get NO tint and NO left bar — the amber lock
          // (blocked) and the green ✓ / red − (committed) carry the signal instead.
          // The key-name +/− prefix only appears once this row's inline preview is
          // ACTIVE — i.e. the same pill-group states that reveal the inline diff:
          // hovering the upgrade pill, a staged row, or a committed delete. Gated on
          // (previewRemoved || previewAdded) so plain value-change rows never reserve
          // the slot even when their preview is open.
          //
          // IMPORTANT: each reveal selector uses a SINGLE, FLAT :has() — CSS does not
          // allow a :has() nested inside another :has(), so a combined
          // `:has(.pill-group:is(:has(.upgrade-pill:hover), …))` silently dropped the
          // hover branch (only the plain-class staged/committed branches matched).
          // The hover trigger is the same `.upgrade-pill:hover` the inline-diff reveal
          // (lines ~1477-1479) keys on; staged/committed are plain-class :has().
          ...((previewRemoved || previewAdded) && {
            '&:has(.upgrade-pill:hover) .diff-prefix, &:has(.pill-group.pill-staged) .diff-prefix, &:has(.pill-group.pill-committed-del) .diff-prefix': {
              width: 14,
            },
          }),
        }}
      >
        <PropertyCell sx={{
          // Treeview leaf keys hug the left and size to content (like folder rows)
          // rather than hard-reserving the diff-view's 40% column. That frees the
          // wasted gap so the value cell (AfterCell, flex:1) can use the full
          // remaining width — long values stop wrapping prematurely in a wide pane.
          width: 'auto', flexShrink: 1, minWidth: 0, textAlign: 'left',
          display: 'flex', alignItems: 'center', paddingLeft: `${16 + depth * INDENT_PX}px`, fontSize: 12.5, fontFamily: componentTheme.fontMono, overflow: 'visible',
        }}>
          {/* ⋯ kebab button — left of key; falls back to spacer when no handlers */}
          {hasEditHandlers ? (
            <>
              <Box
                component="button"
                className="kebab-btn"
                onClick={(e: React.MouseEvent<HTMLElement>) => {
                  e.stopPropagation();
                  setLeafMenuAnchorEl(e.currentTarget);
                  // Lazily fetch this unit's MutationSources the moment its
                  // protection state is actually needed (Finding 2) — never
                  // unconditionally, and the caller dedupes repeat calls.
                  onRequestProtectionData?.();
                }}
                sx={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  width: 22,
                  height: 22,
                  borderRadius: '5px',
                  color: componentTheme.fgSubtle,
                  opacity: leafMenuAnchorEl ? 1 : 0,
                  flexShrink: 0,
                  transition: 'opacity .12s, background .12s, color .12s',
                  '&:hover': { opacity: 1, background: componentTheme.bgInset, color: componentTheme.fgDefault },
                  ...(leafMenuAnchorEl && { background: componentTheme.upgradeMuted, color: componentTheme.upgrade }),
                }}
              >
                <svg viewBox="0 0 16 16" fill="currentColor" style={{ width: 15, height: 15 }}>
                  <circle cx="8" cy="3.2" r="1.2" /><circle cx="8" cy="8" r="1.2" /><circle cx="8" cy="12.8" r="1.2" />
                </svg>
              </Box>
              <Menu
                anchorEl={leafMenuAnchorEl}
                open={!!leafMenuAnchorEl}
                onClose={() => setLeafMenuAnchorEl(null)}
                slotProps={{
                  paper: {
                    sx: {
                      borderRadius: '9px',
                      border: `1px solid ${componentTheme.borderDefault}`,
                      boxShadow: '0 8px 28px -10px rgba(15,17,21,.22), 0 2px 6px rgba(15,17,21,.06)',
                      minWidth: 210,
                      '& .MuiList-root': { padding: '5px' },
                    },
                  },
                }}
              >
                {/* Inspect */}
                <MenuItem
                  onClick={() => { setLeafMenuAnchorEl(null); onInspectPath(isInspecting ? null : fullPath); }}
                  sx={{ fontSize: 14, borderRadius: '6px', gap: '9px', padding: '7px 9px' }}
                >
                  <Box component="span" sx={{ width: 15, color: componentTheme.fgSubtle, display: 'inline-flex' }}>
                    <InspectIcon />
                  </Box>
                  Inspect value
                </MenuItem>
                <Divider sx={{ my: '4px', mx: '2px' }} />
                {/* Keep on merge / Let merges update this — protection toggle.
                    Disabled for a key that doesn't exist yet downstream (nothing
                    to protect until it's added) and for an array-indexed row
                    (Finding 1: the write-side path-key format the merge engine's
                    protection lookup can match doesn't exist for a positional
                    array path — see buildResourceProtectionPayload's doc comment
                    and protectedPaths.ts's matching read-side gap). Wording is
                    D3's shipped prior art, from `Protected`'s own doc comment. */}
                <Tooltip
                  title={
                    isAbsentCurrent
                      ? 'Add the key first. A key must exist before merges can be told to leave it alone.'
                      : isArrayRow ? 'Cannot protect array-indexed rows.' : ''
                  }
                  placement="right"
                >
                  <span>
                    <MenuItem
                      disabled={isAbsentCurrent || isArrayRow}
                      onClick={() => {
                        setLeafMenuAnchorEl(null);
                        if (isAbsentCurrent || isArrayRow) return;
                        onToggleProtection(stageKey, !effectiveKept);
                      }}
                      sx={{ fontSize: 14, borderRadius: '6px', gap: '2px', padding: '7px 9px', display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}
                    >
                      <Box component="span">{effectiveKept ? 'Let merges update this' : 'Keep on merge'}</Box>
                      <Box component="span" sx={{ fontSize: 11, fontWeight: 400, color: componentTheme.fgSubtle, lineHeight: 1.3 }}>
                        {effectiveKept
                          ? 'The next merge from base may overwrite this value. Kept on merge today.'
                          : "This unit's value stays. Merges from base leave it alone."}
                      </Box>
                    </MenuItem>
                  </span>
                </Tooltip>
                <Divider sx={{ my: '4px', mx: '2px' }} />
                <Tooltip title={addBlockedReason} placement="right">
                  <span>
                    <MenuItem
                      disabled={!canAddRows}
                      onClick={() => {
                        setLeafMenuAnchorEl(null);
                        if (!canAddRows) return;
                        onOpenComposer({ parentPath: pathPrefix, parentId: pathPrefix, insertAfterId: null, insertBeforeId: rowId, depth, mode: 'key', resource: docScope?.resource });
                      }}
                      sx={{ fontSize: 14, borderRadius: '6px', gap: '9px', padding: '7px 9px' }}
                    >
                      Add row above
                    </MenuItem>
                  </span>
                </Tooltip>
                <Tooltip title={addBlockedReason} placement="right">
                  <span>
                    <MenuItem
                      disabled={!canAddRows}
                      onClick={() => {
                        setLeafMenuAnchorEl(null);
                        if (!canAddRows) return;
                        onOpenComposer({ parentPath: pathPrefix, parentId: pathPrefix, insertAfterId: rowId, insertBeforeId: null, depth, mode: 'key', resource: docScope?.resource });
                      }}
                      sx={{ fontSize: 14, borderRadius: '6px', gap: '9px', padding: '7px 9px' }}
                    >
                      Add row below
                    </MenuItem>
                  </span>
                </Tooltip>
                <Divider sx={{ my: '4px', mx: '2px' }} />
                {/* Remove */}
                <Tooltip title={isAbsentCurrent ? 'This key only exists upstream' : isArrayRow ? 'Cannot remove array-indexed rows' : ''} placement="right">
                  <span>
                    <MenuItem
                      disabled={isAbsentCurrent || isArrayRow}
                      onClick={() => {
                        setLeafMenuAnchorEl(null);
                        // STAGE the removal (deferred until commit) for consistency
                        // with staged edits/upgrades — a removal-sentinel value. Falls
                        // back to the immediate-delete flow only when no edit-staging
                        // handler is wired (e.g. read-only contexts).
                        if (onStageEdit) onStageEdit(stageKey, STAGED_DELETE_SENTINEL);
                        else onRemove(fullPath);
                      }}
                      sx={{ fontSize: 14, borderRadius: '6px', gap: '9px', padding: '7px 9px', color: componentTheme.danger, '&:hover': { background: componentTheme.dangerFaint } }}
                    >
                      Remove key
                    </MenuItem>
                  </span>
                </Tooltip>
              </Menu>
            </>
          ) : (
            <Box component="span" sx={{ width: 10, flexShrink: 0 }} />
          )}
          <Tooltip
            title={
              // readOnly (task #62): neutral, accurate-for-viewing copy — no
              // "staging"/"committed on Upgrade" language, since nothing here
              // stages or commits anything.
              readOnly
                ? previewRemoved ? 'Removed since the last release'
                  : previewAdded ? 'New since the last release'
                  : isStaged ? 'Changed since the last release'
                  : ''
                : isStaged ? 'Staged — will be committed on Upgrade (click the arrow to unstage)'
                : previewRemoved ? 'Removed in upstream — staging this upgrade will delete it'
                : previewAdded ? 'New in upstream — staging this upgrade will add it'
                : ''
            }
            placement="top"
            arrow
            disableInteractive
            slotProps={{ tooltip: { sx: { fontSize: 11, fontFamily: componentTheme.fontSans, pointerEvents: 'none' } } }}
          >
            <Box
              component="span"
              className="diff-prefix"
              sx={{
                // The +/− sign on the key name is HIDDEN by default — it only appears
                // once the inline preview for this row is active (the upgrade pill is
                // hovered, the row is staged, or it's a committed delete). Until then
                // the prefix collapses to zero width so the key sits flush against the
                // kebab menu — no dead gap, and no +/− on the collapsed key name. The
                // reveal rules live on the parent ReviewRow (driven by the same
                // pill-group active states that reveal the inline diff itself). A
                // committed ADD has no pill to hover after refetch, so its green + is
                // its persistent "done" badge (mirroring the committed delete's
                // persistent red −) and stays shown.
                width: isCommittedAdd ? 14 : 0,
                overflow: 'hidden',
                flexShrink: 0,
                fontSize: 12,
                fontWeight: 700,
                textAlign: 'center',
                userSelect: 'none',
                cursor: 'default',
                // The +/- symbol carries the add/remove signal once revealed: green +, red −.
                color: previewRemoved ? componentTheme.danger : previewAdded ? componentTheme.success : componentTheme.fgMuted,
              }}
            >{previewRemoved ? '−' : previewAdded ? '+' : ''}</Box>
          </Tooltip>
          <PathValue className="dim-path" onClick={(e: React.MouseEvent) => { e.stopPropagation(); onInspectPath(isInspecting ? null : fullPath); }} style={{ color: isRemoving ? componentTheme.danger : componentTheme.fgDefault, opacity: isRemoving ? 0.7 : 0.65, minWidth: 0, overflowWrap: 'break-word', transition: 'opacity .12s', cursor: 'pointer', textDecoration: isRemoving ? 'line-through' : undefined }}>
            {filterText ? highlightText(node.key, filterText) : node.key}
          </PathValue>
          {/* NEW icon — compact sparkle marking recently-added paths */}
          {isNewlyAdded && (
            <Tooltip title="New from upstream" placement="top" {...TOOLTIP_HOVER_DELAY}>
              <Box
                component="span"
                aria-label="New from upstream"
                sx={{
                  ml: '5px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: componentTheme.successEmphasis,
                  flexShrink: 0,
                }}
              >
                <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ width: 12, height: 12, display: 'block' }}>
                  <path d="M7 1.5l1.4 3.1 3.1 1.4-3.1 1.4L7 12.5 5.6 9.4 2.5 8l3.1-1.4z" />
                </svg>
              </Box>
            </Tooltip>
          )}
        </PropertyCell>
        <AfterCell sx={{ display: 'flex', alignItems: 'center', gap: '4px', overflow: 'visible',
          // Protect the value from compression: when the row is too narrow, the key
          // column (flexShrink: 1) gives up its width first. The value only wraps once
          // the key has fully collapsed, so the value stays readable as long as possible.
          flexShrink: 0 }}>
          <Box
            // readOnly (task #62, fifth gap): `.pill-staged` is what makes the
            // before→after reveal PERSISTENT rather than hover-only (`:1740-1744`
            // below) — and like `rowChangeType`/`isUnchangedField`, it was staging-
            // derived, so a read-only row (never staged) fell back to hover-only,
            // which read-only itself has already removed the pill/checkbox that
            // would ever be hovered. `readOnly && readOnlyChanged` is the same
            // entry-driven signal already used for those two fixes.
            className={`pill-group${isStaged || (readOnly && readOnlyChanged) ? ' pill-staged' : ''}${isCommittedDelete ? ' pill-committed-del' : ''}`}
            sx={{
              display: 'flex',
              // VALUE right-aligned hard against the right; the stage CONTROL is the
              // rightmost thing, pinned to a fixed-width slot so the value's right
              // edge lines up across rows (blocked vs non-blocked doesn't shift it).
              alignItems: 'center',
              justifyContent: 'flex-end',
              gap: '4px',
              flex: 1,
              minWidth: 0,
              ...(isRemoving && {
                '& .current-text': { textDecoration: 'line-through', color: componentTheme.danger, opacity: 0.7 },
              }),
              // Staged rows show the inline current→proposed diff persistently via
              // `.pill-staged`, so a Select-all'd row still reviews before→after. An
              // UNSTAGED row shows only its current value (matching every tab),
              // revealing the diff just on hover of the control. `.pill-committed-del`
              // does the same for a committed delete so its struck-through ghost stays
              // visible (the row has no pill to hover after commit). The
              // `:has(.upgrade-pill:hover)` reveal still fires when hovering the
              // checkbox (it keeps the `.upgrade-pill` class), regardless of the
              // checkbox now sitting AFTER the value in DOM order.
              '&:is(:has(.upgrade-pill:hover), .pill-staged, .pill-committed-del) .current-text': { display: 'none' },
              '&:is(:has(.upgrade-pill:hover), .pill-staged, .pill-committed-del) .current-preview': { display: 'inline' },
              '&:is(:has(.upgrade-pill:hover), .pill-staged, .pill-committed-del) .current-removed': { display: 'inline' },
              '&:is(:has(.upgrade-pill:hover), .pill-staged, .pill-committed-del) .current-old-preview': { display: 'inline' },
              '&:is(:has(.upgrade-pill:hover), .pill-staged) .has-remove-preview': {
                borderColor: 'rgba(220,38,38,.3)',
                background: componentTheme.dangerFaint,
              },
            }}
          >
            {/* VALUE (or inline editor) — right-aligned, just left of the control. */}
            {editingValue !== null ? (
              <InputBase
                autoFocus
                multiline
                value={editingValue}
                onChange={(e) => { editingValueRef.current = e.target.value; setEditingValue(e.target.value); }}
                onKeyDown={(e) => {
                  // Enter saves; Shift+Enter inserts a newline for multi-line values.
                  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void handleSave(); }
                  if (e.key === 'Escape') { editingValueRef.current = null; setEditingValue(null); }
                }}
                onBlur={() => { void handleSave(); }}
                inputProps={{ 'data-testid': 'field-edit-input', style: { textAlign: 'right' } }}
                sx={{
                  // Match the (denser) value text size it replaces.
                  fontSize: 12,
                  fontFamily: componentTheme.fontMono,
                  // Size to the VALUE, not the cell: the box (and its dotted underline)
                  // grows just wide enough for the longest line — measured in `ch`, exact
                  // for the mono font — and never flex-grows to fill the cell. It still
                  // caps at the cell width (maxWidth 100%), wrapping long values from there.
                  flex: '0 1 auto',
                  width: `${Math.min(80, Math.max(2, ...editingValue.split('\n').map((l) => l.length)) + 1)}ch`,
                  maxWidth: '100%',
                  minWidth: 0,
                  minHeight: 22,
                  boxSizing: 'border-box',
                  // BOXLESS active editor: the inline edit should read as the plain
                  // value text "going live", not a popup field. So drop all box chrome
                  // (no border, no radius, no fill, no focus ring) and instead carry the
                  // SAME dotted underline as the hover affordance so it still signals
                  // "actively editable". The underline lives on the textarea via
                  // border-bottom (text-decoration on a textarea doesn't render).
                  border: 'none',
                  borderRadius: 0,
                  padding: 0,
                  background: 'transparent',
                  boxShadow: 'none',
                  // Keep the visible text caret in the accent colour.
                  caretColor: componentTheme.accent,
                  '& textarea': {
                    lineHeight: 1.35,
                    overflowWrap: 'anywhere',
                    textAlign: 'right',
                    // The dotted underline — matches the hover affordance.
                    borderBottom: '1px dotted rgba(15,17,21,.28)',
                    caretColor: componentTheme.accent,
                  },
                }}
              />
            ) : (
              <Tooltip
                title={
                  // PLAIN EDITABLE value → T1 neutral "Edit this value" action.
                  // Non-editable leaves (context names, committed/removing rows) keep
                  // the plain value + "Current" meta tooltip (no action available).
                  canEditInline && !isRemoving && !node.context ? (
                    <>
                      <ActionTooltipContent
                        type="edit"
                        icon={<T1EditIcon />}
                        action="Edit this value"
                        value={`current: ${isAbsentCurrent || isEmptyValue(displayedCurrentValue) ? NO_VALUE_LABEL : displayedCurrentValue}`}
                        noValue={isAbsentCurrent || isEmptyValue(displayedCurrentValue)}
                        status={
                          // Context-aware status — correct for rows that DO have an
                          // upstream diff or a staged change, not just plain values.
                          hasStagedEdit && !isStagedDelete ? 'staged manual edit'
                            : isStaged ? 'staged for upgrade'
                              : upgradeValue !== undefined || showOverriddenUpstreamPill ? 'has upstream change · see checkbox'
                                : headRevisionDescription ?? 'no upstream change pending'
                        }
                      />
                      {/* Protect/Unprotect — a second, deliberately terser affordance
                          for the same staged-toggle action as the kebab's "Keep on
                          merge" item (onToggleProtection/stageKey are identical).
                          Guarded by the same isAbsentCurrent/isArrayRow conditions
                          that disable the kebab item — omitted rather than shown
                          disabled, since there's no room here for an explanatory
                          tooltip-on-a-tooltip. Needs pointerEvents:'auto' to opt back
                          in: the ambient tooltipSx sets pointerEvents:'none' on the
                          whole bubble so it stays click-through to the value beneath
                          everywhere else. */}
                      {!isAbsentCurrent && !isArrayRow && (
                        <Box
                          data-testid="tooltip-protect-toggle"
                          onClick={(e: React.MouseEvent) => {
                            e.stopPropagation();
                            onToggleProtection(stageKey, !effectiveKept);
                          }}
                          sx={{
                            pointerEvents: 'auto',
                            cursor: 'pointer',
                            borderTop: `1px solid ${componentTheme.borderSubtle}`,
                            px: 1.5, py: '7px',
                            fontFamily: componentTheme.fontSans,
                            fontSize: 11.5, fontWeight: 660,
                            color: componentTheme.accent,
                            '&:hover': { textDecoration: 'underline' },
                          }}
                        >
                          {effectiveKept ? 'Unprotect' : 'Protect'}
                        </Box>
                      )}
                    </>
                  ) : (
                    <PillTooltipContent fullValue={displayedCurrentValue} meta={{ label: 'Current', createdAt: headRevisionCreatedAt, description: headRevisionDescription }} />
                  )
                }
                placement="top"
                {...TOOLTIP_HOVER_DELAY}
                slotProps={{ tooltip: { sx: tooltipSx } }}
              >
                <span
                  // Pure attribute instrumentation: lets the guided tour (and
                  // tests) target ONE specific row's click-to-edit value by
                  // its path, since `field-edit-input` only exists once this
                  // click has already opened the inline editor.
                  data-testid={`field-edit-trigger-${fullPath}`}
                  style={{ minWidth: 0, display: 'flex', justifyContent: 'flex-end' }} onClick={() => { if (canEditInline && !isRemoving) {
                  // Seed the inline editor with what the user CURRENTLY SEES, so they
                  // edit from the displayed value. Precedence mirrors the visible text:
                  //   • staged manual edit (not a delete) → the typed/proposed value
                  //   • staged upgrade (no manual edit) → the proposed upgrade value
                  //     (the row persistently shows that via .current-preview), unless
                  //     it's a removal (struck-through) in which case seed empty
                  //   • absent unstaged path → empty (creating the value)
                  //   • otherwise → the current value
                  // Editing always re-stages as a manual edit (yellow), which wins at commit.
                  const seed = hasStagedEdit && !isStagedDelete
                    ? stagedEditValue!
                    : (isStaged && incomingValue !== undefined && !previewRemoved)
                      ? incomingValue
                      : (isAbsentCurrent && !isStaged ? '' : displayedCurrentValue);
                  editingValueRef.current = seed; setEditingValue(seed);
                } }}>
                  <Box component="span" sx={{ cursor: canEditInline && !isRemoving ? 'text' : 'default', minWidth: 0 }}>
                    <CurrentPill
                      value={displayedCurrentValue}
                      filterText={filterText}
                      changeType={rowChangeType}
                      previewChangeType={
                        previewRemoved ? 'delete'
                          : previewAdded ? 'add'
                            : hasStagedEdit ? 'edit'
                              : (upgradeIsHistorical ? 'edit' : 'upgrade')
                      }
                      muted={(showOverriddenUpstreamPill && !isStaged) || isCommitted}
                      isAbsent={isAbsentCurrent && !isStaged}
                      editable={canEditInline && !isRemoving && !node.context}
                      previewSegments={previewSegments}
                      previewRemoved={previewRemoved}
                      // Never populated: auto mode never passes readOnly, so
                      // this was dead code by construction until rollout mode
                      // became the first readOnly caller (U11/U14) and
                      // .pill-staged started revealing it for real. Auto mode
                      // itself never renders this struck-through line (see
                      // .current-old-preview below) — a staged row there is
                      // one line: incoming value, token pill, nothing above
                      // it. Reference image confirms it (U20). Rendering it
                      // in rollout was a divergence nobody asked for, not a
                      // deliberate difference — drop it so rollout matches.
                      oldValueForPreview={undefined}
                      differsFromUpstream={differsFromUpstream}
                      kept={effectiveKept}
                    />
                  </Box>
                </span>
              </Tooltip>
            )}

            {/* RIGHT-EDGE CONTROL slot — fixed min-width so the value's right edge
                lines up across rows. Holds: the stage checkbox (blocked = the
                checkbox alone, dimmed amber — no lock glyph), or the committed
                "done" ✓ for a value-change. */}
            <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'flex-end', flexShrink: 0, minWidth: 24 }}>
              {/* readOnly (task #62): no staging checkbox at all — the row's
                  own tint/left-accent (rowChangeType) and the value pill's
                  color already convey changed/new/removed without implying
                  a "stage this" action that has nowhere to commit. */}
              {/*
                READ-ONLY (rollout) blocked row: the same amber lock and the
                same explanation auto mode gives this case, minus the checkbox.
                Reuses `ActionTooltipContent` and `T1LockIcon` rather than
                restating either — including auto's own `status` wording and its
                `noValue` handling, which is what renders the italic "no value"
                placeholder when upstream has dropped the path entirely.
                
                The checkbox is deliberately NOT carried over: it stages a
                "sync with upstream", and rollout mode has nowhere to commit
                one. The hero verb changes with it — auto's "Sync with
                upstream" names what its checkbox does, and repeating it here
                would promise an action this mount cannot perform.

                Without this the row said nothing at all: the readOnly gate on
                the block below removed the explanation while the red delete
                styling above still fired, so the one case that most needs a
                word got the loudest possible wrong one.
              */}
              {readOnly && showOverriddenUpstreamPill && (
                <Tooltip
                  title={
                    <ActionTooltipContent
                      type="blocked"
                      icon={<T1LockIcon />}
                      action="Local value kept"
                      value={overriddenUpstreamValue}
                      noValue={isEmptyValue(overriddenUpstreamValue)}
                      status="your local value overrides upstream"
                    />
                  }
                  placement="top"
                  disableInteractive
                  {...TOOLTIP_HOVER_DELAY}
                  slotProps={{ tooltip: { sx: { ...tooltipSx, pointerEvents: 'none' } } }}
                >
                  <Box
                    component="span"
                    className="upgrade-pill upgrade-pill-blocked"
                    data-testid="component-override-lock"
                    sx={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      flexShrink: 0,
                      color: componentTheme.attention,
                    }}
                  >
                    <T1LockIcon />
                  </Box>
                </Tooltip>
              )}
              {!readOnly && showOverriddenUpstreamPill && (
                <Tooltip
                  title={
                    // T1 — BLOCKED (locally overridden): amber action. When staged,
                    // the action flips to "Unstage" (staged purple). When there is no
                    // staging handler the row is inspect-only (edit verb, neutral).
                    onSetFieldValue ? (
                      isStaged ? (
                        <ActionTooltipContent
                          type="staged"
                          icon={<T1UndoIcon />}
                          action="Uncheck to discard"
                          value={overriddenUpstreamValue}
                          noValue={isEmptyValue(overriddenUpstreamValue)}
                          status="staged — overrides your local change"
                        />
                      ) : (
                        <ActionTooltipContent
                          type="blocked"
                          icon={<T1LockIcon />}
                          action="Sync with upstream"
                          value={overriddenUpstreamValue}
                          noValue={isEmptyValue(overriddenUpstreamValue)}
                          status="your local value overrides upstream"
                        />
                      )
                    ) : (
                      <ActionTooltipContent
                        type="edit"
                        icon={<T1EditIcon />}
                        action="Inspect this value"
                        value={overriddenUpstreamValue}
                        noValue={isEmptyValue(overriddenUpstreamValue)}
                        status="your local value overrides upstream"
                      />
                    )
                  }
                  placement="top"
                  disableInteractive
                  {...TOOLTIP_HOVER_DELAY}
                  slotProps={{ tooltip: { sx: { ...tooltipSx, pointerEvents: 'none' } } }}
                >
                  <span>
                    <UpgradeCheckbox
                      blocked
                      staged={isStaged}
                      changeType={rowChangeType}
                      onToggle={() => {
                        // True staging: toggle local staged membership only — no write.
                        if (onSetFieldValue) {
                          if (isStaged) onUnstagePath(stageKey);
                          else onStagePath(stageKey);
                        } else {
                          onInspectPath(isInspecting ? null : fullPath);
                        }
                      }}
                    />
                  </span>
                </Tooltip>
              )}
              {!readOnly && upgradeValue !== undefined && (
                <Tooltip
                  title={(() => {
                    // T1 — UPGRADE/DELETE/ADD. When STAGED the action flips to
                    // unstage (staged purple, undo verb). When unstaged the action
                    // is the change it commits: an upstream-removal → red "Remove",
                    // a new field → green "Add", else purple "Stage this upgrade".
                    const proposed = isDeleteUpgrade ? undefined : upgradeValue;
                    const valueNode = isDeleteUpgrade
                      ? 'upstream removes this value'
                      : `upstream: ${isEmptyValue(upgradeValue) ? NO_VALUE_LABEL : upgradeValue}`;
                    if (isStaged) {
                      return (
                        <ActionTooltipContent
                          type="staged"
                          icon={<T1UndoIcon />}
                          action="Uncheck to discard"
                          value={valueNode}
                          status="staged — will apply on next promote"
                        />
                      );
                    }
                    if (isDeleteUpgrade) {
                      return (
                        <ActionTooltipContent
                          type="delete"
                          icon={<T1RemoveIcon />}
                          action="Stage this removal"
                          value={valueNode}
                          status="upstream removed this · not yet staged"
                        />
                      );
                    }
                    if (previewAdded) {
                      return (
                        <ActionTooltipContent
                          type="add"
                          icon={<T1AddIcon />}
                          action="Stage this addition"
                          value={valueNode}
                          noValue={proposed !== undefined && isEmptyValue(proposed)}
                          status="new from upstream · not yet staged"
                        />
                      );
                    }
                    return (
                      <ActionTooltipContent
                        type="upgrade"
                        icon={<T1ArrowUpIcon />}
                        action="Stage this upgrade"
                        value={valueNode}
                        noValue={proposed !== undefined && isEmptyValue(proposed)}
                        status="upstream changed · not yet staged"
                      />
                    );
                  })()}
                  placement="top"
                  disableInteractive
                  {...TOOLTIP_HOVER_DELAY}
                  slotProps={{ tooltip: { sx: { ...tooltipSx, pointerEvents: 'none' } } }}
                >
                  <span>
                    <UpgradeCheckbox
                      staged={isStaged}
                      // The upgrade checkbox tints to the change it commits even when
                      // unstaged: a removal → red, a new field → green, else purple.
                      changeType={isDeleteUpgrade ? 'delete' : previewAdded ? 'add' : 'upgrade'}
                      onToggle={() => {
                        // True staging: toggle local staged membership only — no write.
                        if (isStaged) onUnstagePath(stageKey);
                        else onStagePath(stageKey);
                      }}
                    />
                  </span>
                </Tooltip>
              )}
              {/* STAGED MANUAL EDIT — a CHECKBOX matching every other staged type
                  (no upstream pill applies to this path). It renders CHECKED (a
                  staged edit is, by definition, staged). UNCHECKING discards the
                  edit: the row returns to its original current value and is
                  unstaged (onRevertEdit). The checkbox is YELLOW (#ca8a04) for an
                  edit; a staged manual DELETE tints red to match its row. */}
              {/* Unreachable when readOnly (canEditInline is false there, so
                  hasStagedEdit can never become true) — the guard is kept
                  explicit anyway rather than relying on that invariant. */}
              {!readOnly && hasStagedEdit && upgradeValue === undefined && !showOverriddenUpstreamPill && editingValue === null && (
                <Tooltip
                  title={
                    // T1 — a STAGED manual edit/delete is always checked; unchecking
                    // discards it. Staged purple action with the undo verb; the value
                    // line shows the staged edit (or removal) context, muted status.
                    isStagedDelete ? (
                      <ActionTooltipContent
                        type="staged"
                        icon={<T1UndoIcon />}
                        action="Uncheck to discard"
                        value="removal"
                        status="staged — will apply on next promote"
                      />
                    ) : (
                      <ActionTooltipContent
                        type="staged"
                        icon={<T1UndoIcon />}
                        action="Uncheck to discard"
                        value={isEmptyValue(stagedEditValue ?? '') ? NO_VALUE_LABEL : stagedEditValue}
                        noValue={isEmptyValue(stagedEditValue ?? '')}
                        status="staged edit — will apply on next promote"
                      />
                    )
                  }
                  placement="top"
                  {...TOOLTIP_HOVER_DELAY}
                  slotProps={{ tooltip: { sx: { ...tooltipSx, pointerEvents: 'none' } } }}
                >
                  <span>
                    <UpgradeCheckbox
                      staged
                      changeType={isStagedDelete ? 'delete' : 'edit'}
                      // A staged edit is always checked; unchecking discards it.
                      onToggle={() => { onRevertEdit(stageKey); }}
                    />
                  </span>
                </Tooltip>
              )}
            </Box>
          </Box>

          {/* Removing state: inline undo chip */}
          {isRemoving && (
            <Box
              sx={{
                ml: 'auto',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                fontSize: 11,
                fontFamily: componentTheme.fontSans,
                color: componentTheme.dangerEmphasis,
                flexShrink: 0,
                whiteSpace: 'nowrap',
              }}
            >
              removing ·
              <Box
                component="span"
                onClick={(e: React.MouseEvent) => { e.stopPropagation(); onUndoRemove(fullPath); }}
                sx={{ color: componentTheme.accent, fontWeight: 600, cursor: 'pointer', '&:hover': { textDecoration: 'underline' } }}
              >
                undo
              </Box>
            </Box>
          )}

        </AfterCell>
      </ReviewRow>
      {isInspecting && (
        <InspectPanel
          spaceId={spaceId}
          unitId={unitId}
          path={fullPath}
          currentValue={displayedCurrentValue}
          deploymentName={deploymentName}
          upgradeValue={upgradeValue}
          upgradeSourceName={upgradeSourceName}
          upgradeRevisionNum={upgradeRevisionNum}
          upgradeCreatedAt={upgradeCreatedAt}
          upgradeDescription={upgradeDescription}
          variationEntry={variationEntry}
          onClose={() => onInspectPath(null)}
          siblingVariants={siblingVariants}
          upgradeSourceSpaceId={upgradeSourceSpaceId}
          upgradeSourceUnitId={upgradeSourceUnitId}
          isKept={effectiveKept}
          canProtect={!isAbsentCurrent && !isArrayRow}
          onToggleProtection={readOnly ? undefined : () => onToggleProtection(stageKey, !effectiveKept)}
        />
      )}
      </UpgradePreviewDimRow>
      {/* Sibling composer renders OUTSIDE UpgradePreviewDimRow */}
      {composing && composing.insertAfterId === rowId && (
        <ComposerRow
          desc={composing}
          allPaths={allPaths}
          onCommit={onCommitComposer}
          onCancel={onCancelComposer}
        />
      )}
      </Fragment>
    );
  }

  // Folder node
  const childNodes = contextTree ?? node.children ?? [];

  // Auto-expand when a child composer is targeting this folder (Flag B).
  // OR'd with the lazy-expansion state so a folder force-opens to host the
  // composer even when it would otherwise default to collapsed.
  // Match on the composer's TARGET ROW, not its parentPath: every top-level
  // document wrapper shares parentPath '', so comparing paths force-expanded all
  // of them at once for a composer aimed at just one.
  const shouldBeExpanded = !!(composing && composing.insertAfterId === null && composing.parentId === rowId);
  const folderExpanded = shouldBeExpanded || expanded;

  // Count descendant leaves for "Remove group & N keys" label
  const descendantLeafCount = countLeaves(childNodes);

  // Array-folder guard (e.g. containers.0, dot-index) — disable Remove on a folder
  // that is or sits inside an array element.
  const isArrayFolderRow = pathContainsArrayIndex(fullPath);

  // "Keep group & N keys" (Finding 3): the eligible leaf set for the folder
  // protection action — every descendant leaf path, MINUS array-indexed rows
  // (Finding 1's write-side guard — same reason the leaf kebab disables) and
  // MINUS upstream-only rows absent from current data (nothing to protect
  // until the key exists downstream). Excluded paths are silently dropped
  // from the count entirely, not shown as a separately-disabled sub-count —
  // the same choice protectedPaths.ts already makes for the Scope chip.
  const eligibleLeafPaths = collectLeafPaths(childNodes, contextPrefix ?? fullPath)
    .filter((p) => !pathContainsArrayIndex(p) && !upstreamOnlyPaths.has(p));
  // EFFECTIVE protection per leaf — staged (if any) wins over committed,
  // exactly like a leaf row's own `effectiveKept` (Section 2/1).
  const isCurrentlyProtectedFn = isProtected ?? isProtectedFallback;
  const isLeafEffectivelyKept = (p: string) => {
    const staged = stagedProtection.get(docStageKey(docScope, p));
    return staged ?? isCurrentlyProtectedFn(p);
  };
  const alreadyKeptCount = eligibleLeafPaths.filter(isLeafEffectivelyKept).length;
  const keepDeltaCount = eligibleLeafPaths.length - alreadyKeptCount;

  // This row IS a document wrapper (as opposed to merely living inside one).
  const isWrapperRow = node.document !== undefined;

  // Where a sibling ("above"/"below") insert actually writes.
  //   - Ordinary folder: the parent container, exactly as before.
  //   - Document wrapper: the wrapper has no container — its siblings are other
  //     DOCUMENTS, and adding a document is not something this composer can do.
  //     The only real destination adjacent to it is a root-level key of its OWN
  //     document, which is what `pathPrefix` ('') already denotes; `parentId`
  //     pins it to the document the user actually opened the menu on. (Row order
  //     is not honoured by the writer for any folder — it appends — so
  //     above/below/inside already coincide.)
  const siblingParentPath = pathPrefix;
  const siblingParentId = isWrapperRow ? rowId : pathPrefix;

  // Removing a wrapper would mean deleting the whole source document (a resource),
  // not "a group of keys": there is no path to delete, and the wrapper's own
  // fullPath is '' — which deleteValueAtPath silently ignores, making the action a
  // no-op. Deleting a whole document is a distinct, destructive operation with no
  // API here, so state that plainly rather than offering a button that does nothing.
  const removeBlockedReason = isWrapperRow
    ? 'This row is a heading for one document in this unit, not a group of keys. Remove the keys inside it individually.'
    : isArrayFolderRow ? 'Cannot remove array-indexed folders' : '';

  // A branch is an ancestor of an upgrading field if any descendant path is
  // genuinely upgrading (has upstream diff AND not locally overridden). Branches
  // that are not ancestors dim on upgrade-hover the same way unchanged leaf rows do.
  // O(1) precomputed lookup (was an O(allPaths) scan per folder render).
  const isAncestorOfUpgrade = prefixIndex.isAncestorOfUpgrade(fullPath);

  // readOnly (task #62): matches the leaf equivalent (hasEditHandlers, above)
  // — without this, a folder's Add-row / Remove-group menu stayed reachable
  // in a read-only mount purely because the caller happened not to pass
  // handlers, not because the mode forbade it.
  const hasFolderEditHandlers = !readOnly && (onSetFieldValue != null || onDeleteFieldValue != null);
  const sharedChildProps = {
    depth: depth + 1,
    filterText,
    filterMode,
    readOnly,
    pathPrefix: contextPrefix ?? fullPath,
    // Descendants inherit this row's document so that a write from ANY depth
    // inside a wrapper (not just the wrapper's own menu) is scoped to the right
    // document — an unscoped write lands in the last one.
    documentScope: docScope,
    upgradeFieldDiffs,
    variationFieldDiffs,
    liveVariationPaths,
    allPaths,
    upstreamOnlyPaths,
    changedPaths,
    changedDiffs,
    prefixIndex,
    onStagePath,
    onUnstagePath,
    onStageEdit,
    onSetFieldValue,
    onDeleteFieldValue,
    isProtected,
    onRequestProtectionData,
    valueOverlay,
    fieldPathMeta,
    upgradeCreatedAt,
    upgradeDescription,
    upgradeSourceName,
    upgradeRevisionNum,
    upgradeSourceSpaceId,
    upgradeSourceUnitId,
    upgradeIsHistorical,
    headRevisionCreatedAt,
    headRevisionDescription,
    spaceId,
    unitId,
    inspectPath,
    onInspectPath,
    variationEntry,
    deploymentName,
    deployments,
    unitsByDeployment,
    composing,
    pendingRemovals,
    recentlyAddedPaths,
    onOpenComposer,
    onCommitComposer,
    onCancelComposer,
    onRemove,
    onUndoRemove,
  } as const;

  return (
    <Fragment>
    <Box>
      <UpgradePreviewDimRow className={isAncestorOfUpgrade ? undefined : 'field-unchanged'}>
      <ReviewRow
        $plain
        onClick={toggle}
        data-testid="component-folder-row"
        data-folder-path={fullPath}
        sx={{
          // Knock back path/folder header rows: tighter than the (22px) value rows
          // so they read as small, quiet structural headers and the grey value rows
          // stay the visual focus. (Defaults from $plain are py 3px / min-height 28.)
          py: 0, minHeight: 20,
          alignItems: 'center',
          cursor: 'pointer',
          '& .seg-label': {
            textDecoration: 'underline',
            textDecorationColor: 'transparent',
            textUnderlineOffset: '2px',
            transition: 'text-decoration-color .15s',
          },
          '& .seg-label:hover': { textDecorationColor: componentTheme.fgMuted },
          '&:hover': {
            background: componentTheme.bgInset,
            '& .seg-dot': { opacity: 0.8 },
            '& .kebab-btn': { opacity: 0.9 },
          },
        }}
      >
        <PropertyCell sx={{ width: 'auto', flexShrink: 1, display: 'flex', alignItems: 'center', paddingLeft: `${16 + depth * INDENT_PX}px`, fontSize: 11.5, fontFamily: componentTheme.fontMono, color: componentTheme.fgSubtle }}>
          <Box
            component="span"
            sx={{
              display: 'inline-flex',
              alignItems: 'center',
              transition: 'transform .15s',
              transform: folderExpanded ? 'rotate(90deg)' : 'none',
              color: componentTheme.fgSubtle,
              flexShrink: 0,
            }}
          >
            <ChevronRightIcon />
          </Box>

          {segments.map((seg, i) => {
            // Segment truncation only applies while the folder is open. Collapsed, show
            // the full chain so a collapsed folder never reads as a truncated/expanded one.
            if (folderExpanded && expandedSegment !== null && i > expandedSegment) return null;

            const segPath = segments.slice(0, i + 1).join('.');
            const segPrefix = pathPrefix ? `${pathPrefix}.${segPath}` : segPath;
            // O(log allPaths) range counts (were O(allPaths) filters per segment).
            const totalAtLevel = prefixIndex.totalUnder(segPrefix);
            const changedAtLevel = prefixIndex.changedUnder(segPrefix);
            // For the last segment, count ALL leaf children as already visible (both changed and
            // context ones), so we only flag paths that are genuinely absent from this node —
            // i.e. nested inside sub-folders that the user may have collapsed.
            const directLeafCount = i === segments.length - 1
              ? (node.children ?? []).filter((c) => c.type === 'leaf').length
              : 0;
            const extraCount = Math.max(0, totalAtLevel - Math.max(changedAtLevel, directLeafCount));
            // When this segment is already expanded, all fields are visible — treat as 0 hidden
            const effectiveExtraCount = expandedSegment === i ? 0 : extraCount;

            const segEl = (
              <Box
                component="span"
                className="seg-label"
                data-fidelity="path-segment"
                onClick={(e: React.MouseEvent) => {
                  e.stopPropagation();
                  if (effectiveExtraCount > 0) {
                    setExpandedSegment((prev) => (prev === i ? null : i));
                    // Clicking a segment to reveal its values must also open the folder,
                    // otherwise the revealed values stay hidden and the label is orphaned.
                    setExpanded(true);
                  }
                }}
                sx={{
                  cursor: effectiveExtraCount > 0 ? 'pointer' : 'default',
                  borderRadius: '2px',
                  px: '1px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  transition: 'color .1s',
                  '& .seg-chevron': { width: 0, opacity: 0, overflow: 'hidden', transition: 'width .1s, opacity .1s' },
                  ...(effectiveExtraCount > 0 && { '&:hover .seg-chevron': { width: 10, opacity: 0.6 } }),
                  ...(folderExpanded && expandedSegment === i && { textDecorationColor: `${componentTheme.fgMuted} !important` }),
                }}
              >
                {filterText ? highlightText(seg, filterText) : seg}
                <Box
                  component="span"
                  className="seg-chevron"
                  sx={{
                    display: 'inline-flex',
                    alignItems: 'center',
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
                {i > 0 && (
                  <Box
                    component="span"
                    className="seg-dot"
                    data-fidelity="path-separator"
                    /*
                      Decorative. The path either side of it carries the whole
                      meaning, so a screen reader announcing "dot" between every
                      segment is noise — 1,568 of them on the reference's own
                      hero route. Hiding it is also what lets a contrast check
                      measure it at the 3:1 non-text tier rather than the 4.5:1
                      text tier, since the author's own declaration is the only
                      machine-readable statement of what is text.
                    */
                    aria-hidden="true"
                    sx={{ color: componentTheme.fgSubtle, opacity: 0.4, mx: '1px', transition: 'opacity .15s', userSelect: 'none' }}
                  >.</Box>
                )}
                <Tooltip
                  title={effectiveExtraCount > 0 ? `show ${effectiveExtraCount} more` : 'all fields visible'}
                  placement="top"
                  arrow
                  {...TOOLTIP_HOVER_DELAY}
                  slotProps={{ tooltip: { sx: { fontSize: 11, fontFamily: componentTheme.fontSans, py: 0.25, px: 0.75 } } }}
                >
                  {segEl}
                </Tooltip>
              </Fragment>
            );
          })}
          {folderExpanded && expandedSegment !== null && (
            <Box
              component="span"
              sx={{
                display: 'inline-flex',
                alignItems: 'center',
                ml: '3px',
                color: componentTheme.fgSubtle,
                opacity: 0.5,
                transform: 'rotate(90deg)',
                flexShrink: 0,
              }}
            >
              <ChevronRightIcon />
            </Box>
          )}
        </PropertyCell>

        {/* Flex spacer + ⋯ kebab + folder menu */}
        <Box sx={{ flex: 1 }} />
        {hasFolderEditHandlers && (
          <>
            <Box
              component="button"
              className="kebab-btn"
              onClick={(e: React.MouseEvent<HTMLElement>) => {
                e.stopPropagation();
                setFolderMenuAnchorEl(e.currentTarget);
                onRequestProtectionData?.();
              }}
              sx={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                width: 22,
                height: 22,
                borderRadius: '5px',
                color: componentTheme.fgSubtle,
                opacity: folderMenuAnchorEl ? 1 : 0,
                flexShrink: 0,
                mr: '6px',
                transition: 'opacity .12s, background .12s, color .12s',
                '&:hover': { opacity: 1, background: componentTheme.bgInset, color: componentTheme.fgDefault },
                ...(folderMenuAnchorEl && { background: componentTheme.upgradeMuted, color: componentTheme.upgrade }),
              }}
            >
              <svg viewBox="0 0 16 16" fill="currentColor" style={{ width: 15, height: 15 }}>
                <circle cx="8" cy="3.2" r="1.2" /><circle cx="8" cy="8" r="1.2" /><circle cx="8" cy="12.8" r="1.2" />
              </svg>
            </Box>
            <Menu
              anchorEl={folderMenuAnchorEl}
              open={!!folderMenuAnchorEl}
              onClose={() => setFolderMenuAnchorEl(null)}
              slotProps={{
                paper: {
                  sx: {
                    borderRadius: '9px',
                    border: `1px solid ${componentTheme.borderDefault}`,
                    boxShadow: '0 8px 28px -10px rgba(15,17,21,.22), 0 2px 6px rgba(15,17,21,.06)',
                    minWidth: 210,
                    '& .MuiList-root': { padding: '5px' },
                  },
                },
              }}
            >
              <Tooltip title={addBlockedReason} placement="left">
                <span>
                  <MenuItem
                    disabled={!canAddRows}
                    onClick={() => {
                      setFolderMenuAnchorEl(null);
                      if (!canAddRows) return;
                      onOpenComposer({ parentPath: siblingParentPath, parentId: siblingParentId, insertAfterId: null, insertBeforeId: rowId, depth, mode: 'key', resource: docScope?.resource });
                    }}
                    sx={{ fontSize: 14, borderRadius: '6px', gap: '9px', padding: '7px 9px' }}
                  >
                    Add row above
                  </MenuItem>
                </span>
              </Tooltip>
              <Tooltip title={addBlockedReason} placement="left">
                <span>
                  <MenuItem
                    disabled={!canAddRows}
                    onClick={() => {
                      setFolderMenuAnchorEl(null);
                      if (!canAddRows) return;
                      onOpenComposer({ parentPath: fullPath, parentId: rowId, insertAfterId: null, depth: depth + 1, mode: 'key', resource: docScope?.resource });
                    }}
                    sx={{ fontSize: 14, borderRadius: '6px', gap: '9px', padding: '7px 9px' }}
                  >
                    Add row inside
                  </MenuItem>
                </span>
              </Tooltip>
              <Tooltip title={addBlockedReason} placement="left">
                <span>
                  <MenuItem
                    disabled={!canAddRows}
                    onClick={() => {
                      setFolderMenuAnchorEl(null);
                      if (!canAddRows) return;
                      onOpenComposer({ parentPath: siblingParentPath, parentId: siblingParentId, insertAfterId: rowId, insertBeforeId: null, depth, mode: 'key', resource: docScope?.resource });
                    }}
                    sx={{ fontSize: 14, borderRadius: '6px', gap: '9px', padding: '7px 9px' }}
                  >
                    Add row below
                  </MenuItem>
                </span>
              </Tooltip>
              <Divider sx={{ my: '4px', mx: '2px' }} />
              {/* Keep group & N keys on merge — protect-only (Finding 5: the
                  reverse, "Stop keeping N keys", exists only on the Scope
                  chip's flattened view, never on a folder's own kebab).
                  Disabled when the delta is 0 — nothing this folder still has
                  left to protect, either because every eligible leaf is
                  already kept or because there are none (all array-indexed /
                  upstream-only). Writes N individual leaf entries (Finding 3),
                  never one ancestor-path entry. */}
              <Tooltip
                title={keepDeltaCount === 0 ? 'Every eligible key here is already kept on merge.' : ''}
                placement="left"
              >
                <span>
                  <MenuItem
                    disabled={keepDeltaCount === 0}
                    onClick={() => {
                      setFolderMenuAnchorEl(null);
                      if (keepDeltaCount === 0) return;
                      for (const p of eligibleLeafPaths) {
                        if (!isLeafEffectivelyKept(p)) onToggleProtection(docStageKey(docScope, p), true);
                      }
                    }}
                    sx={{ fontSize: 14, borderRadius: '6px', gap: '2px', padding: '7px 9px', display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}
                  >
                    <Box component="span">
                      Keep group &amp; {eligibleLeafPaths.length} {eligibleLeafPaths.length === 1 ? 'key' : 'keys'} on merge
                    </Box>
                    <Box component="span" sx={{ fontSize: 11, fontWeight: 400, color: componentTheme.fgSubtle, lineHeight: 1.3 }}>
                      {alreadyKeptCount} {alreadyKeptCount === 1 ? 'is' : 'are'} already kept. This changes {keepDeltaCount}.
                    </Box>
                  </MenuItem>
                </span>
              </Tooltip>
              <Divider sx={{ my: '4px', mx: '2px' }} />
              <Tooltip title={removeBlockedReason} placement="left">
                <span>
                  <MenuItem
                    disabled={isArrayFolderRow || isWrapperRow}
                    onClick={() => {
                      setFolderMenuAnchorEl(null);
                      // Authoritative, not merely presentational: `disabled` only stops a
                      // real pointer via CSS. A wrapper has no path to delete, so letting
                      // this through would issue a delete for '' — silently a no-op.
                      if (isArrayFolderRow || isWrapperRow) return;
                      onRemove(fullPath);
                    }}
                    sx={{ fontSize: 14, borderRadius: '6px', gap: '9px', padding: '7px 9px', color: componentTheme.danger, '&:hover': { background: componentTheme.dangerFaint } }}
                  >
                    {isWrapperRow
                      ? `Remove ${descendantLeafCount} ${descendantLeafCount === 1 ? 'key' : 'keys'}`
                      : <>Remove group &amp; {descendantLeafCount} {descendantLeafCount === 1 ? 'key' : 'keys'}</>}
                  </MenuItem>
                </span>
              </Tooltip>
            </Menu>
          </>
        )}
      </ReviewRow>
      </UpgradePreviewDimRow>

      {folderExpanded && (
        <>
          {/* Add-child composer: first child slot — only when not a before-sibling insert.
              Keyed on the composer's target ROW: parentPath is '' for every document
              wrapper, and `!composing.insertBeforePath` also treated that same '' as
              "no before-target", so a path-based match rendered this composer under
              EVERY wrapper at once. Compare ids, and test the before-target for
              null/undefined rather than truthiness. */}
          {composing && composing.insertAfterId === null && composing.insertBeforeId == null && composing.parentId === rowId && (
            <ComposerRow
              desc={composing}
              allPaths={allPaths}
              onCommit={onCommitComposer}
              onCancel={onCancelComposer}
            />
          )}
          {childNodes.map((child) => {
            // Children of a wrapper are ordinary nodes, so their identity is their
            // full path (a wrapper never appears below the top level).
            const childFullPath = (contextPrefix ?? fullPath) ? `${contextPrefix ?? fullPath}.${child.key}` : child.key;
            return (
              <Fragment key={child.key}>
                {/* "Before me" composer — only the parent can render this since
                    NodeRows don't know about their previous sibling */}
                {composing && composing.insertBeforeId === childFullPath && (
                  <ComposerRow
                    desc={composing}
                    allPaths={allPaths}
                    onCommit={onCommitComposer}
                    onCancel={onCancelComposer}
                  />
                )}
                <NodeRow
                  node={child}
                  {...sharedChildProps}
                />
                {/* "After me" is rendered by the NodeRow's own Fragment so we
                    do NOT add it here — avoids double-render */}
              </Fragment>
            );
          })}
        </>
      )}
    </Box>
    {/* Sibling-of-folder composer renders OUTSIDE the Box */}
    {composing && composing.insertAfterId === rowId && (
      <ComposerRow
        desc={composing}
        allPaths={allPaths}
        onCommit={onCommitComposer}
        onCancel={onCancelComposer}
      />
    )}
    </Fragment>
  );
}, nodeRowPropsAreEqual);

NodeRow.displayName = 'NodeRow';

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export const ComponentValuesSection = memo(({
  unit,
  filterText = '',
  filterMode = 'all',
  scopeFilter = null,
  readOnly = false,
  onStagedCountChange,
  commitStagedSignal,
  clearStagedSignal,
  discardAllSignal,
  stageAllSignal,
  keepStagedEditsSignal,
  undoKeepStagedEditsSignal,
  stopKeepingAllSignal,
  onCommitStaged,
  onCommitProtection,
  onSetFieldValue,
  onDeleteFieldValue,
  isProtected: isProtectedProp,
  onRequestProtectionData,
  onStagedProtectionChange,
  onStagedEditKeepSummaryChange,
  valueOverlay,
  deployments,
  unitsByDeployment,
}: ComponentValuesSectionProps) => {
  // Use upgradeEntry if available, otherwise fall back to applyEntry (for apply tab)
  const activeEntry = unit.upgradeEntry ?? unit.applyEntry;

  // Build path → FieldPathMeta for resource identity lookup in set-attributes calls.
  const fieldPathMeta = useMemo(() => buildFieldPathMeta(unit.data), [unit.data]);

  // Committed-baseline protection lookup — defaults to "nothing is protected"
  // until the caller wires real (lazily-fetched) MutationSources data. This is
  // Finding 2's safe default: unknown reads as unprotected, so the worst case
  // is a redundant protect (no-op server-side), never a silent unprotect.
  const isProtected = isProtectedProp ?? isProtectedFallback;

  // Per-document leaves (NOT deduplicated) — the tree-SHAPE source, so a unit holding
  // several YAML documents renders one labeled subtree per document rather than one
  // merged tree. Every leaf keeps its bare dot-path, so `allPaths` below (and every
  // diff/override/staging lookup keyed on it) is completely unaffected.
  const groupedEntries = useMemo(() => buildGroupedPaths(unit.data), [unit.data]);

  // Whether a write can be aimed at ONE document of a multi-document unit. Only the
  // server's set-attributes honours a resource scope; the client-side fallback
  // rewrites the whole Data and resolves multi-doc by last-write-wins, so under any
  // other toolchain there is no way to hit a chosen document and the per-document
  // add actions must stay disabled rather than write to the wrong resource.
  const scopedWritesSupported = isYamlToolchain(unit.toolchainType);

  // Per-document scopes (empty for a single-document unit). Shares the id/writable
  // scheme the tree stamps on its wrappers, so a stage key built here matches the one
  // a rendered leaf builds from its docScope. Drives per-document auto-staging and the
  // document-scoped commit write.
  const documentScopes = useMemo(
    () => computeDocumentScopes(groupedEntries, { scopedWritesSupported }),
    [groupedEntries, scopedWritesSupported],
  );
  // docId → scope, so the commit builder can recover a staged key's target document
  // (its resource identity) to pin the write. Empty ⇒ single-doc ⇒ bare-path writes.
  const docScopeById = useMemo(() => {
    const map = new Map<string, DocumentScope>();
    for (const s of documentScopes) map.set(s.id, s);
    return map;
  }, [documentScopes]);
  // For a bare path, the document scopes that actually CONTAIN it — so an upgradable
  // path shared by two documents auto-stages a separate key in EACH, never one that
  // silently covers both. Single-doc units get an empty map and keep bare keys.
  const scopesByPath = useMemo(() => {
    const map = new Map<string, DocumentScope[]>();
    for (const s of documentScopes) {
      for (const p of s.paths) {
        const list = map.get(p);
        if (list) list.push(s); else map.set(p, [s]);
      }
    }
    return map;
  }, [documentScopes]);
  // Expand a bare path into its per-document stage keys (the bare path itself when the
  // unit is single-document or the path has no known document home).
  const stageKeysForPath = useCallback((path: string): string[] => {
    const scopes = scopesByPath.get(path);
    if (!scopes || scopes.length === 0) return [path];
    return scopes.map((s) => docStageKey(s, path));
  }, [scopesByPath]);

  const downstreamPaths = useMemo(() => {
    if (activeEntry?.allPaths?.length) return activeEntry.allPaths;
    return buildPaths(unit.data);
  }, [activeEntry, unit.data]);

  // Current downstream value per path (same source that feeds node.diff.newValue for a
  // present path). Used to reconcile committedDiffs: a committed value is a temporary
  // snapshot that must yield to the authoritative refetched value once it lands.
  const downstreamValueByPath = useMemo(() => {
    const map = new Map<string, string>();
    for (const { path, value } of downstreamPaths) map.set(path, value);
    return map;
  }, [downstreamPaths]);

  const upgradeFieldDiffs = useMemo(() => {
    const map = new Map<string, string>();
    (unit.upgradeEntry?.fieldDiffs ?? []).forEach((d) => map.set(d.path, d.newValue));
    return map;
  }, [unit.upgradeEntry]);

  // COMMITTED diffs: path → committed value, captured when a staged batch commit
  // succeeds. Keeps just-committed rows VISIBLE (showing their applied value, in a
  // "done" state) across the commit's RTK refetch — which clears the path from
  // upgradeFieldDiffs/upgradablePaths and would otherwise make the row vanish.
  // Restores the legacy frozenUpgradeDiffs behavior for the staging commit flow.
  // Declared early because allPaths/baseNarrowedPaths read it.
  const [committedDiffs, setCommittedDiffs] = useState<Map<string, string>>(new Map());
  // Of the committed paths, which were ADDS (upstream-only / absent downstream at
  // commit time). Lets a committed ADD show a green `+` while a committed plain
  // value-CHANGE (no +/- symbol) instead gets a small done check. Delete is
  // detected from the removal sentinel in committedDiffs.
  const [committedAddPaths, setCommittedAddPaths] = useState<Set<string>>(new Set());


  // Union downstream paths with upstream-only paths (present upstream, absent
  // downstream) so those fields render as normal promotable rows with an absent
  // current value. Safe ordering: all consumers below read allPaths, none feed it.
  // Also re-inject just-committed DELETE paths that vanished from both
  // downstreamPaths and upgradeFieldDiffs after the commit's refetch — so the
  // committed-delete row stays visible (in its "done" state) until the unit changes.
  const { allPaths, upstreamOnlyPaths } = useMemo(() => {
    const { allPaths: basePaths, upstreamOnlyPaths: baseUpstream } =
      unionUpstreamOnlyPaths(downstreamPaths, upgradeFieldDiffs);
    if (committedDiffs.size === 0) return { allPaths: basePaths, upstreamOnlyPaths: baseUpstream };
    const existing = new Set(basePaths.map((p) => p.path));
    const extra = [...committedDiffs.entries()]
      .filter(([p, v]) => isRemovalSentinel(v) && !existing.has(p))
      .map(([p]) => p);
    if (extra.length === 0) return { allPaths: basePaths, upstreamOnlyPaths: baseUpstream };
    return {
      allPaths: [...basePaths, ...extra.map((path) => ({ path, value: '' }))],
      upstreamOnlyPaths: new Set([...baseUpstream, ...extra]),
    };
  }, [downstreamPaths, upgradeFieldDiffs, committedDiffs]);

  const variationFieldDiffs = useMemo(() => {
    const map = new Map<string, string>();
    (unit.variationEntry?.fieldDiffs ?? []).forEach((d) => {
      if (d.oldValue !== undefined) map.set(d.path, d.oldValue);
    });
    return map;
  }, [unit.variationEntry]);

  // Paths differing from upstream right now, built from CURRENT committed data
  // only (never the dry-run) — this is what the value border reads. See
  // VariationEntry.liveFieldDiffs for why this must stay independent of
  // variationFieldDiffs/variationPaths (those are dry-run-tainted).
  const liveVariationPaths = useMemo(
    () => new Set(unit.variationEntry?.liveFieldDiffs.map(d => d.path) ?? []),
    [unit.variationEntry],
  );

  // Paths the unit overrides with a local value — these block the upstream
  // upgrade for that path (shared by both the "upgradable" and "difference" views).
  const variationPaths = useMemo(
    () => new Set(unit.variationEntry?.fieldDiffs.map(d => d.path) ?? []),
    [unit.variationEntry],
  );

  // Upstream paths that would genuinely upgrade: not locally overridden.
  // Includes brand-new upstream-only paths AND upstream removals (newValue
  // '-' or ''), which render struck-through in the upgradable view.
  // Also includes blocked upstream deletions (paths the upstream deleted but the
  // child preserved via a local mutation) so they appear in the upgradable filter.
  // This is the SINGLE source of truth for the "Upgradable" filter set — both the
  // tree's upgradable view and staging's "Select all" derive from it so they can
  // never diverge.
  const upgradablePaths = useMemo(
    () => [
      ...(unit.upgradeEntry?.fieldDiffs ?? [])
        // A path kept on merge is not an upgrade candidate at all — "Select
        // all" and the Upgradable-tab auto-stage must never pick it up, or
        // the very next commit replays right over the value it protects.
        .filter(d => !variationPaths.has(d.path) && !isProtected(d.path))
        .map(d => d.path),
      ...(unit.upgradeEntry?.blockedDeletePaths ?? []),
    ],
    [unit.upgradeEntry, variationPaths, isProtected],
  );

  // The upgradable set expressed as per-document STAGE KEYS — what "Select all" and
  // the Upgradable-tab auto-stage actually add to `stagedPaths`. A path shared by two
  // documents contributes one key per document, so staging is scoped, not merged.
  // (upgradablePaths itself stays BARE — it feeds bare-path tree/narrowing lookups.)
  const upgradableStageKeys = useMemo(
    () => upgradablePaths.flatMap((p) => stageKeysForPath(p)),
    [upgradablePaths, stageKeysForPath],
  );

  const changedPaths = useMemo(
    () => new Set([...upgradeFieldDiffs.keys()]),
    [upgradeFieldDiffs],
  );

  const changedDiffs = useMemo(() => {
    const map = new Map<string, { oldValue: string; newValue: string }>();
    allPaths.forEach(({ path, value }) => {
      // Upgrade paths: the current value is the incoming new value.
      if (changedPaths.has(path)) {
        map.set(path, { oldValue: '', newValue: value });
      } else if (variationFieldDiffs.has(path)) {
        // Variation (locally-overridden) paths: carry the real upstream oldValue
        // so the difference-filter context tree doesn't fall back to a blank
        // oldValue and lose the override's "from" value. Shape matches how
        // variation diffs are rendered elsewhere (variationFieldDiffs = oldValue).
        map.set(path, { oldValue: variationFieldDiffs.get(path) ?? '', newValue: value });
      }
    });
    return map;
  }, [allPaths, changedPaths, variationFieldDiffs]);

  // STAGED set: the user's local upgrade picks (true staging — nothing is written
  // until commit). Served to leaves via MembershipContext so a toggle re-renders
  // only the consuming leaf, not the whole tree.
  const [stagedPaths, setStagedPaths] = useState<Set<string>>(new Set());
  // STAGED MANUAL EDITS: path → user-typed value (or STAGED_DELETE_SENTINEL). The
  // write is DEFERRED until commit. STICKY: unlike the bulk upgrade auto-selection
  // these survive tab switches and the leave-'upgradable' clearStagedSignal — they
  // clear ONLY on explicit Discard, successful commit, or unit identity change.
  const [stagedEditedValues, setStagedEditedValues] = useState<Map<string, string>>(new Map());
  // STAGED PROTECTION changes: stage key → the TARGET Protected value. NEVER
  // joins stagedPaths (protection is not a value change — see card 8's rule:
  // only a value change adds to the "N staged" count). STICKY across
  // clearStagedSignal, same reasoning as stagedEditedValues; cleared only by
  // discardAllSignal or a successful protection commit. See
  // MembershipContextValue.stagedProtection / onToggleProtection.
  const [stagedProtection, setStagedProtection] = useState<Map<string, boolean>>(new Map());
  const [inspectPath, setInspectPath] = useState<string | null>(null);
  const [collapseBannerDismissed, setCollapseBannerDismissed] = useState(false);
  // Serialization error: set when any path fails setValueAtPath/deleteValueAtPath
  // during a commit attempt. Commit is aborted; user retries after seeing this.
  const [commitSerializationError, setCommitSerializationError] = useState<string | null>(null);

  // Add/remove key state
  const [composing, setComposing] = useState<ComposingDescriptor | null>(null);
  const [pendingEmptyFolders, setPendingEmptyFolders] = useState<PendingFolder[]>([]);
  const [pendingRemovals, setPendingRemovals] = useState<Set<string>>(new Set());
  const pendingRemovalTimersRef = useRef<Map<string, number>>(new Map());
  const [recentlyAddedPaths, setRecentlyAddedPaths] = useState<Set<string>>(new Set());

  // "Select all" stages EXACTLY the set shown under the Upgradable filter
  // (`upgradablePaths`) — derived from the same predicate so the two can never
  // diverge. `upgradePathSet` (all upstream-diff keys, incl. locally-overridden
  // ones) is kept only for the commit-time wholesale `upgrade:true` detection.
  const upgradePathSet = useMemo(() => new Set(upgradeFieldDiffs.keys()), [upgradeFieldDiffs]);

  const onStagePath = useCallback((path: string) => {
    setStagedPaths((prev) => (prev.has(path) ? prev : new Set([...prev, path])));
    // Re-staging a previously-committed path starts a fresh stage/commit cycle —
    // drop its "done" committed marker so it renders as staged again.
    setCommittedDiffs((prev) => {
      if (!prev.has(path)) return prev;
      const next = new Map(prev);
      next.delete(path);
      return next;
    });
    setCommittedAddPaths((prev) => {
      if (!prev.has(path)) return prev;
      const next = new Set(prev);
      next.delete(path);
      return next;
    });
  }, []);
  const onUnstagePath = useCallback((path: string) => {
    setStagedPaths((prev) => {
      if (!prev.has(path)) return prev;
      const next = new Set(prev);
      next.delete(path);
      return next;
    });
  }, []);

  // STAGE a manual edit (value change or removal-sentinel) — DEFERS the write.
  // Records the typed value and marks the path staged so the row shows pending and
  // the footer button/summary include it. Re-staging a previously-committed path
  // drops its "done" marker (same as onStagePath).
  const onStageEdit = useCallback((path: string, newValue: string) => {
    setStagedEditedValues((prev) => {
      const next = new Map(prev);
      next.set(path, newValue);
      return next;
    });
    setStagedPaths((prev) => (prev.has(path) ? prev : new Set([...prev, path])));
    setCommittedDiffs((prev) => {
      if (!prev.has(path)) return prev;
      const next = new Map(prev);
      next.delete(path);
      return next;
    });
    setCommittedAddPaths((prev) => {
      if (!prev.has(path)) return prev;
      const next = new Set(prev);
      next.delete(path);
      return next;
    });
  }, []);

  // REVERT a staged manual edit: discard the typed value and unstage the path so
  // the row returns to its original current value.
  const onRevertEdit = useCallback((path: string) => {
    setStagedEditedValues((prev) => {
      if (!prev.has(path)) return prev;
      const next = new Map(prev);
      next.delete(path);
      return next;
    });
    setStagedPaths((prev) => {
      if (!prev.has(path)) return prev;
      const next = new Set(prev);
      next.delete(path);
      return next;
    });
  }, []);

  // isProtected is read fresh (not captured stale) by onToggleProtection, which
  // is itself handed to leaves via a stable context value — mirrors the
  // *Ref pattern used throughout this file's commit-signal effect.
  const isProtectedRef = useRef(isProtected);
  isProtectedRef.current = isProtected;

  // STAGE (or un-stage) a protection change for one path. See
  // MembershipContextValue.onToggleProtection for the no-op-collapse rule this
  // implements: if targetProtected already equals the path's CURRENT effective
  // (committed) protection, the staged entry is removed rather than set, so a
  // click-then-click-back is a true no-op and "protect 6 where 4 already are"
  // stages exactly 2. Unlike onStageEdit, this never touches stagedPaths — a
  // protection change is not a value change (card 8's rule).
  const onToggleProtection = useCallback((stageKey: string, targetProtected: boolean) => {
    const bare = stageKeyPath(stageKey);
    const currentEffective = isProtectedRef.current(bare);
    setStagedProtection((prev) => {
      const next = new Map(prev);
      if (targetProtected === currentEffective) next.delete(stageKey);
      else next.set(stageKey, targetProtected);
      return next;
    });
  }, []);

  // Cleanup pending removal timers on unmount
  useEffect(() => {
    const timersRef = pendingRemovalTimersRef.current;
    return () => { timersRef.forEach((t) => clearTimeout(t)); };
  }, []);

  // ── Report staged count up (footer chip / button enablement) ──────────────
  // LOGICAL count, not raw leaf count: a wholly-added array element (e.g. one env
  // var = name+value, or a new container = many leaves) reads as ONE change.
  useEffect(() => {
    onStagedCountChange?.(unit.unitId, countLogicalChangesScoped(stagedPaths));
  }, [onStagedCountChange, unit.unitId, stagedPaths]);
  // Report a final 0 on unmount so the side pane doesn't keep stale counts.
  useEffect(() => {
    const cb = onStagedCountChange;
    const uid = unit.unitId;
    return () => { cb?.(uid, 0); };
  }, [onStagedCountChange, unit.unitId]);

  // ── Report staged PROTECTION count up, SEPARATELY from the value count ────
  // Counted by stage key (one per document-scoped path), never merged into
  // onStagedCountChange's "N staged" — the bar disclosure (card 8) treats
  // "N staged" (value changes) and "N kept" (protection changes) as distinct
  // numbers with distinct verbs. `protectCount` (of `total`, how many target
  // TRUE) lets the bar tell a uniform "will be kept" batch (card 8 row 3, the
  // Scope chip's own bulk-protect) from a mixed one (row 4, "Update N keys").
  useEffect(() => {
    let protectCount = 0;
    for (const v of stagedProtection.values()) if (v) protectCount++;
    onStagedProtectionChange?.(unit.unitId, stagedProtection.size, protectCount);
  }, [onStagedProtectionChange, unit.unitId, stagedProtection]);
  useEffect(() => {
    const cb = onStagedProtectionChange;
    const uid = unit.unitId;
    return () => { cb?.(uid, 0, 0); };
  }, [onStagedProtectionChange, unit.unitId]);

  // Staged-edited-but-not-delete paths that ALSO carry a live staged pick
  // (stagedEditedValues entries are always added to stagedPaths by
  // onStageEdit, but this mirrors the plan's "stagedPaths ∩ stagedEditedValues"
  // wording literally rather than assuming that invariant). Used by both the
  // bar-summary report below and the keep/undo-keep signal effects further down.
  const stagedEditKeepablePaths = useMemo(
    () => [...stagedEditedValues.keys()].filter(
      (k) => stagedPaths.has(k) && !isStagedDeleteSentinel(stagedEditedValues.get(k)),
    ),
    [stagedEditedValues, stagedPaths],
  );

  // ── Report the staged-edit keep summary up (bar's "N staged · both may be
  // overwritten" vs "both kept on merge" disclosure, card 3 & 8) ────────────
  useEffect(() => {
    const total = stagedEditKeepablePaths.length;
    const unkept = stagedEditKeepablePaths.filter((k) => {
      const staged = stagedProtection.get(k);
      return !(staged ?? isProtected(stageKeyPath(k)));
    }).length;
    onStagedEditKeepSummaryChange?.(unit.unitId, total, unkept);
  }, [onStagedEditKeepSummaryChange, unit.unitId, stagedEditKeepablePaths, stagedProtection, isProtected]);
  useEffect(() => {
    const cb = onStagedEditKeepSummaryChange;
    const uid = unit.unitId;
    return () => { cb?.(uid, 0, 0); };
  }, [onStagedEditKeepSummaryChange, unit.unitId]);

  // ── Keep both on merge / Undo keep signals (card 3b / bar button) ─────────
  const lastKeepStagedEditsRef = useRef(keepStagedEditsSignal ?? 0);
  useEffect(() => {
    if ((keepStagedEditsSignal ?? 0) === lastKeepStagedEditsRef.current) return;
    lastKeepStagedEditsRef.current = keepStagedEditsSignal ?? 0;
    const targets = stagedEditKeepablePaths.filter((k) => {
      const staged = stagedProtection.get(k);
      return !(staged ?? isProtected(stageKeyPath(k)));
    });
    if (targets.length === 0) return;
    setStagedProtection((prev) => {
      const next = new Map(prev);
      for (const k of targets) next.set(k, true);
      return next;
    });
  }, [keepStagedEditsSignal, stagedEditKeepablePaths, isProtected, stagedProtection]);

  const lastUndoKeepStagedEditsRef = useRef(undoKeepStagedEditsSignal ?? 0);
  useEffect(() => {
    if ((undoKeepStagedEditsSignal ?? 0) === lastUndoKeepStagedEditsRef.current) return;
    lastUndoKeepStagedEditsRef.current = undoKeepStagedEditsSignal ?? 0;
    const keepable = new Set(stagedEditKeepablePaths);
    setStagedProtection((prev) => {
      if (prev.size === 0) return prev;
      let changed = false;
      const next = new Map(prev);
      for (const k of prev.keys()) {
        if (keepable.has(k) && next.delete(k)) changed = true;
      }
      return changed ? next : prev;
    });
  }, [undoKeepStagedEditsSignal, stagedEditKeepablePaths]);

  // ── Select-all signal: stage EXACTLY the Upgradable-filter set for this unit ──
  // Uses the same `upgradablePaths` the tree's Upgradable view renders, so Select
  // all and the Upgradable filter are guaranteed to match.
  const lastStageAllRef = useRef(stageAllSignal ?? 0);
  useEffect(() => {
    if ((stageAllSignal ?? 0) === lastStageAllRef.current) return;
    lastStageAllRef.current = stageAllSignal ?? 0;
    if (upgradableStageKeys.length === 0) return;
    // Union with existing picks so Select all ADDS the Upgradable set without
    // dropping paths the user staged by hand (e.g. a local override). Per-document
    // stage keys so a path shared across documents stages each one separately.
    setStagedPaths((prev) => new Set([...prev, ...upgradableStageKeys]));
  }, [stageAllSignal, upgradableStageKeys]);

  // ── First-open auto-stage guard ────────────────────────────────────────────
  // On first open of a deployment the side pane fires stageAllSignal (via the
  // mount one-shot / the "select a node → setFilterModeWithStaging('upgradable')"
  // effect) BEFORE this section's RTK dry-run data has loaded, so upgradablePaths
  // is still empty: the stageAll effect above advances its signal ref and bails on
  // the `length === 0` guard, and nothing re-stages once the data arrives. This
  // per-section guard fills that gap AND keeps up with upgradable paths that arrive
  // LATER (e.g. from the ~2s background dry-run poll or a late-resolving dry-run):
  // while in 'upgradable' mode it auto-stages every upgradable path it has not
  // auto-staged before, so `stagedPaths` stays equal to the true will-upgrade set.
  // Keeping the two in sync keeps the leaf dim (isStaged) consistent with the
  // "Upgrade N" count and the Upgradable filter (components.md rule 4), so a
  // late-arriving upgradable field previews at full opacity instead of dimming.
  //
  // `autoStagedPathsRef` is the "seen" set — the mechanism that prevents
  // re-staging. Once a path has been auto-staged it is recorded here and NEVER
  // auto-staged again, so a path the user explicitly UNSTAGES stays unstaged even
  // as later renders/polls run. The seen-set is re-armed (cleared) when leaving
  // 'upgradable' (so re-entering re-stages a fresh session) or when the unit
  // identity changes (so a new deployment re-stages). It only ever unions into
  // stagedPaths; committedDiffs are untouched.
  const autoStagedPathsRef = useRef<Set<string>>(new Set());
  const autoStageUnitIdRef = useRef(unit.unitId);
  if (autoStageUnitIdRef.current !== unit.unitId) {
    autoStageUnitIdRef.current = unit.unitId;
    autoStagedPathsRef.current = new Set();
  }
  useEffect(() => {
    // readOnly (task #62): a read-only tree must never populate stagedPaths,
    // regardless of filterMode — this effect exists to keep staging in sync
    // with the Upgradable filter, and read-only offers no staging to keep in
    // sync.
    if (readOnly) return;
    if (filterMode !== 'upgradable') {
      // Re-arm on leaving so re-entering the tab auto-stages from scratch.
      if (autoStagedPathsRef.current.size) autoStagedPathsRef.current = new Set();
      return;
    }
    const seen = autoStagedPathsRef.current;
    const newKeys = upgradableStageKeys.filter((k) => !seen.has(k));
    if (newKeys.length === 0) return;
    for (const k of newKeys) seen.add(k);
    setStagedPaths((prev) => new Set([...prev, ...newKeys]));
  }, [readOnly, filterMode, upgradableStageKeys]);

  // ── Clear (discard) signal: drop staged UPGRADE picks without committing ───
  // This signal fires when LEAVING the Upgradable tab (auto-discard of the bulk
  // upgrade auto-selection). It must NOT wipe STICKY manual edits: keep the edited
  // paths staged so their pending rows persist across the tab switch. Only the
  // upgrade-only staged paths are dropped.
  const lastClearRef = useRef(clearStagedSignal ?? 0);
  const stagedEditedValuesRef = useRef(stagedEditedValues);
  stagedEditedValuesRef.current = stagedEditedValues;
  useEffect(() => {
    if ((clearStagedSignal ?? 0) === lastClearRef.current) return;
    lastClearRef.current = clearStagedSignal ?? 0;
    setStagedPaths((prev) => {
      if (prev.size === 0) return prev;
      const edits = stagedEditedValuesRef.current;
      // Retain staged paths that carry a manual edit (sticky); drop the rest.
      const retained = new Set<string>();
      for (const p of prev) if (edits.has(p)) retained.add(p);
      return retained.size === prev.size ? prev : retained;
    });
  }, [clearStagedSignal]);

  // ── Discard-all signal: drop EVERYTHING staged, including sticky manual edits.
  // Fired by the explicit footer "Discard" button (vs the leave-tab auto-clear).
  const lastDiscardAllRef = useRef(discardAllSignal ?? 0);
  useEffect(() => {
    if ((discardAllSignal ?? 0) === lastDiscardAllRef.current) return;
    lastDiscardAllRef.current = discardAllSignal ?? 0;
    setStagedPaths((prev) => (prev.size ? new Set() : prev));
    setStagedEditedValues((prev) => (prev.size ? new Map() : prev));
    setStagedProtection((prev) => (prev.size ? new Map() : prev));
  }, [discardAllSignal]);

  // ── Commit signal: write this unit's staged batch in ONE call ──────────────
  // Build the merged Data once (chaining setValueAtPath/deleteValueAtPath) for a
  // subset, OR signal the wholesale upgrade:true path when every available
  // upgrade is staged. The parent (onCommitStaged) performs the single network
  // call; on success we clear this unit's staged set.
  const lastCommitRef = useRef(commitStagedSignal ?? 0);
  const stagedPathsRef = useRef(stagedPaths);
  stagedPathsRef.current = stagedPaths;
  const upgradeFieldDiffsRef = useRef(upgradeFieldDiffs);
  upgradeFieldDiffsRef.current = upgradeFieldDiffs;
  const variationFieldDiffsRef = useRef(variationFieldDiffs);
  variationFieldDiffsRef.current = variationFieldDiffs;
  const unitDataRef = useRef(unit.data);
  unitDataRef.current = unit.data;
  const upgradePathSetRef = useRef(upgradePathSet);
  upgradePathSetRef.current = upgradePathSet;
  const upgradableStageKeysRef = useRef(upgradableStageKeys);
  upgradableStageKeysRef.current = upgradableStageKeys;
  const docScopeByIdRef = useRef(docScopeById);
  docScopeByIdRef.current = docScopeById;
  const upstreamOnlyPathsRef = useRef(upstreamOnlyPaths);
  upstreamOnlyPathsRef.current = upstreamOnlyPaths;
  const downstreamValueByPathRef = useRef(downstreamValueByPath);
  downstreamValueByPathRef.current = downstreamValueByPath;
  // Per committed (non-removal) path: the downstream value at commit time (undefined =
  // absent, i.e. an ADD). This baseline snapshot is consumed at RENDER time by the
  // `converged` check in NodeRow: while the live downstream value still equals this
  // snapshot (pre-convergence) the row prefers the committed value for instant display;
  // once it diverges (the refetch has landed) the row falls back to the authoritative
  // node.diff.newValue — whatever the server stored, including a normalized one. Entries
  // are retained, never pruned, so the committed "done" row stays visible.
  const committedBaselineRef = useRef<Map<string, string | undefined>>(new Map());
  const stagedProtectionRef = useRef(stagedProtection);
  stagedProtectionRef.current = stagedProtection;
  const fieldPathMetaRef = useRef(fieldPathMeta);
  fieldPathMetaRef.current = fieldPathMeta;

  useEffect(() => {
    if ((commitStagedSignal ?? 0) === lastCommitRef.current) return;
    lastCommitRef.current = commitStagedSignal ?? 0;

    const staged = stagedPathsRef.current;
    const protectionStaged = stagedProtectionRef.current;
    if (staged.size === 0 && protectionStaged.size === 0) return;

    void commitUnitStaged();

    async function commitUnitStaged() {
    // ── Protection commits FIRST, as its OWN revision (card 7 / Finding 3's
    // write-order settlement) — never rolled back if the value write below
    // fails; if PROTECTION fails, abort the whole commit for this unit and
    // never attempt the value write (safe direction to fail in). ──────────
    if (protectionStaged.size > 0) {
      if (!onCommitProtection) return;
      const protectionPayload = buildResourceProtectionPayload(protectionStaged, fieldPathMetaRef.current);
      const protectionOk = await onCommitProtection(protectionPayload);
      if (!protectionOk) {
        setCommitSerializationError('Could not save the protection change — nothing else in this commit was written. Try again.');
        return;
      }
      const committedProtectionKeys = new Set(protectionStaged.keys());
      setStagedProtection((prev) => {
        if (prev.size === 0) return prev;
        const next = new Map(prev);
        for (const p of committedProtectionKeys) next.delete(p);
        return next.size === prev.size ? prev : next;
      });
    }

    if (staged.size === 0 || !onCommitStaged) return;

    const commit = onCommitStaged;
    const committedPaths = new Set(staged);

    // Snapshot the value each committed path resolves to, so the row can keep
    // showing its applied value after the refetch clears upgradeFieldDiffs. Also
    // record which committed paths were ADDS (upstream-only at commit time) so the
    // row can show a green `+` rather than the value-change done check.
    const edits = stagedEditedValuesRef.current;
    const committedValues = new Map<string, string>();
    const committedAdds = new Set<string>();
    {
      const upDiffs = upgradeFieldDiffsRef.current;
      const varDiffs = variationFieldDiffsRef.current;
      const upstreamOnly = upstreamOnlyPathsRef.current;
      for (const key of staged) {
        // `key` is a document-scoped stage key; the diff/override/upstream-only maps
        // are keyed on the BARE path it carries. The committed maps keep the stage
        // key so the row that staged it (and only that row) reads its "done" state.
        const bare = stageKeyPath(key);
        // A manual edit overrides the upstream/override value for the committed
        // (frozen) display too. A staged DELETE normalises to the '-' removal
        // sentinel so the committed-delete row renders struck-through (the
        // committed/done mechanism keys off isRemovalSentinel).
        const editVal = edits.get(key);
        const isDel = editVal !== undefined
          ? isStagedDeleteSentinel(editVal)
          : isRemovalSentinel(upDiffs.get(bare) ?? varDiffs.get(bare));
        const v = editVal !== undefined
          ? (isStagedDeleteSentinel(editVal) ? '-' : editVal)
          : (upDiffs.get(bare) ?? varDiffs.get(bare));
        if (v !== undefined) committedValues.set(key, v);
        if (upstreamOnly.has(bare) && !isDel) committedAdds.add(key);
      }
    }

    // Wholesale shortcut: every upgradable path (from upgradablePaths — the same
    // set "Select All" stages, excluding locally-overridden paths) is staged, AND
    // no manual edit is staged → one-shot upgrade:true mutation. ANY staged manual
    // edit forces the patch-data merge (wholesale would discard the user's values).
    const upgradeKeys = upgradePathSetRef.current;
    const upgradableKeys = upgradableStageKeysRef.current;
    // Compare on the bare path each stage key carries (upgradeKeys is bare-keyed);
    // "all staged" compares the per-document stage keys directly.
    const onlyUpgradesStaged = [...staged].every((p) => upgradeKeys.has(stageKeyPath(p)));
    const allUpgradesStaged = upgradableKeys.length > 0 && upgradableKeys.every((k) => staged.has(k));
    const anyEditStaged = [...staged].some((p) => edits.has(p));

    let payload: StagedCommitPayload;
    if (onlyUpgradesStaged && allUpgradesStaged && !anyEditStaged) {
      payload = { kind: 'upgrade-all' };
    } else {
      // Subset (or any manual edit): merge every staged change into ONE document.
      let data = unitDataRef.current ?? '';
      const upDiffs = upgradeFieldDiffsRef.current;
      const varDiffs = variationFieldDiffsRef.current;
      const docScopes = docScopeByIdRef.current;
      const failedPaths: string[] = [];
      for (const key of staged) {
        // Decode the document-scoped stage key: the BARE path to write, and the
        // owning document. When that document is uniquely addressable, its resource
        // identity PINS the write to it — never last-document-wins — so a staged edit
        // to one document can't land in a sibling (#4724/#4725). An unaddressable or
        // single-document target passes no resource and writes exactly as before.
        const bare = stageKeyPath(key);
        const docId = stageKeyDocId(key);
        const scope = docId !== undefined ? docScopes.get(docId) : undefined;
        const resource = scope?.writable ? scope.resource : undefined;
        const editVal = edits.get(key);
        const upgradeVal = upDiffs.get(bare);
        const overrideVal = varDiffs.get(bare);
        // Resolve the value this staged path commits to, in priority order:
        //  - manual edit (editVal) — a user-typed value OVERRIDES the upstream value;
        //    a staged removal-sentinel → delete the path
        //  - upstream upgrade (non-removal) → set that value; removal sentinel → delete
        //  - blocked override (no upstream diff) → accept the overridden upstream value
        //    (removal sentinel → delete)
        const targetValue = editVal !== undefined ? editVal
          : upgradeVal !== undefined ? upgradeVal
          : overrideVal;
        if (targetValue === undefined) continue;
        const isDelete = editVal !== undefined
          ? isStagedDeleteSentinel(editVal)
          : isRemovalSentinel(targetValue);
        const result = isDelete
          ? deleteValueAtPath(data, bare, resource)
          : setValueAtPath(data, bare, targetValue, resource);
        if (result.ok) {
          data = result.data;
        } else {
          failedPaths.push(bare);
        }
      }
      // If any path failed to serialize, abort the entire commit. A partial write
      // would silently drop staged changes with no indication to the user. Surface
      // an inline error and keep staged rows intact so the user can retry.
      if (failedPaths.length > 0) {
        setCommitSerializationError(
          `Could not serialize path${failedPaths.length > 1 ? 's' : ''}: ${failedPaths.join(', ')}`,
        );
        return;
      }
      payload = { kind: 'patch-data', data };
    }

    void commit(payload).then((ok) => {
      if (!ok) return;
      // Snapshot the pre-refetch downstream value for each committed non-removal path so a
      // leaf can detect, AT RENDER, when the refetch lands (the live value diverges from
      // this baseline) and hand display back to the authoritative value — without deleting
      // the committedDiffs entry that keeps the "done" row visible. Removal-sentinel paths
      // are excluded: their committed entry drives the sticky struck-through row and the
      // upstreamOnlyPaths union, and never yields display to a refetched value.
      {
        const baselines = committedBaselineRef.current;
        const downstream = downstreamValueByPathRef.current;
        // Baselines are keyed by the (document-scoped) stage key so each row reads its
        // own; the live downstream value is looked up on the bare path that key carries.
        for (const [p, v] of committedValues) {
          if (isRemovalSentinel(v)) baselines.delete(p);
          else baselines.set(p, downstream.get(stageKeyPath(p)));
        }
      }
      // Record the committed paths so they stay visible (in a "done" state) after
      // the refetch clears their upstream diff — then clear them from staged.
      setCommittedDiffs((prev) => {
        const next = new Map(prev);
        for (const [p, v] of committedValues) next.set(p, v);
        return next;
      });
      if (committedAdds.size > 0) {
        setCommittedAddPaths((prev) => {
          const next = new Set(prev);
          for (const p of committedAdds) next.add(p);
          return next;
        });
      }
      // Clear only the paths we committed (the user may have staged more meanwhile).
      setStagedPaths((prev) => {
        if (prev.size === 0) return prev;
        const next = new Set(prev);
        for (const p of committedPaths) next.delete(p);
        return next.size === prev.size ? prev : next;
      });
      // Clear committed manual edits — they are now applied and frozen via
      // committedDiffs (the committed/done mechanism keeps them visible).
      setStagedEditedValues((prev) => {
        if (prev.size === 0) return prev;
        let changed = false;
        const next = new Map(prev);
        for (const p of committedPaths) if (next.delete(p)) changed = true;
        return changed ? next : prev;
      });
    });
    }
  }, [commitStagedSignal, onCommitStaged, onCommitProtection]);

  // ── Add/remove key handlers ──────────────────────────────────────────────

  const onOpenComposer = useCallback((desc: ComposingDescriptor) => {
    setComposing(desc);
  }, []);

  const onCancelComposer = useCallback(() => {
    setComposing(null);
  }, []);

  const onCommitComposer = useCallback(async (
    desc: ComposingDescriptor,
    key: string,
    value: string,
  ) => {
    setComposing(null);
    const trimmedKey = key.trim();
    // Composed from the REAL parent path, never from a targeting id: the new key
    // must be BARE (`spec.replicas`), which is the namespace every diff/override/
    // staging lookup — and the write itself — is keyed on.
    const newFullPath = desc.parentPath ? `${desc.parentPath}.${trimmedKey}` : trimmedKey;

    if (desc.mode === 'group') {
      // Optimistic-only empty folder — does NOT persist until a child key is written (designer note 2)
      setPendingEmptyFolders((prev) => [...prev, { fullPath: newFullPath, key: trimmedKey }]);
      return;
    }

    // KEY mode: write to server.
    // The bare path alone does not say WHICH document to write to, and a brand-new
    // key exists in none of them, so nothing downstream can infer it: an unscoped
    // create lands in the LAST document. Carry the source document's resource
    // identity so the key lands in the document the user pointed at. `segments` is
    // unused by the mutation path (only `resource` is read), hence empty.
    if (onSetFieldValue) {
      await onSetFieldValue(
        newFullPath,
        value,
        desc.resource ? { segments: [], resource: desc.resource } : undefined,
      );
      setRecentlyAddedPaths((prev) => new Set([...prev, newFullPath]));
      const t = window.setTimeout(() => {
        setRecentlyAddedPaths((prev) => {
          const next = new Set(prev);
          next.delete(newFullPath);
          return next;
        });
      }, 2000);
      // Clean up: store timer so we can cancel on unmount (use newFullPath as key)
      pendingRemovalTimersRef.current.set(`__added_${newFullPath}`, t);
    }
  }, [onSetFieldValue]);

  const onRemove = useCallback((removedPath: string) => {
    // If it's an optimistic-only empty folder, just drop it (Flag D)
    const isPendingFolder = pendingEmptyFolders.some((pf) => pf.fullPath === removedPath);
    if (isPendingFolder) {
      setPendingEmptyFolders((prev) => prev.filter((pf) => pf.fullPath !== removedPath));
      return;
    }

    // Mark as pending removal
    setPendingRemovals((prev) => new Set([...prev, removedPath]));

    // Schedule the actual delete after 2600ms
    const t = window.setTimeout(() => {
      // Clear child removal timers first (Flag E)
      const childPrefix = `${removedPath}.`;
      pendingRemovalTimersRef.current.forEach((childTimer, childPath) => {
        if (childPath.startsWith(childPrefix)) {
          clearTimeout(childTimer);
          pendingRemovalTimersRef.current.delete(childPath);
        }
      });

      // Commit single atomic delete (covers subtree)
      if (onDeleteFieldValue) {
        void onDeleteFieldValue(removedPath);
      }

      // Remove from pending state
      setPendingRemovals((prev) => {
        const next = new Set(prev);
        next.delete(removedPath);
        return next;
      });

      pendingRemovalTimersRef.current.delete(removedPath);
    }, 2600);

    pendingRemovalTimersRef.current.set(removedPath, t);
  }, [pendingEmptyFolders, onDeleteFieldValue]);

  const onUndoRemove = useCallback((removedPath: string) => {
    const t = pendingRemovalTimersRef.current.get(removedPath);
    if (t !== undefined) {
      clearTimeout(t);
      pendingRemovalTimersRef.current.delete(removedPath);
    }
    setPendingRemovals((prev) => {
      const next = new Set(prev);
      next.delete(removedPath);
      return next;
    });
  }, []);

  const filteredPaths = useMemo(() => {
    if (!filterText) return allPaths;
    const lower = filterText.toLowerCase();
    const matchesFilter = (text: string | undefined): boolean =>
      text != null && text.toLowerCase().includes(lower);
    return allPaths.filter(({ path, value }) => {
      // path covers the leaf key (suffix match) and full dot-notation path.
      // value is the current value as parsed from the unit data.
      // Also match against upgrade and overridden-upstream values so a
      // row stays visible when any of its rendered pills contains the query.
      const upgradeValue = upgradeFieldDiffs.get(path);
      const overriddenUpstreamValue = variationFieldDiffs.get(path);
      return (
        matchesFilter(path) ||
        matchesFilter(value) ||
        matchesFilter(upgradeValue) ||
        matchesFilter(overriddenUpstreamValue)
      );
    });
  }, [allPaths, filterText, upgradeFieldDiffs, variationFieldDiffs]);

  // The tree itself is built ONCE, in `activeTree` below — the visible path set is
  // chosen first (narrowed vs filtered) and only the chosen one is ever built.

  // `variationPaths` and `upgradablePaths` are derived earlier (single source of
  // truth shared with staging's "Select all").

  // Bare paths, from the UNTAINTED `liveVariationPaths` (never the dry-run-
  // tainted `variationPaths` — same reasoning as the L2 chip and the border
  // itself), that are currently checkable (non-array, Finding 1) AND
  // EFFECTIVELY kept (a staged protection change wins over the committed
  // baseline). Powers the Scope chip's flattened "Kept on merge" filter
  // (Section 7/card 4b) — deliberately depends on `stagedProtection`, unlike
  // `baseNarrowedPaths` below's general "stable" invariant, because this
  // filter's whole point is to reflect a just-staged unprotect immediately.
  const keptOnMergePaths = useMemo(() => {
    const set = new Set<string>();
    for (const p of liveVariationPaths) {
      if (pathContainsArrayIndex(p)) continue;
      const keys = stageKeysForPath(p);
      const stagedEntry = keys.map((k) => stagedProtection.get(k)).find((v) => v !== undefined);
      if (stagedEntry ?? isProtected(p)) set.add(p);
    }
    return set;
  }, [liveVariationPaths, stagedProtection, isProtected, stageKeysForPath]);

  // ── Stop keeping N keys (Section 7/card 4b) — STAGE an unprotect for every
  // currently checkable, effectively-kept path. Placed here (not with the
  // other staging signals above) because it depends on `keptOnMergePaths`,
  // which itself needs `stagedProtection`/`isProtected` already declared.
  const lastStopKeepingAllRef = useRef(stopKeepingAllSignal ?? 0);
  useEffect(() => {
    if ((stopKeepingAllSignal ?? 0) === lastStopKeepingAllRef.current) return;
    lastStopKeepingAllRef.current = stopKeepingAllSignal ?? 0;
    if (keptOnMergePaths.size === 0) return;
    setStagedProtection((prev) => {
      const next = new Map(prev);
      for (const p of keptOnMergePaths) {
        for (const k of stageKeysForPath(p)) next.set(k, false);
      }
      return next;
    });
  }, [stopKeepingAllSignal, keptOnMergePaths, stageKeysForPath]);

  // Base narrowed paths: stable, does NOT depend on stagedPaths. Depending on
  // stagedPaths here causes narrowedTree to rebuild on every stage/unstage toggle:
  // even when the staged path is already in upgradablePaths (same set content),
  // the new Set reference causes narrowedTree to produce new node objects → new
  // top-level keys when collapseFolderChains runs differently (e.g. a staged path
  // that shares a parent with an upgradable path prevents single-child collapse,
  // changing "spec.template.containers.0" → "spec") → NodeRow unmounts/remounts
  // → expansion state resets → the "whole unit expands" regression.
  // Just-committed paths are kept in the narrowed set so the row stays visible
  // after the commit's refetch clears it from upgradablePaths. committedDiffs only
  // changes on commit (never on stage/unstage), so folding it in here preserves the
  // stage-time reference stability the narrowedPaths memo below relies on.
  const baseNarrowedPaths = useMemo(() => {
    if (filterMode === 'upgradable') {
      const set = new Set(upgradablePaths);
      committedDiffs.forEach((_v, p) => set.add(stageKeyPath(p)));
      return set;
    }
    if (filterMode === 'changed') {
      // No variationPaths exclusion — see the filterMode prop's own doc
      // comment. committedDiffs folded in for the same reason the
      // 'upgradable' branch above does: a just-committed path should stay
      // visible through the refetch that would otherwise drop it from
      // changedPaths.
      const set = new Set(changedPaths);
      committedDiffs.forEach((_v, p) => set.add(stageKeyPath(p)));
      return set;
    }
    if (scopeFilter === 'local-overrides') {
      // Keep just-committed rows visible (value + ✓ done state) after the commit's
      // refetch clears them from variation paths — same as the upgradable tab.
      const set = new Set(variationPaths);
      committedDiffs.forEach((_v, p) => set.add(stageKeyPath(p)));
      return set;
    }
    if (scopeFilter === 'local-only') {
      return new Set(unit.variationEntry?.localOnlyPaths ?? []);
    }
    if (scopeFilter === 'kept-on-merge') {
      return keptOnMergePaths;
    }
    return null;
  }, [filterMode, scopeFilter, variationPaths, upgradablePaths, changedPaths, committedDiffs, unit.variationEntry, keptOnMergePaths]);

  // Only extend with staged picks that fell OUTSIDE the base set — e.g. a path
  // that was staged before the upstream diff cleared mid-session (so the row stays
  // visible after upgradeEntry.fieldDiffs updates). In the common case
  // (stagedPaths ⊆ baseNarrowedPaths) this returns the SAME reference so
  // narrowedTree is NOT rebuilt on stage/unstage.
  const narrowedPaths = useMemo(() => {
    if (!baseNarrowedPaths) return null;
    // stagedPaths holds document-scoped keys; narrowedPaths is matched against bare
    // allPaths, so compare/extend on the bare path a stage key carries.
    let hasExtra = false;
    for (const p of stagedPaths) {
      if (!baseNarrowedPaths.has(stageKeyPath(p))) { hasExtra = true; break; }
    }
    if (!hasExtra) return baseNarrowedPaths; // stable reference → narrowedTree skips rebuild
    const extended = new Set(baseNarrowedPaths);
    stagedPaths.forEach(p => extended.add(stageKeyPath(p)));
    return extended;
  }, [baseNarrowedPaths, stagedPaths]);

  // THE tree — built exactly once per selection. Pick the visible path set first,
  // then build; the full tree used to be built unconditionally alongside this one
  // and then discarded in every narrowing mode.
  //
  // Which set:
  //   narrowedPaths === null → NOT a narrowing mode ('all') → the filtered full set.
  //   narrowedPaths !== null → a narrowing mode (upgradable/difference) → only the
  //     matching paths. CRITICAL: when the narrowed set is EMPTY the tree must come
  //     out EMPTY, never fall back to the full unit — that fallback is what expanded
  //     the whole unit. A narrowing mode with zero matches shows nothing, not
  //     everything. (This guards the staging regression: if upgradablePaths
  //     transiently empties while a stage/unstage churns the set, the view must stay
  //     narrowed.) Selecting the set inside this memo — rather than falling back on a
  //     null result — makes that structural, not a convention a caller must honour.
  //
  // Reference stability (the "whole unit expands" invariant): none of these deps
  // changes on stage/unstage. narrowedPaths deliberately returns the SAME Set
  // reference while stagedPaths ⊆ baseNarrowedPaths (see above), and filteredPaths /
  // allPaths / groupedEntries are all staging-independent — so a stage/unstage
  // produces no new node objects, no NodeRow remounts, and no expansion reset.
  const activeTree = useMemo(() => {
    const visiblePaths = narrowedPaths
      ? allPaths.filter(({ path }) => narrowedPaths.has(path))
      : filteredPaths;
    return injectKeyContext(
      buildResourceGroupedTree(selectGroupedEntries(groupedEntries, visiblePaths), { scopedWritesSupported, fullDocumentScopes: documentScopes }),
      allPaths,
    );
  }, [narrowedPaths, filteredPaths, allPaths, groupedEntries, scopedWritesSupported, documentScopes]);

  // Optimistic pending folders: only show if their path isn't already in allPaths
  // (i.e. disappear once a child write lands and causes a refetch that includes them)
  const activePendingFolders = useMemo(
    () => pendingEmptyFolders.filter((pf) => !allPaths.some((p) => p.path.startsWith(`${pf.fullPath}.`))),
    [pendingEmptyFolders, allPaths],
  );
  const treeWithOptimisticFolders = useMemo(
    () => injectPendingFolders(activeTree, activePendingFolders),
    [activeTree, activePendingFolders],
  );

  const activeChangedPaths = useMemo(() => {
    if (filterMode === 'upgradable') return new Set(upgradablePaths);
    if (scopeFilter === 'local-overrides') return new Set(variationPaths);
    if (scopeFilter === 'local-only') return new Set(unit.variationEntry?.localOnlyPaths ?? []);
    if (scopeFilter === 'kept-on-merge') return keptOnMergePaths;
    return changedPaths;
  }, [filterMode, scopeFilter, variationPaths, upgradablePaths, changedPaths, unit.variationEntry, keptOnMergePaths]);

  const isMassive = allPaths.length >= MASSIVE_UNIT_THRESHOLD;

  // Precompute prefix-index ONCE per build (sorted-path binary search for counts,
  // ancestor Sets for O(1) membership). Replaces the per-folder O(allPaths) scans
  // that previously ran inside every NodeRow render. Keyed on the same inputs the
  // folder rows consume so counts/ancestor flags stay consistent with the tree.
  const prefixIndex = useMemo(
    () => buildPrefixIndex(allPaths, activeChangedPaths, upgradeFieldDiffs, variationFieldDiffs, isMassive),
    [allPaths, activeChangedPaths, upgradeFieldDiffs, variationFieldDiffs, isMassive],
  );

  // Provide staged membership via context (instead of drilling the Set through
  // every NodeRow) so a stage/unstage re-renders only the mounted leaves that read
  // membership — not every folder in the tree.
  const membership = useMemo<MembershipContextValue>(
    // committedBaseline is a ref-held map read fresh at leaf render; it is (re)populated on
    // commit, when committedDiffs (a dep) also changes, so the context refreshes with it.
    // downstreamValueByPath changes on refetch, refreshing every leaf's convergence check.
    () => ({ stagedPaths, committedDiffs, committedAddPaths, committedBaseline: committedBaselineRef.current, downstreamValueByPath, stagedEditedValues, onRevertEdit, stagedProtection, onToggleProtection }),
    [stagedPaths, committedDiffs, committedAddPaths, downstreamValueByPath, stagedEditedValues, onRevertEdit, stagedProtection, onToggleProtection],
  );

  return (
    <MembershipContext.Provider value={membership}>
    <Box>
      {isMassive && !collapseBannerDismissed && (
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            mx: 1,
            mt: '6px',
            mb: '2px',
            px: '10px',
            py: '7px',
            borderRadius: '7px',
            border: `1px solid ${componentTheme.borderMuted}`,
            background: componentTheme.bgSubtle,
            fontSize: 11,
            fontFamily: componentTheme.fontSans,
            color: componentTheme.fgMuted,
          }}
        >
          <Box component="span" sx={{ flexShrink: 0, opacity: 0.7, lineHeight: 1 }}>
            <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ width: 12, height: 12, display: 'block' }}>
              <circle cx="7" cy="7" r="5.5" />
              <line x1="7" y1="5" x2="7" y2="7.5" />
              <circle cx="7" cy="9.5" r="0.6" fill="currentColor" stroke="none" />
            </svg>
          </Box>
          <Box component="span" sx={{ flex: 1, lineHeight: 1.4 }}>
            Large unit ({allPaths.length.toLocaleString()} fields) — folders collapsed by default for performance. Sections with changes are expanded.
          </Box>
          <Box
            component="button"
            onClick={() => setCollapseBannerDismissed(true)}
            sx={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: '2px',
              borderRadius: '4px',
              color: componentTheme.fgSubtle,
              flexShrink: 0,
              lineHeight: 1,
              transition: 'color .12s, background .12s',
              '&:hover': { color: componentTheme.fgDefault, background: componentTheme.bgInset },
            }}
            aria-label="Dismiss"
          >
            <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" style={{ width: 11, height: 11 }}>
              <line x1="2" y1="2" x2="10" y2="10" />
              <line x1="10" y1="2" x2="2" y2="10" />
            </svg>
          </Box>
        </Box>
      )}
      {commitSerializationError && (
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            mx: 1,
            mt: '6px',
            mb: '2px',
            px: '10px',
            py: '7px',
            borderRadius: '7px',
            border: `1px solid ${DEL_BAR}44`,
            background: DEL_TINT,
            fontSize: 11,
            fontFamily: componentTheme.fontSans,
            color: DEL_BAR,
          }}
        >
          <Box component="span" sx={{ flex: 1, lineHeight: 1.4 }}>
            {commitSerializationError}. Staged changes were not committed — fix the issue and try again.
          </Box>
          <Box
            component="button"
            onClick={() => setCommitSerializationError(null)}
            sx={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: '2px',
              borderRadius: '4px',
              color: DEL_BAR,
              flexShrink: 0,
              lineHeight: 1,
              transition: 'opacity .12s',
              '&:hover': { opacity: 0.7 },
            }}
            aria-label="Dismiss"
          >
            <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" style={{ width: 11, height: 11 }}>
              <line x1="2" y1="2" x2="10" y2="10" />
              <line x1="10" y1="2" x2="2" y2="10" />
            </svg>
          </Box>
        </Box>
      )}
      {filteredPaths.length === 0 && (
        <Box sx={{ px: 2, py: 2, fontSize: 12, fontFamily: componentTheme.fontSans, color: componentTheme.fgMuted, fontStyle: 'italic' }}>
          {filterText ? `No matches for "${filterText}"` : 'No configuration data'}
        </Box>
      )}

      {treeWithOptimisticFolders.map((node) => {
        // Identity of this root row. For an ordinary node at depth 0 the path IS
        // the key; a document wrapper's key is a display label, so it is addressed
        // by its own id instead — matching on the label would never fire, and
        // matching on its ('') path would fire for every wrapper at once.
        const nodeId = node.document?.id ?? node.key;
        const sharedRootProps = {
          depth: 0,
          filterText,
          filterMode,
          readOnly,
          pathPrefix: '' as const,
          upgradeFieldDiffs,
          variationFieldDiffs,
          liveVariationPaths,
          allPaths,
          upstreamOnlyPaths,
          changedPaths: activeChangedPaths,
          changedDiffs,
          prefixIndex,
          onStagePath,
          onUnstagePath,
          onStageEdit,
          onSetFieldValue,
          onDeleteFieldValue,
          isProtected,
          onRequestProtectionData,
          valueOverlay,
          fieldPathMeta,
          upgradeCreatedAt: unit.upgradeEntry?.upstreamCreatedAt,
          upgradeDescription: unit.upgradeEntry?.upstreamDescription,
          upgradeSourceName: unit.upgradeEntry?.parentDeploymentName,
          upgradeRevisionNum: unit.upgradeEntry?.upstreamHeadRevisionNum,
          upgradeSourceSpaceId: unit.upgradeEntry?.parentSpaceId,
          upgradeSourceUnitId: unit.upgradeEntry?.parentUnitId,
          upgradeIsHistorical: unit.upgradeEntry?.historical,
          headRevisionCreatedAt: unit.applyEntry?.headRevisionCreatedAt,
          headRevisionDescription: unit.applyEntry?.headRevisionDescription,
          spaceId: unit.spaceId,
          unitId: unit.unitId,
          inspectPath,
          onInspectPath: setInspectPath,
          variationEntry: unit.variationEntry,
          deploymentName: unit.slug,
          deployments,
          unitsByDeployment,
          composing,
          pendingRemovals,
          recentlyAddedPaths,
          onOpenComposer,
          onCommitComposer,
          onCancelComposer,
          onRemove,
          onUndoRemove,
        } as const;
        return (
          <Fragment key={nodeId}>
            {composing && composing.insertBeforeId === nodeId && (
              <ComposerRow
                desc={composing}
                allPaths={allPaths}
                onCommit={onCommitComposer}
                onCancel={onCancelComposer}
              />
            )}
            <NodeRow node={node} {...sharedRootProps} />
          </Fragment>
        );
      })}
    </Box>
    </MembershipContext.Provider>
  );
});

ComponentValuesSection.displayName = 'ComponentValuesSection';
