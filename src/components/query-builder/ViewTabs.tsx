// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
  type UniqueIdentifier,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  horizontalListSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

import AddIcon from '@mui/icons-material/Add';
import CheckIcon from '@mui/icons-material/Check';
import CloseIcon from '@mui/icons-material/Close';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import DashboardIcon from '@mui/icons-material/Dashboard';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import EditIcon from '@mui/icons-material/Edit';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import LinkIcon from '@mui/icons-material/Link';
import RestoreIcon from '@mui/icons-material/Restore';
import SaveIcon from '@mui/icons-material/Save';
import Box from '@mui/material/Box';
import ClickAwayListener from '@mui/material/ClickAwayListener';
import Divider from '@mui/material/Divider';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Popper from '@mui/material/Popper';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { alpha, styled } from '@mui/material/styles';

import { useAppDispatch } from '@/hooks/useApp';
import { useApiErrorMessage } from '@/hooks/useApiErrorMessage';
import { ConfirmationModal } from '@/components/confirmation-modal/ConfirmationModal';
import { getApiErrorMessage } from '@/utility/error-functions';
import {
  type ExtendedViewRead,
  type SpaceRead,
  useCreateViewMutation,
  useDeleteViewMutation,
  usePatchViewMutation,
} from '@confighub/rtk-query';
import { setAlert } from '@/state/slices/alert';
import { DEFAULT_UNIT_COLUMNS, getColumnsFromDelta } from '@/utility/column-delta-functions';
import { VIEW_URL_PARAMS } from '@/utility/constants/url-params';
import { readLiveSearchParams } from '@/utility/live-search-params';
import {
  DEFAULT_VIEW_GROUP_BY,
  GROUP_BY_ANNOTATION_KEY,
  VIEW_KIND_ANNOTATION_KEY,
  buildGroupByAnnotationValue,
} from './groupBy-annotation';


/** Factory that builds the DnD accessibility object for the tab strip.
 * Extracted so it can be defined once at module level rather than re-created
 * as an object literal on every render. */
function buildDndAccessibility(
  getViewDisplayName: (id: UniqueIdentifier) => string,
  openSortedViewIds: string[],
) {
  return {
    announcements: {
      onDragStart({ active }: { active: { id: UniqueIdentifier } }) {
        return `Picked up tab "${getViewDisplayName(active.id)}". Press arrow keys to reorder, Space or Enter to drop.`;
      },
      onDragOver({
        active,
        over,
      }: {
        active: { id: UniqueIdentifier };
        over: { id: UniqueIdentifier } | null;
      }) {
        if (!over) return undefined;
        const pos = openSortedViewIds.indexOf(String(over.id)) + 1;
        return `Tab "${getViewDisplayName(active.id)}" is now at position ${pos} of ${openSortedViewIds.length}.`;
      },
      onDragEnd({
        active,
        over,
      }: {
        active: { id: UniqueIdentifier };
        over: { id: UniqueIdentifier } | null;
      }) {
        if (!over) {
          return `Tab "${getViewDisplayName(active.id)}" was returned to its original position.`;
        }
        const pos = openSortedViewIds.indexOf(String(over.id)) + 1;
        return `Tab "${getViewDisplayName(active.id)}" dropped at position ${pos} of ${openSortedViewIds.length}.`;
      },
      onDragCancel({ active }: { active: { id: UniqueIdentifier } }) {
        return `Drag cancelled. Tab "${getViewDisplayName(active.id)}" was returned to its original position.`;
      },
    },
  };
}

/** Reserved tab ID for the "All items" sentinel tab (entity-agnostic). */
export const SENTINEL_TAB_ID = '__all__';

/**
 * Convert a display name to a URL-safe slug compatible with the server's
 * character restrictions (`[a-zA-Z0-9_.-]`).
 *
 * - Lowercases the input
 * - Replaces runs of invalid characters with a single hyphen
 * - Strips leading/trailing hyphens
 */
// eslint-disable-next-line react-refresh/only-export-components
export const slugify = (name: string): string =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9_.]+/g, '-')
    .replace(/^-+|-+$/g, '');

/**
 * Pure function — computes the new `openTabIds` array after a drag reorder.
 *
 * Extracted so it can be unit-tested without any React or DOM setup.
 *
 * @param openTabIds - The full current list including the sentinel if present.
 * @param viewTabIds - Ordered view-only IDs (sentinel excluded), i.e. the
 *   SortableContext's `items` array.
 * @param activeId  - The ID of the tab being dragged.
 * @param overId    - The ID of the tab it was dropped onto.
 * @returns The updated openTabIds array with the sentinel preserved at index 0.
 */
// eslint-disable-next-line react-refresh/only-export-components
export function computeReorderedTabIds(
  openTabIds: string[],
  viewTabIds: string[],
  activeId: string,
  overId: string,
): string[] {
  if (activeId === overId) return openTabIds;
  const oldIndex = viewTabIds.indexOf(activeId);
  const newIndex = viewTabIds.indexOf(overId);
  if (oldIndex === -1 || newIndex === -1) return openTabIds;
  const reordered = arrayMove(viewTabIds, oldIndex, newIndex);
  return [
    ...(openTabIds.includes(SENTINEL_TAB_ID) ? [SENTINEL_TAB_ID] : []),
    ...reordered,
  ];
}

const RUST_600 = '#ba3d03';
const RUST_50 = 'rgba(186, 61, 3, 0.08)';
const RUST_100 = 'rgba(186, 61, 3, 0.18)';
const OK_600 = '#2f7d32';
const WARN_600 = '#d4620f';
const WARN_50 = 'rgba(212, 98, 15, 0.10)';

/**
 * Outer chrome — GitHub-Projects-style strip.
 *
 * The container is a stacking parent with a 1px bottom rule; the active
 * tab "breaks through" that rule via `marginBottom: -1` + `borderBottom: none`
 * so it reads as a manila-folder tab merging into the content below.
 *
 * No card outline, no border-radius, no shadow — minimal chrome on purpose.
 */
const Container = styled(Box)(({ theme }) => ({
  position: 'relative',
  width: '100%',
  borderBottom: `1px solid ${theme.palette.divider}`,
}));

/** Single horizontal row that holds the tab strip + the right-hand tail. */
const Row = styled(Box)({
  display: 'flex',
  alignItems: 'stretch',
});

/**
 * Outer flex item that owns the horizontal scroll viewport and the add button.
 * The add button is anchored to the right (outside the scroll viewport) so it
 * stays visible while the tabs scroll. A gradient overlay sits between the
 * two so tabs fade into the page background instead of cutting off abruptly.
 */
const StripContainer = styled(Box)({
  display: 'flex',
  alignItems: 'stretch',
  flex: 1,
  minWidth: 0,
});

/**
 * Relative wrapper around the scrolling Strip so the gradient overlay can be
 * absolutely positioned against the scroll viewport's right edge — sitting on
 * top of tabs that scroll under it, but never covering the trailing divider
 * or add button (those are siblings of this wrapper, not children).
 */
const StripScrollWrapper = styled(Box)({
  position: 'relative',
  display: 'flex',
  alignItems: 'stretch',
  flex: 1,
  minWidth: 0,
});

/**
 * Inner horizontal scroller. Holds the sentinel + sortable tabs + trailing
 * divider. Scrollbar is hidden cross-browser — narrow-viewport overflow is
 * communicated visually via the gradient fade-out next to the add button.
 */
const Strip = styled(Box)({
  display: 'flex',
  alignItems: 'stretch',
  flex: 1,
  minWidth: 0,
  overflowX: 'auto',
  paddingLeft: 16,
  // Hide the native scrollbar cross-browser. The gradient fade-out next to the
  // add button is the only affordance signalling that the tabs scroll.
  scrollbarWidth: 'none',
  msOverflowStyle: 'none',
  '&::-webkit-scrollbar': { display: 'none' },
});

/**
 * Gradient fade-out painted over the right edge of the scroll viewport, just
 * to the left of the trailing divider + add button. Lets tabs that have
 * scrolled under the right edge dissolve into the page background instead of
 * being clipped abruptly. Uses `background.default` (the page color) so it
 * blends seamlessly regardless of light/dark mode.
 *
 * `pointer-events: none` ensures it never blocks tab clicks underneath.
 */
const ScrollFade = styled('span')(({ theme }) => ({
  position: 'absolute',
  top: 0,
  right: 0,
  bottom: 0,
  width: 32,
  pointerEvents: 'none',
  background: `linear-gradient(to right, ${alpha(theme.palette.background.default, 0)} 0%, ${theme.palette.background.default} 100%)`,
  zIndex: 1,
}));

/**
 * Vertical pipe separator rendered between two adjacent inactive tabs only.
 * GitHub Projects hides the pipe when either neighbour is active so the
 * folder-tab edge can read clearly against the strip.
 */
const Pipe = styled('span')(({ theme }) => ({
  alignSelf: 'center',
  width: 1,
  height: 16,
  background: theme.palette.divider,
  flexShrink: 0,
}));

const Tab = styled('button', {
  shouldForwardProp: (prop) => prop !== '$active' && prop !== '$sentinel',
})<{ $active?: boolean; $sentinel?: boolean }>(({ theme, $active }) => ({
  position: 'relative',
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  height: 36,
  padding: '0 12px',
  // Tab carries left/top/right borders only when active. We always reserve a
  // 1px transparent border so the inactive ↔ active transition doesn't shift
  // surrounding tabs by 1px.
  border: '1px solid transparent',
  borderBottom: 'none',
  borderTopLeftRadius: 6,
  borderTopRightRadius: 6,
  background: 'transparent',
  color: $active ? theme.palette.text.primary : theme.palette.text.secondary,
  fontSize: 13,
  fontWeight: $active ? 600 : 500,
  // Native <button> doesn't reliably inherit `font-family` across browsers, so
  // reach for the MUI theme directly. Keeps the strip on Roboto with the rest
  // of the app.
  fontFamily: theme.typography.fontFamily,
  // Suppress the browser default focus ring on click. Keyboard focus uses
  // `:focus-visible` below.
  outline: 'none',
  cursor: 'pointer',
  whiteSpace: 'nowrap',
  transition: 'background 120ms ease, color 120ms ease, font-weight 120ms ease',
  userSelect: 'none',
  '&:hover': {
    background: $active
      ? theme.palette.background.paper
      : alpha(theme.palette.text.primary, 0.04),
    color: theme.palette.text.primary,
    fontWeight: 600,
  },
  '&:focus': { outline: 'none' },
  '&:focus-visible': {
    outline: `2px solid ${RUST_600}`,
    outlineOffset: -2,
  },
  // Show close button when hovering or active
  '&:hover [data-close]': { opacity: 1 },
  ...($active && {
    background: theme.palette.background.paper,
    borderColor: theme.palette.divider,
    fontWeight: 600,
    // Paint over the Container's 1px bottom border with a box-shadow in the
    // same color as the page background. box-shadow renders in stacking context,
    // not scroll context, so it isn't clipped by overflowX: auto on Strip.
    boxShadow: `0 1px 0 ${theme.palette.background.paper}`,
    zIndex: 1,
    '& [data-close]': { opacity: 1 },
  }),
}));

const TabIcon = styled(Box, {
  shouldForwardProp: (prop) => prop !== '$active',
})<{ $active?: boolean }>(({ theme, $active }) => ({
  color: $active ? theme.palette.text.primary : theme.palette.text.secondary,
  display: 'inline-flex',
  alignItems: 'center',
  flexShrink: 0,
  fontSize: 14,
  '& svg': { fontSize: 14 },
}));

const TabLabel = styled('span')({
  maxWidth: '28ch',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
});

/**
 * Inline-rename input — replaces the tab label per Section 3.7 of the design.
 *
 * Sized to feel like a soft inset on top of the tab so the strip never reflows
 * as the user types. The rust-50 fill, rust-100 border, and rust halo match
 * the active-tab tokens so the rename surface reads as part of the tab itself.
 */
const RenameInput = styled('input')(({ theme }) => ({
  display: 'inline-flex',
  alignItems: 'center',
  height: 22,
  padding: '0 8px',
  margin: 0,
  border: `1px solid ${RUST_100}`,
  borderRadius: 6,
  background: RUST_50,
  boxShadow: `0 0 0 3px ${alpha(RUST_600, 0.08)}`,
  color: theme.palette.text.primary,
  fontFamily: theme.typography.fontFamily,
  fontWeight: 600,
  fontSize: 13,
  letterSpacing: 'inherit',
  outline: 'none',
  caretColor: RUST_600,
  // Sized to fit the longest reasonable view name without horizontal jitter.
  // Strip auto-scrolls if the input grows past the viewport.
  width: 'auto',
  minWidth: '12ch',
  maxWidth: '36ch',
  '&::selection': {
    background: alpha(RUST_600, 0.18),
  },
}));

const ModifiedDot = styled('span')({
  width: 7,
  height: 7,
  borderRadius: 999,
  background: WARN_600,
  boxShadow: `0 0 0 3px ${WARN_50}`,
  flexShrink: 0,
  marginLeft: 2,
  display: 'inline-block',
});

/**
 * Caret/chevron rendered to the right of the active tab's label.
 * Only the active tab gets one; clicking opens the kebab menu (rename /
 * duplicate / copy link / delete). Inactive tabs stay text-only at rest.
 */
const TabKebab = styled('span')(({ theme }) => ({
  width: 18,
  height: 18,
  marginLeft: 2,
  marginRight: -4,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: 4,
  color: theme.palette.text.secondary,
  transition: 'background 120ms ease, color 120ms ease',
  cursor: 'pointer',
  '&:hover': {
    background: alpha(theme.palette.text.primary, 0.10),
    color: theme.palette.text.primary,
  },
  '& svg': { fontSize: 16 },
}));

/**
 * Inline × close button on each tab. Hidden by default; shown on tab
 * hover/active via CSS on the parent `Tab` targeting `[data-close]`.
 */
const CloseButton = styled('span')(({ theme }) => ({
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 14,
  height: 14,
  marginLeft: 2,
  marginRight: -2,
  borderRadius: 3,
  flexShrink: 0,
  opacity: 0,
  color: theme.palette.text.secondary,
  transition: 'opacity 120ms ease, background 120ms ease, color 120ms ease',
  cursor: 'pointer',
  '& svg': { fontSize: 12 },
  '&:hover': {
    background: alpha(theme.palette.text.primary, 0.10),
    color: theme.palette.text.primary,
  },
}));

/**
 * "+" button placed as the last child of `<Strip>`.
 * Opens the Tab Management Menu for pinning/unpinning views.
 */
const AddTabButton = styled('button')(({ theme }) => ({
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  alignSelf: 'center',
  height: 26,
  width: 26,
  padding: 0,
  margin: '0 4px',
  border: '1px solid transparent',
  borderRadius: 6,
  background: 'transparent',
  color: theme.palette.text.secondary,
  cursor: 'pointer',
  flexShrink: 0,
  transition: 'background 120ms ease, color 120ms ease',
  fontFamily: theme.typography.fontFamily,
  outline: 'none',
  '& svg': { fontSize: 16 },
  '&:hover': {
    background: alpha(theme.palette.text.primary, 0.06),
    color: theme.palette.text.primary,
  },
  '&:focus': { outline: 'none' },
  '&:focus-visible': {
    outline: `2px solid ${RUST_600}`,
    outlineOffset: -2,
  },
}));

/**
 * Trailing close button inside the Tab Management Menu for already-open views.
 */
const MenuItemCloseButton = styled('span')(({ theme }) => ({
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 20,
  height: 20,
  borderRadius: 4,
  color: theme.palette.text.secondary,
  cursor: 'pointer',
  flexShrink: 0,
  marginLeft: 'auto',
  transition: 'background 120ms ease, color 120ms ease',
  '& svg': { fontSize: 14 },
  '&:hover': {
    background: alpha(theme.palette.text.primary, 0.10),
    color: theme.palette.text.primary,
  },
}));

const Tail = styled(Box)({
  display: 'flex',
  alignItems: 'center',
  gap: 2,
  paddingLeft: 8,
  flexShrink: 0,
});

const TailIconButton = styled('button', {
  shouldForwardProp: (prop) => prop !== '$primary',
})<{ $primary?: boolean }>(({ theme, $primary }) => ({
  // Match the strip height (~32px) so the tail visually aligns with the tabs.
  height: 32,
  minWidth: 32,
  padding: '0 10px',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 6,
  borderRadius: 6,
  border: 0,
  color: $primary ? theme.palette.text.primary : theme.palette.text.secondary,
  fontSize: 13,
  fontWeight: 500,
  fontFamily: theme.typography.fontFamily,
  outline: 'none',
  cursor: 'pointer',
  background: 'transparent',
  transition: 'background 140ms ease, color 140ms ease',
  '&:focus': { outline: 'none' },
  '&:focus-visible': {
    outline: `2px solid ${RUST_600}`,
    outlineOffset: -2,
  },
  '&:hover': {
    background: alpha(theme.palette.text.primary, 0.06),
    color: theme.palette.text.primary,
  },
  '&:disabled': {
    cursor: 'not-allowed',
    opacity: 0.4,
  },
  '& svg': { fontSize: 16 },
}));

/** Shared sx for every MenuItem in the Tab Management and Kebab menus. */
const MENU_ITEM_SX = { borderRadius: '6px', fontSize: 13, minHeight: 34, py: 0.5 } as const;

/** Shared paper sx for Menu dropdowns (Tab Management and Kebab). */
const menuPaperSx = (width: number) => ({
  width,
  borderRadius: '10px',
  boxShadow: '0 24px 60px -28px rgba(20, 22, 28, 0.30), 0 4px 16px -4px rgba(20, 22, 28, 0.12)',
  p: '6px',
  '& .MuiList-root': { p: 0 },
});

const InlinePopoverPaper = styled(Box)(({ theme }) => ({
  width: 260,
  background: theme.palette.background.paper,
  border: `1px solid ${theme.palette.divider}`,
  borderRadius: 10,
  boxShadow: '0 24px 60px -28px rgba(20, 22, 28, 0.30)',
  padding: 6,
  fontSize: 13,
  zIndex: 1300,
  overflow: 'hidden',
}));

const InlineFormInput = styled('input')(({ theme }) => ({
  width: '100%',
  padding: '7px 10px',
  border: `1px solid ${theme.palette.divider}`,
  borderRadius: 7,
  background: theme.palette.background.paper,
  color: theme.palette.text.primary,
  fontFamily: theme.typography.fontFamily,
  fontSize: 13,
  outline: 'none',
  boxSizing: 'border-box',
  '&:focus': {
    borderColor: RUST_600,
    boxShadow: `0 0 0 3px rgba(186, 61, 3, 0.10)`,
  },
  '&::placeholder': { color: theme.palette.text.disabled },
  '&:disabled': { opacity: 0.6, cursor: 'not-allowed' },
}));

const InlineFormError = styled(Box)(({ theme }) => ({
  fontSize: 11.5,
  color: theme.palette.error.main,
  padding: '4px 2px 0',
}));

const InlineFormSubmitButton = styled('button')(({ theme }) => ({
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
  padding: '5px 12px',
  border: 0,
  background: RUST_600,
  color: '#fff',
  fontSize: 12.5,
  fontWeight: 600,
  fontFamily: theme.typography.fontFamily,
  borderRadius: 6,
  cursor: 'pointer',
  outline: 'none',
  transition: 'opacity 140ms ease',
  '&:hover': { opacity: 0.88 },
  '&:focus': { outline: 'none' },
  '&:disabled': { opacity: 0.45, cursor: 'not-allowed' },
  '& svg': { fontSize: 14 },
}));

interface SortableViewTabWrapperProps {
  id: string;
  /** Disable dragging while a rename is in progress on this tab. */
  disabled: boolean;
  children: React.ReactNode;
}

/**
 * Thin drag-and-drop wrapper for an individual saved-view tab.
 * Uses @dnd-kit/sortable to provide horizontal reorder via pointer drag.
 * The sentinel tab is never wrapped — it stays locked at position 0.
 */
const SortableViewTabWrapper = ({
  id,
  disabled,
  children,
}: SortableViewTabWrapperProps) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id, disabled });

  return (
    <div
      ref={setNodeRef}
      style={{
        display: 'flex',
        alignItems: 'stretch',
        transform: CSS.Transform.toString(transform) ?? undefined,
        transition,
        opacity: isDragging ? 0.4 : 1,
        zIndex: isDragging ? 10 : undefined,
        position: 'relative',
        touchAction: 'none',
      }}
      {...attributes}
      {...listeners}
    >
      {children}
    </div>
  );
};

interface ViewTabsProps {
  /** Currently active view (null = "All units" sentinel selected) */
  activeView: ExtendedViewRead | null;
  /** Whether the active view has been locally modified */
  isModified?: boolean;
  /**
   * Set of view/sentinel IDs whose persisted draft differs from the saved
   * view baseline.  Non-active tabs show a ModifiedDot when their ID is in
   * this set.  Membership is computed at render time via
   * compareDraftToView in `view-comparison.ts` — the same primitives that
   * drive `isModified` for the active tab — so the two dots agree about
   * what "modified" means.
   */
  modifiedTabIds?: Set<string>;
  /** Selecting a view (null = sentinel "All units") */
  onSelectView: (view: ExtendedViewRead) => void;
  /** Clearing back to "All units" sentinel */
  onClearView: () => void;
  /** Entity type for filtering views */
  entityType?: string;
  /** Whether the strip is disabled */
  disabled?: boolean;
  /** Called after a new view is successfully created so the parent can switch to it. */
  onViewCreated?: (view: ExtendedViewRead) => void;
  /** Space ID for create/patch mutations. */
  spaceId?: string;
  /** Current filter ID pre-populated into new views. */
  filterId?: string;
  /** Optional sentinel label override (default "All <entityType>s") */
  sentinelLabel?: string;
  /** Live groupBy columns (overrides the URL's groupBy param when saving). */
  localGroupByColumns?: string[];
  /**
   * Namespaces the created View with a `ui.confighub.io/view-kind` annotation
   * (see `useQueryBuilder`'s `viewKind` option). Written on both create and
   * duplicate, since both flows share `buildViewPayloadFields`. Omit for the
   * default (unannotated) view kind — every existing caller does.
   */
  viewKind?: string;
  /** Default Columns for a new view's create payload (default `DEFAULT_UNIT_COLUMNS`). */
  defaultColumns?: string[];
  /** Default GroupBy levels (comma-joined) for a new view's create payload
   * (default `DEFAULT_VIEW_GROUP_BY`). */
  defaultGroupBy?: string;
  /**
   * Ordered set of open tab IDs. SENTINEL_TAB_ID ('__all_units__') represents
   * the "All units" sentinel tab; all other values are saved-view ViewIDs.
   */
  openTabIds: string[];
  /**
   * All views for this entity type (pre-filtered and sorted by the parent).
   * Drives both the rendered tab strip and the "+" tab-manager dropdown.
   */
  allViews: ExtendedViewRead[];
  /** Pin a tab (add its ID to openTabIds). */
  onOpenTab: (tabId: string) => void;
  /** Unpin a tab (remove its ID from openTabIds). */
  onCloseTab: (tabId: string) => void;
  /**
   * Called when the user drags a view tab to a new position.
   * Receives the full new openTabIds array (sentinel preserved at position 0
   * if present) so the caller can update state + persist to localStorage.
   */
  onReorderTabs: (newTabIds: string[]) => void;
  /**
   * Called once on mount with a function that opens the "Create new view" popover.
   * Allows external callers (e.g. handleSave on the sentinel tab) to trigger the popover.
   */
  onRegisterOpenNewView?: (openFn: () => void) => void;
  /**
   * Save the current view state. Shown in the kebab menu when the active view is
   * modified. Also triggered by Cmd/Ctrl+S (handled in useQueryBuilder).
   */
  onSave?: () => void;
  /**
   * Revert the current view to its saved baseline. Shown in the kebab menu when
   * the active view is modified.
   */
  onRevert?: () => void;
  /**
   * Mint a Filter for a brand-new view when the user hasn't selected one.
   * Lets the "Create view" flow be one click instead of forcing the user to
   * create a filter first. Returns null on failure — caller surfaces an error.
   */
  onCreateFilterForNewView?: (
    displayName: string,
    targetSpaceId: string,
  ) => Promise<{ FilterID?: string } | null>;
}

/**
 * Horizontal Views-as-Tabs strip — replaces the legacy MUI Select dropdown.
 *
 * Modelled on GitHub Projects: a sentinel "All units" tab on the left, one tab
 * per saved view, and an active rust underline on the selected tab. The `+`
 * button at the end of the strip opens a tab-manager menu for pinning/unpinning
 * views and creating new ones.
 *
 * The Tail to the right of the strip shows inline rename controls (save / cancel)
 * only while a tab rename is in progress; it is empty otherwise.
 *
 * The set of visible tabs is driven by `openTabIds`.
 */
export const ViewTabs = ({
  activeView,
  isModified = false,
  modifiedTabIds,
  onSelectView,
  onClearView,
  entityType = 'Unit',
  disabled = false,
  onViewCreated,
  spaceId,
  filterId,
  sentinelLabel,
  localGroupByColumns,
  viewKind,
  defaultColumns = DEFAULT_UNIT_COLUMNS,
  defaultGroupBy = DEFAULT_VIEW_GROUP_BY,
  openTabIds,
  allViews,
  onOpenTab,
  onCloseTab,
  onReorderTabs,
  onRegisterOpenNewView,
  onSave,
  onRevert,
  onCreateFilterForNewView,
}: ViewTabsProps) => {
  const dispatch = useAppDispatch();
  const [deleteView, { error: deleteViewError, isSuccess: isDeleteViewSuccess }] =
    useDeleteViewMutation();
  const [patchView] = usePatchViewMutation();
  const [createView] = useCreateViewMutation();

  // Shared helper: build the view payload fields from URL params + live groupBy state.
  // GroupBy is now sidebar-only (GroupNavPanel) — GroupBy levels are no longer injected
  // into the Columns list.
  //
  // Grouping is persisted ONLY via the `ui.confighub.io/group-by` annotation;
  // we don't write View.GroupBy because the backend validates it against the
  // view's Columns set, which rejects dotted dynamic columns like
  // `Labels.AppOwner`.
  //
  // CREATE-only path. PATCH lives in useQueryBuilder.handleSave; here we own
  // the whole annotation map on a brand-new entity, so we omit it when there's
  // no grouping rather than writing a null sentinel.
  //
  // Reads the LIVE URL when called, not render-time search params: a
  // grouping edit made just before Save can still be waiting in a pending
  // router transition, so this render's params would miss it — see
  // `readLiveSearchParams`.
  const buildViewPayloadFields = useCallback(() => {
    const searchParams = readLiveSearchParams();
    const groupBy = searchParams.get(VIEW_URL_PARAMS.GROUP_BY);
    const columns = searchParams.get(VIEW_URL_PARAMS.COLUMNS);
    const orderBy = searchParams.get(VIEW_URL_PARAMS.ORDER_BY);
    const orderByDirection = searchParams.get(VIEW_URL_PARAMS.ORDER_BY_DIRECTION);
    const finalColumns = columns
      ? getColumnsFromDelta(columns)
      : defaultColumns.map((col) => ({ Name: col }));
    // Live levels win over the URL param when present.  Fall back to the URL
    // param split on comma (handles the "saved view loaded straight into the
    // duplicate flow" case where the URL has the multi-level value).  New
    // views without explicit grouping default to `defaultGroupBy` so every
    // saved view starts with a sensible grouping rather than empty — the
    // page's own default (e.g. Components' `Labels.Owner`),
    // not necessarily the Unit list's `Space`.
    const urlLevels = groupBy ? groupBy.split(',').map((s) => s.trim()).filter(Boolean) : [];
    const liveLevels = (localGroupByColumns && localGroupByColumns.length > 0)
      ? localGroupByColumns
      : (urlLevels.length > 0 ? urlLevels : [defaultGroupBy]);
    const annotationValue = buildGroupByAnnotationValue(liveLevels);
    const annotations: Record<string, string> = {};
    if (annotationValue !== null) annotations[GROUP_BY_ANNOTATION_KEY] = annotationValue;
    if (viewKind) annotations[VIEW_KIND_ANNOTATION_KEY] = viewKind;
    return {
      Annotations: Object.keys(annotations).length > 0 ? annotations : undefined,
      Columns: finalColumns,
      OrderBy: orderBy || undefined,
      OrderByDirection: (orderByDirection as 'ASC' | 'DESC') || undefined,
    };
  }, [localGroupByColumns, defaultColumns, defaultGroupBy, viewKind]);

  // Inline "New view" popover state
  const [newViewAnchor, setNewViewAnchor] = useState<HTMLElement | null>(null);
  const [newViewName, setNewViewName] = useState('');
  const [newViewError, setNewViewError] = useState<string | null>(null);
  const [isCreatingView, setIsCreatingView] = useState(false);
  const newViewInputRef = useCallback((el: HTMLInputElement | null) => { if (el) el.focus(); }, []);

  const closeNewViewPopover = useCallback(() => {
    setNewViewAnchor(null);
    setNewViewName('');
    setNewViewError(null);
    setIsCreatingView(false);
  }, []);

  // Register the open-new-view function so external callers (e.g. sentinel-tab Save)
  // can imperatively trigger the "Create new view" popover.
  useEffect(() => {
    onRegisterOpenNewView?.(() => {
      setNewViewName('');
      setNewViewError(null);
      setNewViewAnchor(addTabButtonRef.current);
    });
    // onRegisterOpenNewView is a stable callback — run only once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleNewViewSubmit = useCallback(async () => {
    const name = newViewName.trim();
    if (!name) { setNewViewError('View name is required'); return; }
    const targetSpaceId = spaceId ?? '';
    if (!targetSpaceId) { setNewViewError('No space available. Please reload and try again.'); return; }
    setIsCreatingView(true);
    setNewViewError(null);
    try {
      // Auto-mint a Filter from the current in-memory filter conditions so the
      // user doesn't have to create one first. Falls back to the active
      // filterId when the auto-create callback isn't wired or fails.
      const minted = await onCreateFilterForNewView?.(name, targetSpaceId);
      const viewFilterId = minted?.FilterID ?? filterId;
      if (!viewFilterId) {
        setNewViewError('Failed to create filter for view. Please try again.');
        setIsCreatingView(false);
        return;
      }
      const fields = buildViewPayloadFields();
      const result = await createView({
        spaceId: targetSpaceId,
        view: { DisplayName: name, Slug: slugify(name), FilterID: viewFilterId, ...fields },
      }).unwrap();
      dispatch(setAlert({ type: 'success', message: `Saved '${name}'`, isOpen: true }));
      const newViewResult: ExtendedViewRead = { View: result, Space: { SpaceID: targetSpaceId } as SpaceRead };
      onViewCreated?.(newViewResult);
      closeNewViewPopover();
    } catch {
      setNewViewError('Failed to create view. Please try again.');
      setIsCreatingView(false);
    }
  }, [newViewName, spaceId, filterId, createView, buildViewPayloadFields, dispatch, onViewCreated, closeNewViewPopover, onCreateFilterForNewView]);

  // Inline "Duplicate" popover state
  const [duplicateAnchor, setDuplicateAnchor] = useState<HTMLElement | null>(null);
  const [duplicateForView, setDuplicateForView] = useState<ExtendedViewRead | null>(null);
  const [duplicateName, setDuplicateName] = useState('');
  const [duplicateError, setDuplicateError] = useState<string | null>(null);
  const [isDuplicating, setIsDuplicating] = useState(false);
  const duplicateInputRef = useCallback((el: HTMLInputElement | null) => { if (el) el.focus(); }, []);

  const closeDuplicatePopover = useCallback(() => {
    setDuplicateAnchor(null);
    setDuplicateForView(null);
    setDuplicateName('');
    setDuplicateError(null);
    setIsDuplicating(false);
  }, []);

  const handleDuplicateSubmit = useCallback(async () => {
    const name = duplicateName.trim();
    if (!name) { setDuplicateError('View name is required'); return; }
    const viewSpaceId = duplicateForView?.View?.SpaceID ?? spaceId ?? '';
    if (!viewSpaceId) { setDuplicateError('No space available. Please reload and try again.'); return; }
    setIsDuplicating(true);
    setDuplicateError(null);
    try {
      // Mint a dedicated Filter for the duplicate so it doesn't share state
      // with the source view's filter. Fall back to the source view's
      // FilterID (then the active filterId) only when the auto-create
      // callback isn't available or fails.
      const minted = await onCreateFilterForNewView?.(name, viewSpaceId);
      const viewFilterId = minted?.FilterID ?? duplicateForView?.View?.FilterID ?? filterId;
      if (!viewFilterId) {
        setDuplicateError('Failed to create filter for view. Please try again.');
        setIsDuplicating(false);
        return;
      }
      const fields = buildViewPayloadFields();
      const result = await createView({
        spaceId: viewSpaceId,
        view: { DisplayName: name, Slug: slugify(name), FilterID: viewFilterId, ...fields },
      }).unwrap();
      dispatch(setAlert({ type: 'success', message: `Saved '${name}'`, isOpen: true }));
      const duplicateResult: ExtendedViewRead = { View: result, Space: { SpaceID: viewSpaceId } as SpaceRead };
      onViewCreated?.(duplicateResult);
      closeDuplicatePopover();
    } catch {
      setDuplicateError('Failed to duplicate view. Please try again.');
      setIsDuplicating(false);
    }
  }, [duplicateName, duplicateForView, spaceId, filterId, createView, buildViewPayloadFields, dispatch, onViewCreated, closeDuplicatePopover, onCreateFilterForNewView]);

  // Surface delete-view errors via the project's global Snackbar.
  // The mutation tuple's `error` resets to undefined when the user retries,
  // so this also fires the error toast on subsequent failures.
  useApiErrorMessage(
    deleteViewError,
    isDeleteViewSuccess,
    (message) => {
      if (!message) return;
      dispatch(
        setAlert({
          type: 'error',
          message,
          isOpen: true,
        }),
      );
    },
    {
      operationName: 'Delete view',
      defaultErrorMessage: 'Failed to delete the view. Please try again.',
    },
  );

  // Derive open views in the order dictated by openTabIds (browser-tab style: add order).
  // We index allViews by ViewID for O(1) lookup, then map openTabIds → view objects,
  // dropping the sentinel ID and any IDs not found in allViews.
  const allViewsById = useMemo(
    () => new Map(allViews.map((v) => [v.View?.ViewID ?? '', v])),
    [allViews],
  );
  const openSortedViews = useMemo(
    () =>
      openTabIds
        .filter((id) => id !== SENTINEL_TAB_ID && allViewsById.has(id))
        .map((id) => allViewsById.get(id)!),
    [openTabIds, allViewsById],
  );

  // Stable ID list for dnd-kit's SortableContext (sentinel excluded — it is locked).
  const openSortedViewIds = useMemo(
    () => openSortedViews.map((v) => v.View?.ViewID ?? ''),
    [openSortedViews],
  );

  // Pointer sensor (5 px activation — distinguishes click from drag) plus
  // keyboard sensor so tabs can be reordered via arrow keys.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const isSentinelOpen = openTabIds.includes(SENTINEL_TAB_ID);

  // Track which view ID is actively being dragged so we can render the overlay.
  const [dragActiveId, setDragActiveId] = useState<UniqueIdentifier | null>(null);

  // Delete confirmation modal state
  const [deleteConfirmView, setDeleteConfirmView] = useState<ExtendedViewRead | null>(null);

  const handleDragStart = useCallback(({ active }: DragStartEvent) => {
    setDragActiveId(active.id);
  }, []);

  const handleDragEnd = useCallback(
    ({ active, over }: DragEndEvent) => {
      setDragActiveId(null);
      if (!over || active.id === over.id) return;
      const newTabIds = computeReorderedTabIds(
        openTabIds,
        openSortedViewIds,
        String(active.id),
        String(over.id),
      );
      onReorderTabs(newTabIds);
    },
    [openTabIds, openSortedViewIds, onReorderTabs],
  );

  // Build screen-reader announcements for the drag interaction.
  const getViewDisplayName = useCallback(
    (id: UniqueIdentifier) =>
      allViewsById.get(String(id))?.View?.DisplayName ?? String(id),
    [allViewsById],
  );

  const dndAccessibility = useMemo(
    () => buildDndAccessibility(getViewDisplayName, openSortedViewIds),
    [getViewDisplayName, openSortedViewIds],
  );

  // Kebab menu state (one menu shared across tabs)
  const [kebabAnchor, setKebabAnchor] = useState<{
    el: HTMLElement;
    view: ExtendedViewRead;
  } | null>(null);

  const closeKebab = useCallback(() => setKebabAnchor(null), []);

  // Tab Management Menu ("+" button) state
  const addTabButtonRef = useRef<HTMLButtonElement | null>(null);
  const [addTabMenuAnchor, setAddTabMenuAnchor] = useState<HTMLElement | null>(null);
  const closeAddTabMenu = useCallback(() => setAddTabMenuAnchor(null), []);

  // Inline-rename state per Section 3.7. Only one view can be in rename mode
  // at a time; we hold the in-flight value separately so Esc can revert without
  // a per-keystroke round-trip to the server.
  const [renamingViewId, setRenamingViewId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const [renameError, setRenameError] = useState<string | null>(null);
  const [isSubmittingRename, setIsSubmittingRename] = useState(false);
  const renameInputRef = useRef<HTMLInputElement | null>(null);

  const activeViewId = activeView?.View?.ViewID ?? null;

  const beginRename = useCallback((view: ExtendedViewRead) => {
    const viewId = view.View?.ViewID;
    if (!viewId) return;
    setRenamingViewId(viewId);
    setRenameDraft(view.View?.DisplayName ?? '');
    setRenameError(null);
  }, []);

  const cancelRename = useCallback(() => {
    setRenamingViewId(null);
    setRenameDraft('');
    setRenameError(null);
    setIsSubmittingRename(false);
  }, []);

  // Focus & select-all on rename entry, before paint, so the user never sees
  // the input flicker as a blank field.
  useLayoutEffect(() => {
    if (renamingViewId) {
      const input = renameInputRef.current;
      if (input) {
        input.focus();
        input.select();
      }
    }
  }, [renamingViewId]);

  // F2 from anywhere (when the strip has focus or the active tab is selected)
  // enters rename mode on the active view. Mirrors the design's keyboard contract.
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'F2') return;
      if (renamingViewId) return;
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable)
      ) {
        return;
      }
      if (!activeView) return;
      e.preventDefault();
      beginRename(activeView);
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [activeView, renamingViewId, beginRename]);

  const submitRename = useCallback(async () => {
    if (!renamingViewId) return;
    const trimmed = renameDraft.trim();
    // Look up the view being renamed from allViews (the full list, not just open tabs)
    const original = allViews.find((v) => v.View?.ViewID === renamingViewId);
    const originalName = original?.View?.DisplayName ?? '';
    const viewSpaceId = original?.View?.SpaceID;
    const version = original?.View?.Version;
    if (!trimmed) {
      setRenameError('Name cannot be empty');
      return;
    }
    if (trimmed === originalName) {
      cancelRename();
      return;
    }
    if (!viewSpaceId) {
      setRenameError('Cannot rename — view is missing space context');
      return;
    }
    setIsSubmittingRename(true);
    setRenameError(null);
    try {
      await patchView({
        spaceId: viewSpaceId,
        viewId: renamingViewId,
        // @ts-expect-error https://stackoverflow.com/questions/68283492/rtk-query-merge-patchjson-content-type-ruins-request-body
        body: JSON.stringify({
          Version: version,
          DisplayName: trimmed,
        }),
      }).unwrap();
      cancelRename();
    } catch (err) {
      setRenameError(getApiErrorMessage(err, 'Failed to rename view'));
      setIsSubmittingRename(false);
    }
  }, [renamingViewId, renameDraft, allViews, patchView, cancelRename]);

  const handleCopyLink = useCallback(async () => {
    if (!kebabAnchor) return;
    try {
      await navigator.clipboard.writeText(window.location.href);
      dispatch(
        setAlert({
          type: 'success',
          message: 'Link copied',
          isOpen: true,
        }),
      );
    } catch {
      // navigator.clipboard isn't an RTK mutation, so we surface this directly
      // via setAlert rather than through useApiErrorMessage.
      dispatch(
        setAlert({
          type: 'error',
          message: 'Could not copy link to clipboard.',
          isOpen: true,
        }),
      );
    }
    closeKebab();
  }, [kebabAnchor, closeKebab, dispatch]);

  /** Opens the delete-confirmation modal for the view in the active kebab menu. */
  const handleDelete = useCallback(() => {
    if (!kebabAnchor) return;
    const view = kebabAnchor.view;
    if (!view.View?.ViewID || !view.View?.SpaceID) {
      closeKebab();
      return;
    }
    setDeleteConfirmView(view);
    closeKebab();
  }, [kebabAnchor, closeKebab]);

  /** Executes the deletion after the user confirms in the modal. */
  const handleDeleteConfirmed = useCallback(async () => {
    if (!deleteConfirmView) return;
    const viewId = deleteConfirmView.View?.ViewID;
    const viewSpaceId = deleteConfirmView.View?.SpaceID;
    const displayName = deleteConfirmView.View?.DisplayName ?? 'this view';
    setDeleteConfirmView(null);
    if (!viewId || !viewSpaceId) return;
    try {
      await deleteView({ spaceId: viewSpaceId, viewId }).unwrap();
      if (activeViewId === viewId) {
        onClearView();
      }
      onCloseTab(viewId);
      dispatch(setAlert({ type: 'success', message: `Deleted "${displayName}"`, isOpen: true }));
    } catch {
      // useApiErrorMessage above watches deleteViewError and dispatches the toast.
    }
  }, [deleteConfirmView, deleteView, activeViewId, onClearView, onCloseTab, dispatch]);

  const sentinelText = sentinelLabel ?? `All ${entityType.toLowerCase()}s`;
  const sentinelIsActive = activeViewId === null;
  const firstViewIsActive =
    openSortedViews.length > 0 &&
    openSortedViews[0]?.View?.ViewID === activeViewId;
  // Pipe between sentinel and first view: only when both tabs are inactive.
  const showSentinelToViewPipe =
    isSentinelOpen &&
    openSortedViews.length > 0 &&
    !sentinelIsActive &&
    !firstViewIsActive;
  // Trailing pipe (between the last tab and the "+" button): hide when the
  // last tab is the active one so the selected pill doesn't sit next to a
  // divider. Mirrors the between-tab rule that hides dividers adjacent to
  // the active tab.
  const lastViewIsActive =
    openSortedViews.length > 0 &&
    openSortedViews[openSortedViews.length - 1]?.View?.ViewID === activeViewId;
  const sentinelIsLastAndActive =
    openSortedViews.length === 0 && isSentinelOpen && sentinelIsActive;
  const showTrailingPipe = !lastViewIsActive && !sentinelIsLastAndActive;

  return (
    <Container data-testid="view-tabs">
      <Row>
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          accessibility={dndAccessibility}
        >
        <StripContainer>
          <StripScrollWrapper>
            <Strip role="tablist">
            {/* Sentinel — always first, not part of the sortable set */}
            {isSentinelOpen && (
              <Tab
                type="button"
                role="tab"
                aria-selected={sentinelIsActive}
                $active={sentinelIsActive}
                $sentinel
                onClick={onClearView}
                disabled={disabled}
                data-testid="view-tab-all"
              >
                <TabIcon $active={sentinelIsActive}>
                  <DashboardIcon fontSize="inherit" />
                </TabIcon>
                <TabLabel>{sentinelText}</TabLabel>
                <CloseButton
                  data-close
                  role="button"
                  tabIndex={0}
                  aria-label={`Close ${sentinelText} tab`}
                  data-testid="view-tab-close-sentinel"
                  onClick={(e) => {
                    e.stopPropagation();
                    onCloseTab(SENTINEL_TAB_ID);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.stopPropagation();
                      onCloseTab(SENTINEL_TAB_ID);
                    }
                  }}
                >
                  <CloseIcon />
                </CloseButton>
              </Tab>
            )}
            {showSentinelToViewPipe && <Pipe aria-hidden />}

            {/* Sortable saved-view tabs */}
            <SortableContext
              items={openSortedViewIds}
              strategy={horizontalListSortingStrategy}
            >
              {openSortedViews.map((view, index) => {
                const viewId = view.View?.ViewID ?? '';
                const displayName = view.View?.DisplayName ?? 'Unnamed view';
                const description = view.View?.Annotations?.description;
                const isActive = activeViewId === viewId;
                const isRenaming = renamingViewId === viewId;
                const prevViewId =
                  index > 0
                    ? (openSortedViews[index - 1]?.View?.ViewID ?? null)
                    : null;
                const prevIsActive =
                  prevViewId !== null && prevViewId === activeViewId;
                const showPipe =
                  index > 0 &&
                  !prevIsActive &&
                  !isActive &&
                  dragActiveId !== viewId &&
                  dragActiveId !== prevViewId;

                return (
                  <SortableViewTabWrapper
                    key={viewId}
                    id={viewId}
                    disabled={isRenaming}
                  >
                    {showPipe && <Pipe aria-hidden />}
                    <Tab
                      type="button"
                      role="tab"
                      aria-selected={isActive}
                      $active={isActive}
                      onClick={isRenaming ? undefined : () => onSelectView(view)}
                      disabled={disabled || isRenaming}
                      data-testid={`view-tab-${viewId}`}
                      title={description || displayName}
                    >
                      {isRenaming ? (
                        <RenameInput
                          ref={renameInputRef}
                          value={renameDraft}
                          onChange={(e) => setRenameDraft(e.target.value)}
                          onClick={(e) => e.stopPropagation()}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              void submitRename();
                            } else if (e.key === 'Escape') {
                              e.preventDefault();
                              cancelRename();
                            }
                          }}
                          aria-label={`Rename ${displayName}`}
                          aria-invalid={renameError ? true : undefined}
                          aria-describedby={
                            renameError
                              ? `view-tab-rename-error-${viewId}`
                              : undefined
                          }
                          disabled={isSubmittingRename}
                          data-testid={`view-tab-rename-input-${viewId}`}
                        />
                      ) : (
                        <TabLabel>{displayName}</TabLabel>
                      )}
                      {(isActive ? (isModified && !isRenaming) : (modifiedTabIds?.has(viewId) ?? false)) && (
                        <Tooltip
                          title="View has unsaved changes"
                          placement="top"
                          arrow
                        >
                          <ModifiedDot data-testid="view-tab-modified-dot" />
                        </Tooltip>
                      )}
                      {isActive && !isRenaming && (
                        <TabKebab
                          data-kebab
                          onClick={(e) => {
                            e.stopPropagation();
                            setKebabAnchor({ el: e.currentTarget, view });
                          }}
                          // Prevent pointer-down from bubbling to the sortable
                          // wrapper and triggering an unintended drag start.
                          onPointerDown={(e) => e.stopPropagation()}
                          aria-label={`Actions for ${displayName}`}
                          role="button"
                        >
                          <ExpandMoreIcon fontSize="inherit" />
                        </TabKebab>
                      )}
                      {!isRenaming && (
                        <CloseButton
                          data-close
                          role="button"
                          tabIndex={0}
                          aria-label={`Close ${displayName} tab`}
                          data-testid={`view-tab-close-${viewId}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            onCloseTab(viewId);
                          }}
                          // Prevent pointer-down from bubbling to the sortable
                          // wrapper and triggering an unintended drag start.
                          onPointerDown={(e) => e.stopPropagation()}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.stopPropagation();
                              onCloseTab(viewId);
                            }
                          }}
                        >
                          <CloseIcon />
                        </CloseButton>
                      )}
                    </Tab>
                  </SortableViewTabWrapper>
                );
              })}
            </SortableContext>

            {/* Divider between last tab and "+" button */}
            {showTrailingPipe && <Pipe aria-hidden />}

            {/* "+" button — sits immediately after the last tab */}
            <AddTabButton
              ref={addTabButtonRef}
              type="button"
              aria-label="Add tab"
              data-testid="view-tabs-add-tab"
              disabled={disabled}
              onClick={(e) => setAddTabMenuAnchor(e.currentTarget)}
            >
              <AddIcon />
            </AddTabButton>

            </Strip>

            <ScrollFade aria-hidden />
          </StripScrollWrapper>
        </StripContainer>

          {/* Ghost tab shown at the cursor position during drag */}
          <DragOverlay>
            {dragActiveId !== null && (
              <Tab
                type="button"
                role="tab"
                aria-selected={false}
                style={{
                  opacity: 0.9,
                  cursor: 'grabbing',
                  boxShadow: '0 4px 16px -4px rgba(20,22,28,0.20)',
                }}
              >
                <TabLabel>
                  {allViewsById.get(String(dragActiveId))?.View?.DisplayName ??
                    String(dragActiveId)}
                </TabLabel>
              </Tab>
            )}
          </DragOverlay>
        </DndContext>

        <Tail>
        {renamingViewId && (
          <>
            <TailIconButton
              type="button"
              onClick={() => void submitRename()}
              disabled={disabled || isSubmittingRename || !renameDraft.trim()}
              aria-label="Save view name"
              data-testid="view-tabs-rename-save"
              sx={{ color: OK_600 }}
            >
              <CheckIcon />
              Save name
            </TailIconButton>
            <TailIconButton
              type="button"
              onClick={cancelRename}
              disabled={disabled}
              aria-label="Cancel rename"
              data-testid="view-tabs-rename-cancel"
            >
              <CloseIcon />
              Cancel
            </TailIconButton>
          </>
        )}
        </Tail>
      </Row>
      {renameError && renamingViewId && (
        <Box
          id={`view-tab-rename-error-${renamingViewId}`}
          role="alert"
          sx={{
            px: 2,
            py: 0.75,
            borderTop: (theme) => `1px solid ${theme.palette.divider}`,
            background: (theme) => alpha(theme.palette.error.main, 0.06),
            color: 'error.main',
            fontSize: 12,
          }}
          data-testid="view-tabs-rename-error"
        >
          {renameError}
        </Box>
      )}

      {/* Inline "New view" popover */}
      <Popper
        open={Boolean(newViewAnchor)}
        anchorEl={newViewAnchor}
        placement="bottom-start"
        style={{ zIndex: 1300 }}
        modifiers={[{ name: 'offset', options: { offset: [0, 8] } }]}
      >
        <ClickAwayListener onClickAway={closeNewViewPopover}>
          <InlinePopoverPaper data-testid="view-tabs-new-view-popover">
            <Box sx={{ px: 1.25, pt: 1, pb: 0.5 }}>
              <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mb: 0.75 }}>
                New view name
              </Typography>
              <InlineFormInput
                ref={newViewInputRef}
                value={newViewName}
                onChange={(e) => { setNewViewName(e.target.value); setNewViewError(null); }}
                placeholder="View name…"
                aria-label="New view name"
                data-testid="view-tabs-new-view-name-input"
                disabled={isCreatingView}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') { e.preventDefault(); void handleNewViewSubmit(); }
                  else if (e.key === 'Escape') { e.preventDefault(); closeNewViewPopover(); }
                }}
              />
              {newViewError && <InlineFormError role="alert">{newViewError}</InlineFormError>}
            </Box>
            <Box sx={{ display: 'flex', justifyContent: 'flex-end', px: 1.25, pt: 1, pb: 0.5 }}>
              <InlineFormSubmitButton
                type="button"
                onClick={() => void handleNewViewSubmit()}
                disabled={isCreatingView || !newViewName.trim()}
                data-testid="view-tabs-new-view-submit"
              >
                <SaveIcon />
                Save view
              </InlineFormSubmitButton>
            </Box>
          </InlinePopoverPaper>
        </ClickAwayListener>
      </Popper>

      {/* Inline "Duplicate" popover */}
      <Popper
        open={Boolean(duplicateAnchor)}
        anchorEl={duplicateAnchor}
        placement="bottom-end"
        style={{ zIndex: 1300 }}
        modifiers={[{ name: 'offset', options: { offset: [0, 8] } }]}
      >
        <ClickAwayListener onClickAway={closeDuplicatePopover}>
          <InlinePopoverPaper data-testid="view-tabs-duplicate-popover">
            <Box sx={{ px: 1.25, pt: 1, pb: 0.5 }}>
              <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mb: 0.75 }}>
                Save as new view from "{duplicateForView?.View?.DisplayName}"
              </Typography>
              <InlineFormInput
                ref={duplicateInputRef}
                value={duplicateName}
                onChange={(e) => { setDuplicateName(e.target.value); setDuplicateError(null); }}
                placeholder="New view name…"
                aria-label="Duplicate view name"
                data-testid="view-tabs-duplicate-name-input"
                disabled={isDuplicating}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') { e.preventDefault(); void handleDuplicateSubmit(); }
                  else if (e.key === 'Escape') { e.preventDefault(); closeDuplicatePopover(); }
                }}
              />
              {duplicateError && <InlineFormError role="alert">{duplicateError}</InlineFormError>}
            </Box>
            <Box sx={{ display: 'flex', justifyContent: 'flex-end', px: 1.25, pt: 1, pb: 0.5 }}>
              <InlineFormSubmitButton
                type="button"
                onClick={() => void handleDuplicateSubmit()}
                disabled={isDuplicating || !duplicateName.trim()}
                data-testid="view-tabs-duplicate-submit"
              >
                <SaveIcon />
                Save copy
              </InlineFormSubmitButton>
            </Box>
          </InlinePopoverPaper>
        </ClickAwayListener>
      </Popper>

      {/* Tab Management Menu — opened by the "+" AddTabButton in the strip */}
      <Menu
        anchorEl={addTabMenuAnchor}
        open={Boolean(addTabMenuAnchor)}
        onClose={closeAddTabMenu}
        data-testid="add-tab-menu"
        slotProps={{ paper: { sx: menuPaperSx(260) } }}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        transformOrigin={{ vertical: 'top', horizontal: 'left' }}
      >
        {/* Create new view — triggers the inline popover, anchored to the "+" button */}
        <MenuItem
          data-testid="add-tab-menu-create-new-view"
          onClick={() => {
            closeAddTabMenu();
            setNewViewName('');
            setNewViewError(null);
            setNewViewAnchor(addTabButtonRef.current);
          }}
          sx={{ borderRadius: '6px', fontSize: 13, minHeight: 34, py: 0.5, display: 'flex', alignItems: 'center' }}
        >
          <AddIcon sx={{ fontSize: 16, mr: 1.25, color: 'text.secondary', flexShrink: 0 }} />
          <Typography component="span" sx={{ fontSize: 13 }}>
            Create new view…
          </Typography>
        </MenuItem>

        <Divider sx={{ my: 0.5 }} />

        <Box sx={{ px: 1.25, pt: 0.75, pb: 0.5 }}>
          <Typography
            variant="caption"
            sx={{
              color: 'text.disabled',
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
              display: 'block',
            }}
          >
            Open tabs
          </Typography>
        </Box>

        {/* Sentinel item */}
        <MenuItem
          key={SENTINEL_TAB_ID}
          data-testid={`add-tab-item-${SENTINEL_TAB_ID}`}
          onClick={isSentinelOpen ? undefined : () => { onOpenTab(SENTINEL_TAB_ID); closeAddTabMenu(); }}
          sx={{ ...MENU_ITEM_SX, display: 'flex', alignItems: 'center' }}
        >
          {isSentinelOpen ? (
            <CheckIcon sx={{ fontSize: 16, mr: 1.25, color: 'success.main', flexShrink: 0 }} />
          ) : (
            <DashboardIcon sx={{ fontSize: 16, mr: 1.25, color: 'text.secondary', flexShrink: 0 }} />
          )}
          <Typography component="span" sx={{ flex: 1, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {sentinelText}
          </Typography>
          {isSentinelOpen && (
            <MenuItemCloseButton
              role="button"
              tabIndex={0}
              data-testid={`add-tab-item-close-${SENTINEL_TAB_ID}`}
              aria-label={`Close ${sentinelText} tab`}
              onClick={(e) => { e.stopPropagation(); onCloseTab(SENTINEL_TAB_ID); }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.stopPropagation();
                  onCloseTab(SENTINEL_TAB_ID);
                }
              }}
            >
              <CloseIcon />
            </MenuItemCloseButton>
          )}
        </MenuItem>

        {/* Saved view items */}
        {allViews.map((view) => {
          const viewId = view.View?.ViewID ?? '';
          const displayName = view.View?.DisplayName ?? 'Unnamed view';
          const description = view.View?.Annotations?.description;
          const isOpen = openTabIds.includes(viewId);
          return (
            <MenuItem
              key={viewId}
              data-testid={`add-tab-item-${viewId}`}
              onClick={isOpen ? undefined : () => { onOpenTab(viewId); closeAddTabMenu(); }}
              sx={{ ...MENU_ITEM_SX, display: 'flex', alignItems: 'center' }}
            >
              {isOpen ? (
                <CheckIcon sx={{ fontSize: 16, mr: 1.25, color: 'success.main', flexShrink: 0 }} />
              ) : (
                <Box component="span" sx={{ width: 16, mr: 1.25, flexShrink: 0 }} />
              )}
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography component="span" sx={{ fontSize: 13, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {displayName}
                </Typography>
                {description && !isOpen && (
                  <Typography component="span" sx={{ fontSize: 11, color: 'text.secondary', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {description}
                  </Typography>
                )}
              </Box>
              {isOpen && (
                <MenuItemCloseButton
                  role="button"
                  tabIndex={0}
                  data-testid={`add-tab-item-close-${viewId}`}
                  aria-label={`Close ${displayName} tab`}
                  onClick={(e) => { e.stopPropagation(); onCloseTab(viewId); }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.stopPropagation();
                      onCloseTab(viewId);
                    }
                  }}
                >
                  <CloseIcon />
                </MenuItemCloseButton>
              )}
            </MenuItem>
          );
        })}

        {allViews.length === 0 && (
          <MenuItem disabled sx={MENU_ITEM_SX}>
            <Typography component="span" sx={{ fontSize: 13, color: 'text.disabled' }}>
              No views available
            </Typography>
          </MenuItem>
        )}
      </Menu>

      {/* Kebab menu */}
      <Menu
        anchorEl={kebabAnchor?.el ?? null}
        open={Boolean(kebabAnchor)}
        onClose={closeKebab}
        slotProps={{ paper: { sx: menuPaperSx(240) } }}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
      >
        {kebabAnchor && (
          <Box sx={{ px: 1.25, pt: 0.75, pb: 0.5 }}>
            <Typography
              variant="caption"
              sx={{
                color: 'text.disabled',
                fontSize: 11,
                fontWeight: 600,
                letterSpacing: '0.04em',
                textTransform: 'uppercase',
                display: 'block',
              }}
            >
              {kebabAnchor.view.View?.DisplayName ?? 'View'}
            </Typography>
          </Box>
        )}
        {/* Save / Revert — always visible for the active view's kebab; disabled when unmodified */}
        <Tooltip
          title={isModified ? '' : 'No unsaved changes'}
          placement="left"
          disableHoverListener={isModified}
        >
          <span>
            <MenuItem
              onClick={() => {
                if (isModified && onSave) { onSave(); closeKebab(); }
              }}
              disabled={!isModified || !onSave}
              data-testid="view-tab-kebab-save"
              sx={MENU_ITEM_SX}
            >
              <SaveIcon sx={{ fontSize: 16, mr: 1.25, color: 'text.secondary' }} />
              Save
              <Typography variant="caption" sx={{ ml: 'auto', color: 'text.disabled', fontSize: 11 }}>
                ⌘S
              </Typography>
            </MenuItem>
          </span>
        </Tooltip>
        <Tooltip
          title={isModified ? '' : 'No unsaved changes'}
          placement="left"
          disableHoverListener={isModified}
        >
          <span>
            <MenuItem
              onClick={() => {
                if (isModified && onRevert) { onRevert(); closeKebab(); }
              }}
              disabled={!isModified || !onRevert}
              data-testid="view-tab-kebab-revert"
              sx={MENU_ITEM_SX}
            >
              <RestoreIcon sx={{ fontSize: 16, mr: 1.25, color: 'text.secondary' }} />
              Revert changes
            </MenuItem>
          </span>
        </Tooltip>
        <Divider sx={{ my: '4px !important' }} />
        <MenuItem
          onClick={() => {
            if (kebabAnchor) {
              beginRename(kebabAnchor.view);
            }
            closeKebab();
          }}
          data-testid="view-tab-kebab-rename"
          sx={MENU_ITEM_SX}
        >
          <EditIcon sx={{ fontSize: 16, mr: 1.25, color: 'text.secondary' }} />
          Rename
          <Typography variant="caption" sx={{ ml: 'auto', color: 'text.disabled', fontSize: 11 }}>
            F2
          </Typography>
        </MenuItem>
        <MenuItem
          onClick={handleCopyLink}
          sx={MENU_ITEM_SX}
        >
          <LinkIcon sx={{ fontSize: 16, mr: 1.25, color: 'text.secondary' }} />
          Copy link to view
          <Typography variant="caption" sx={{ ml: 'auto', color: 'text.disabled', fontSize: 11 }}>
            ⌘L
          </Typography>
        </MenuItem>
        <MenuItem
          onClick={() => {
            if (kebabAnchor) {
              const { el, view } = kebabAnchor;
              setDuplicateForView(view);
              setDuplicateName(view.View?.DisplayName ?? '');
              setDuplicateError(null);
              setDuplicateAnchor(el);
              closeKebab();
            }
          }}
          data-testid="view-tab-kebab-save-as-new"
          sx={MENU_ITEM_SX}
        >
          <ContentCopyIcon sx={{ fontSize: 16, mr: 1.25, color: 'text.secondary' }} />
          Save as new view…
        </MenuItem>
        <Divider sx={{ my: '4px !important' }} />
        <MenuItem
          onClick={handleDelete}
          sx={{ ...MENU_ITEM_SX, color: 'error.main' }}
          data-testid="view-tab-kebab-delete"
        >
          <DeleteOutlineIcon sx={{ fontSize: 16, mr: 1.25 }} />
          Delete view
        </MenuItem>
        <MenuItem
          onClick={() => {
            if (kebabAnchor) {
              onCloseTab(kebabAnchor.view.View?.ViewID ?? '');
            }
            closeKebab();
          }}
          data-testid="view-tab-kebab-close"
          sx={MENU_ITEM_SX}
        >
          <CloseIcon sx={{ fontSize: 16, mr: 1.25, color: 'text.secondary' }} />
          Close tab
        </MenuItem>
      </Menu>

      {/* Delete-view confirmation modal */}
      <ConfirmationModal
        isOpen={Boolean(deleteConfirmView)}
        onClose={() => setDeleteConfirmView(null)}
        onSubmit={handleDeleteConfirmed}
        modalTitleText={`Delete "${deleteConfirmView?.View?.DisplayName ?? 'this view'}"?`}
        modalDescriptionText="Members of this space will lose this view."
      />
    </Container>
  );
};
