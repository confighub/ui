// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import {
  Suspense,
  lazy,
  memo,
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from 'react';

import { highlightText } from '@/components/entity-data-grid/utils/highlightText';
import CallSplitIcon from '@mui/icons-material/CallSplit';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import CloseIcon from '@mui/icons-material/Close';
import DataObjectIcon from '@mui/icons-material/DataObject';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import SearchIcon from '@mui/icons-material/Search';
import SettingsIcon from '@mui/icons-material/Settings';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import Fade from '@mui/material/Fade';
import IconButton from '@mui/material/IconButton';
import Link from '@mui/material/Link';
import Skeleton from '@mui/material/Skeleton';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { styled } from '@mui/material/styles';

import type { ExtendedTargetRead, ResourceProtection } from '@confighub/rtk-query';

import { useUnitMutationSourcesMap } from '@/hooks/useUnitData';

import type { FieldPathMeta } from './configParser';
import { ComponentToolbar } from './ComponentToolbar';
import { CompareCollapsible } from './compare/CompareCollapsible';
import { CompareColumnDnd } from './compare/CompareColumnDnd';
import { ComponentCompareSection, type CompareUnit } from './compare/ComponentCompareSection';
import { DeploymentSelectors, type DeploymentOption } from './compare/DeploymentSelectors';
import { buildFieldPathMeta } from './configParser';
import { pathContainsArrayIndex } from './componentKeyUtils';
import { buildProtectedPathLookup } from './protectedPaths';
import { ComponentValuesSection } from './ComponentValuesSection';
import type { StagedCommitPayload } from './ComponentValuesSection';
import { SpaceSettingsSheet, type SpaceSettingsFooterState, type SpaceSettingsSheetHandle } from './SpaceSettingsSheet';
import {
  BottomBar,
  ChevronIcon,
  ErrorCard,
  ErrorDetail,
  ErrorHeader,
  GateBadge,
  PaneContainer,
  PaneContent,
  PaneHeader,
  ResizeHandle,
  TagBadge,
  UnitHeaderRow,
  UnitRow,
  UnitSlug,
  bottomBarPrimaryButtonSx,
  bottomBarTextButtonSx,
} from './diffStyles';
import { formatTimeAgo } from './diffTree';
import { HeavyUnitGate, HeavyUnitLoading, UnitSizeChip, UnitSourceOverrideBar } from './HeavyUnitGate';
import { isHeavyUnitData, shouldDeferUnitPaint, shouldShowUnitSizeChip } from './unitSizeGuard';
import { computeTotalAllFields, countLogicalChanges, countUpgradableBadgeFields, hasRealUpgrade } from './entryBuilders';
import { buildDeploymentMap } from './componentData';
import { componentTheme } from './componentTheme';
import { isMultiComponent } from './flow-graph/componentFrames';
import { DECLARED_BAR_ID, ReleasesPane } from './ReleasesPane';
import { NameInput, PaneButton } from './releasePaneStyles';
import { useUnreleasedChanges } from './useUnreleasedChanges';
import { RELEASE_FRESH_SETTLE_MS, useFreshSignal } from './useFreshSignal';
import { UnitDetailsPane } from './UnitDetailsPane';
import type { UnitMetaPatch } from './unit-details/types';
import type {
  ApplyEntryWithGates,
  MergedUnit,
  ComponentDeployment,
  UpgradeEntry,
  VariationEntry,
} from './componentTypes';
import type { ReleaseActions } from './useReleaseActions';

// Lazy-loaded: pulls in CodeEditor -> @monaco-editor/react, monaco-editor, and
// monaco-yaml (a multi-MB stack with a module-level initMonaco() side effect).
// Source view is opt-in (the user must switch the pane to "Source view"), so
// none of this should be part of the /components route's initial chunk — it's
// only fetched the first time viewMode becomes 'source' below. Named-export
// modules need the `.then` adapter since React.lazy expects a default export.
const ComponentSourceSection = lazy(() =>
  import('./ComponentSourceSection').then((m) => ({ default: m.ComponentSourceSection })),
);

// ============================================================================
// CONSTANTS
// ============================================================================

const MIN_SIZE = 250;
const MAX_PERCENT = 1;
/** Stable empty-array reference (task #69) — avoids feeding useUnreleasedChanges a fresh `[]` literal every render while the Releases tab isn't active, which would otherwise needlessly re-run its internal memos. */
const EMPTY_RELEASE_UNITS: { unitId: string; slug: string; spaceId: string; data?: string }[] = [];
/** Stable empty-Set reference so `expansionState` doesn't churn while no search is active. */
const EMPTY_STRING_SET: Set<string> = new Set();
/** Stable identity, so an untouched selection with no releases yet does not
    hand the pane a new array on every render. */
const EMPTY_RELEASE_SELECTION: readonly string[] = [];

/** Stable identity for "nothing extra is being compared", so memos downstream don't churn. */
const EMPTY_COMPARE_IDS: readonly string[] = [];

/** Where the Configuration tab remembers that its compare slots are folded away. */
const CONFIG_COMPARE_COLLAPSED_KEY = 'confighub.componentPane.config.compareCollapsed';

// ============================================================================
// STYLED COMPONENTS — pane content tabs (Configuration / Releases)
// ============================================================================

/**
 * Only rendered when the selected deployment is release-enabled (a Space
 * with exactly one deploy verb has nothing to switch between — its pane
 * looks byte-identical to before this feature). Dense, componentTheme-
 * styled MUI Tabs — no existing Tabs usage in ui/src shares componentTheme
 * (ComponentActivityFeed/MutationDrawer/etc. use the default MUI palette),
 * so this is styled from scratch to match the pane's own rust-accent,
 * Manrope, dense idiom rather than inheriting a mismatched look.
 */
const PaneTabs = styled(Tabs)({
  minHeight: 34,
  borderBottom: `1px solid ${componentTheme.borderDefault}`,
  background: componentTheme.bgDefault,
  flexShrink: 0,
  '& .MuiTabs-indicator': {
    backgroundColor: componentTheme.accent,
    height: 2,
  },
});

const PaneTab = styled(Tab)({
  minHeight: 34,
  padding: '6px 14px',
  fontSize: 13,
  fontWeight: 600,
  fontFamily: componentTheme.fontSans,
  textTransform: 'none',
  color: componentTheme.fgMuted,
  minWidth: 0,
  '&.Mui-selected': {
    color: componentTheme.accent,
  },
});

const TabFreshDot = styled('span')({
  display: 'inline-block',
  width: 6,
  height: 6,
  borderRadius: '50%',
  background: componentTheme.accent,
  marginLeft: 6,
});

// ============================================================================
// STYLED COMPONENTS — optional "Name this release" (plan 002)
// ============================================================================

/**
 * Collapsed-by-default notes disclosure, in the footer's action row beside
 * the release-name field. A plain one-click publish never opens it.
 */
const ReleaseNameToggle = styled('button', {
  shouldForwardProp: (p) => p !== '$expanded',
})<{ $expanded?: boolean }>(({ $expanded }) => ({
  display: 'flex',
  alignItems: 'center',
  gap: 4,
  flexShrink: 0,
  margin: 0,
  padding: '3px 6px',
  border: 'none',
  background: 'transparent',
  borderRadius: componentTheme.radiusSm,
  color: $expanded ? componentTheme.fgDefault : componentTheme.fgSubtle,
  fontSize: 11,
  fontWeight: 600,
  fontFamily: componentTheme.fontSans,
  letterSpacing: '.02em',
  cursor: 'pointer',
  width: 'fit-content',
  transition: 'color 0.15s',
  '&:hover': { color: componentTheme.fgDefault },
}));

/**
 * The notes field opens ABOVE the footer instead of growing it: `BottomBar`
 * is a fixed-height row shared with the Configuration tab, so an inline
 * textarea would overflow it.
 */
const ReleaseNameFields = styled(Box)({
  position: 'absolute',
  bottom: 'calc(100% + 8px)',
  right: 0,
  width: 'min(280px, 100%)',
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
  padding: 8,
  zIndex: 6,
  background: componentTheme.bgDefault,
  border: `1px solid ${componentTheme.borderDefault}`,
  borderRadius: componentTheme.radiusMd,
  boxShadow: componentTheme.shadowMd,
});

// ============================================================================
// HELPERS
// ============================================================================

/** The pane state that decides whether a unit's values section is rendered. */
interface UnitExpansionState {
  collapsedGroups: Set<string>;
  forcedExpandedGroups: Set<string>;
  recentlyUpgradedUnitIds: Set<string>;
  /** Oversized units the user has explicitly asked to render (see `isUnitGated`). */
  materializedUnitIds: Set<string>;
  filterMode: 'incoming' | 'all';
  scopeFilter: 'local-overrides' | 'local-only' | 'kept-on-merge' | null;
  /** How many units the selected node has, so a lone unit can open with nothing to click. */
  unitCount: number;
  /** Units whose DIFF/PATH content (not just their slug) matched the active search. */
  searchContentMatchedUnitIds: Set<string>;
}

/**
 * Whether the pane expands this unit — i.e. mounts its values section, which is
 * what MATERIALIZES the unit (parses its Data into per-document leaves).
 *
 * Unit rows start CLOSED. A pane that opens every unit buries the handful of rows
 * that actually need attention and pays a parse for all the rest, so a unit is
 * only opened unasked when the pane already knows there is something worth reading
 * inside it: a pending incoming upgrade while the Incoming tab is showing, the
 * result of an upgrade the user just committed, a match for an active scope
 * filter — picking 'local-overrides' or 'local-only' IS the request to see those
 * rows, so leaving them shut would answer it with nothing — a unit whose CONTENT
 * (not just its name) matched an active search, for the same reason — or the
 * unit is the only one the selected node has, where collapsing buys nothing
 * (there is no sibling row it would declutter) but costs an extra click.
 * Everything else waits for a click (`forcedExpandedGroups`), and
 * `collapsedGroups` overrides all of them — including a search match — so a
 * click can always close a row again, and typing a query never reopens a row
 * the user shut on purpose.
 *
 * Extracted so the row rendering and the field-count chip ask the SAME question —
 * a chip that disagreed with what is on screen would either under-count silently
 * or pay for parses of units nobody rendered.
 */
const isUnitExpandedInPane = (unit: MergedUnit, state: UnitExpansionState): boolean =>
  !state.collapsedGroups.has(unit.unitId) && (
    (state.filterMode === 'incoming' && !!unit.upgradeEntry) ||
    (state.scopeFilter === 'local-overrides' && (unit.variationEntry?.fieldDiffs.length ?? 0) > 0) ||
    (state.scopeFilter === 'local-only' && (unit.variationEntry?.localOnlyPaths?.length ?? 0) > 0) ||
    // Over-inclusive on purpose (same reasoning as 'local-overrides'): a unit
    // with zero live diffs has zero candidates for "kept", but a unit WITH
    // live diffs may or may not have any actually kept — expanding it either
    // way answers the filter request rather than risking a shut row.
    (state.scopeFilter === 'kept-on-merge' && (unit.variationEntry?.liveFieldDiffs.length ?? 0) > 0) ||
    state.searchContentMatchedUnitIds.has(unit.unitId) ||
    state.unitCount === 1 ||
    state.forcedExpandedGroups.has(unit.unitId) ||
    state.recentlyUpgradedUnitIds.has(unit.unitId)
  );

/**
 * Whether this unit's field tree is being HELD BACK because its payload is too
 * big to build without freezing the pane, and the user hasn't asked for it.
 *
 * Assessed from the configuration string's LENGTH only — no parse, no
 * parse. That is the whole value of the gate: the ~700ms of `parseAllDocuments`
 * on a multi-megabyte payload is a floor that cannot be optimized away, so the
 * only way to stop paying it is to never enter it.
 *
 * Independent of `viewMode` on purpose. The treeview swaps in the placeholder
 * card for a gated unit; the field-COUNT chip must also treat it as unparsed in
 * either view, because a unit we never decoded genuinely has no known field
 * count (see `allFieldsPartial` → "N+").
 */
const isUnitGated = (unit: MergedUnit, materializedUnitIds: Set<string>): boolean =>
  !materializedUnitIds.has(unit.unitId) && isHeavyUnitData(unit.data);

/**
 * Whether the pane will actually BUILD this unit's field tree — i.e. pay the
 * decode + parse + tree build.
 *
 * Distinct from `isUnitExpandedInPane`: an oversized unit IS expanded (its body
 * is open, showing the placeholder card) but is NOT materialized. Anything that
 * would cost a parse must ask THIS question, not the expansion one — components.md
 * rule 4 (count, filter and dimming share one predicate) applies here too, and a
 * counter that parsed a unit the tree never rendered would pay exactly the cost
 * the gate exists to avoid.
 */
const isUnitMaterializedInPane = (unit: MergedUnit, state: UnitExpansionState): boolean =>
  isUnitExpandedInPane(unit, state) && !isUnitGated(unit, state.materializedUnitIds);

/**
 * Return a Set with `key` present or absent per `present`. Returns the same
 * reference when already in the desired state so React can skip the update.
 */
const setSetMember = (set: Set<string>, key: string, present: boolean): Set<string> => {
  if (set.has(key) === present) return set;
  const next = new Set(set);
  if (present) next.add(key);
  else next.delete(key);
  return next;
};

// ============================================================================
// TYPES
// ============================================================================

export interface ComponentSidePaneProps {
  upgradeEntries: UpgradeEntry[];
  allApplyEntries: ApplyEntryWithGates[];
  variationEntries: VariationEntry[];
  deployments: ComponentDeployment[];
  /** Org-wide targets (from `useListAllTargetsQuery`) — the Space settings sheet filters these to OCI-provider ones for the release-target row (design-mockups/variant-settings/BUILD-PLAN.md commit 3). */
  targets: ExtendedTargetRead[];
  unitsByDeployment: Map<
    string,
    {
      slug: string;
      spaceId: string;
      unitId: string;
      hasUpstream: boolean;
      toolchainType?: string;
      data?: string;
      validationErrors?: { [key: string]: boolean };
      /** Unit.TargetID — scopes a unit to the Space's Release target set (task #60). */
      targetId?: string;
    }[]
  >;
  selectedDeploymentIds: Set<string>;
  /**
   * A deep-link request from a status-chip peek to focus a specific tab
   * ('config' → Configuration/upgradable, 'releases' → Releases). The monotonic
   * `nonce` lets a repeat request re-focus even when the node is already open.
   * `releaseNum`, set only by the release-stamp peek, asks the Releases tab
   * to scroll to and highlight that specific release.
   */
  tabFocus?: { id: string; tab: 'config' | 'releases'; nonce: number; releaseNum?: number } | null;
  width: number;
  defaultWidth: number;
  onWidthChange: (width: number) => void;
  layoutRef?: React.RefObject<HTMLDivElement | null>;
  isUpgrading?: boolean;
  isDryRunLoading?: boolean;
  /**
   * True while the units list is silently re-fetching in the background
   * (post-mutation invalidation or settle-window polling) — NOT the initial
   * load, which is handled by the pane's own loading state. Drives a subtle
   * header indicator only; it does not gate any interaction.
   */
  isRefreshing?: boolean;
  /** Cheap synchronous signal (revision-number compare) that the selected node has upgradable units. True the instant a node is selected, before the dry-run resolves. */
  hasUpgradableUnits?: boolean;
  /** True once the dry run for the currently-selected node has completed (or the node has no upgradable units). Distinguishes 'dry run not finished yet' from 'finished with zero upgradable fields'. */
  dryRunSettled?: boolean;
  dryRunPendingIds?: Set<string>;
  isResizing?: boolean;
  onResizeStart?: () => void;
  onResizeEnd?: () => void;
  error?: { title: string; detail: string; timestamp: Date } | null;
  onClearError?: () => void;
  successMessage?: string | null;
  filterUrl?: string;
  onClose?: () => void;
  /** Opens the inline variant composer for the selected deployment -- identical to hovering its node and pressing 'V'. */
  onCreateVariant?: (deploymentId: string) => void;
  /** Optimistic per-unit field overlay from useSetAttributesMutation, keyed by unitId. */
  fieldOverlay?: Map<string, Map<string, string | null>>;
  onSetFieldValue?: (unitId: string, spaceId: string, path: string, newValue: string, meta?: FieldPathMeta) => Promise<boolean>;
  onDeleteFieldValue?: (unitId: string, spaceId: string, path: string, meta?: FieldPathMeta) => Promise<void>;
  onSaveData?: (unitId: string, spaceId: string, newEncodedData: string) => Promise<void>;
  /**
   * Commit a single unit's STAGED upgrade batch in one network call:
   *  - { kind: 'upgrade-all' } → wholesale `upgrade: true` mutation for the unit
   *  - { kind: 'patch-data', data } → ONE bulkPatch{Data} with the merged data
   * Resolves true on success. The staging Upgrade button commits all staged units.
   */
  onCommitStaged?: (unitId: string, spaceId: string, payload: StagedCommitPayload) => Promise<boolean>;
  /**
   * Commit a single unit's STAGED protection batch (a separate revision from
   * onCommitStaged — see ComponentValuesSection's commit-signal effect,
   * protection first). Resolves true on success.
   */
  onCommitProtection?: (unitId: string, spaceId: string, protection: ResourceProtection[]) => Promise<boolean>;
  /**
   * Persist a unit's Labels/Annotations (full-map replacement) for the inline
   * unit details pane. Resolves true on success.
   */
  onUpdateUnitMeta?: (unitId: string, spaceId: string, patch: UnitMetaPatch) => Promise<boolean>;
  /** Pan the canvas to the deployment node for the given spaceId. */
  onFocusDeployment?: (spaceId: string) => void;
  /**
   * Reports whether the open Space settings sheet currently has an unsaved
   * staged edit. Lets `AppComponentView` apply the same don't-silently-
   * discard guarantee the sheet's own footer already has to the close
   * routes IT owns — a node switch (clicking a different deployment) or the
   * pane's header close button — both of which change `selectedDeploymentIds`
   * and therefore unmount this component (and the sheet inside it) before
   * anything inside `ComponentSidePane` itself could intervene.
   */
  onSettingsDirtyChange?: (isDirty: boolean) => void;
  /**
   * Bundled release (publish/withdraw) state + handlers for the selected
   * deployment's Space, from `useReleaseActions`. Not yet rendered — the
   * Release button and history section land in U4/U5, gated on the winning
   * design mockup (RULE 14). Declared here now so the data/handler seam
   * (U1–U3) is complete and this prop's shape is settled ahead of time.
   */
  release?: ReleaseActions;
  /**
   * The deployments compared ALONGSIDE the open one, in slot order — slots B
   * onwards. Empty is the shipped pane: one deployment, one tree.
   */
  compareDeploymentIds?: readonly string[];
  /** The WHOLE comparison in slot order, the open deployment first, written as one URL patch. */
  onCompareSelectionChange?: (next: readonly string[]) => void;
  /**
   * Whether the bulk unit-configuration request is still in flight.
   *
   * The comparison needs this to tell a unit whose bytes have not arrived from
   * one that has none: both read as an empty string, and only this says which.
   */
  isUnitDataFetching?: boolean;
}

// ============================================================================
// ICONS
// ============================================================================

const ChevronRightIcon = () => (
  <svg viewBox='0 0 16 16' fill='none' stroke='currentColor' strokeWidth='2'>
    <path d='M6 4l4 4-4 4' />
  </svg>
);

/**
 * Content-shaped placeholder for the lazy-loaded {@link ComponentSourceSection}
 * (CodeEditor/Monaco chunk) while its dynamic import resolves. Mirrors ragged
 * code-line widths rather than a generic spinner, matching this file's
 * `upgradeLoading` skeleton below. The fetch is normally fast (a warm cache
 * after the first "Source view" click), so this is only visible briefly on
 * the first switch to Source view per page load.
 */
const CodeEditorFallback = () => (
  <Box sx={{ px: 2, py: 2, display: 'flex', flexDirection: 'column', gap: 0.75 }}>
    {[92, 78, 85, 60, 90, 45, 82, 70].map((widthPct, i) => (
      <Skeleton
        key={i}
        variant='rounded'
        height={14}
        width={`${widthPct}%`}
        sx={{ bgcolor: componentTheme.bgInset, borderRadius: '4px' }}
      />
    ))}
  </Box>
);

// ============================================================================
// BOTTOM BAR BUTTON STYLES
// ============================================================================

// ============================================================================
// COMPONENT
// ============================================================================

export const ComponentSidePane = memo(
  ({
    upgradeEntries,
    allApplyEntries,
    variationEntries,
    deployments,
    targets,
    unitsByDeployment,
    selectedDeploymentIds,
    tabFocus,
    width,
    defaultWidth,
    onWidthChange,
    layoutRef,
    isUpgrading,
    isDryRunLoading,
    hasUpgradableUnits,
    dryRunPendingIds,
    isResizing,
    onResizeStart,
    onResizeEnd,
    error,
    onClearError,
    successMessage,
    filterUrl,
    onClose,
    onCreateVariant,
    fieldOverlay,
    onSetFieldValue,
    onDeleteFieldValue,
    onSaveData,
    onCommitStaged,
    onCommitProtection,
    onUpdateUnitMeta,
    onFocusDeployment,
    onSettingsDirtyChange,
    release,
    compareDeploymentIds,
    onCompareSelectionChange,
    isUnitDataFetching,
  }: ComponentSidePaneProps) => {
    const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
    // The unit selected for the inline details pane. Local presentation state —
    // does not affect the graph, Redux selection, or the parent. Set on slug
    // click, cleared on back/close and on node switch. The overview's other
    // local state (viewMode/filterMode/staging) is left untouched, so returning
    // via `onBack` restores the exact prior overview state.
    const [detailsUnit, setDetailsUnit] = useState<{ unitId: string; spaceId: string; slug: string } | null>(null);
    // Space settings sheet (design-mockups/variant-settings/BUILD-PLAN.md commit 1)
    // — toggled by the header cog. Deliberately NOT an early return: it renders
    // absolutely positioned over the content area below, alongside PaneContent,
    // so PaneContent (and ComponentValuesSection's staged edits inside it) never
    // unmounts while this is open. See the wrapper Box below `</PaneHeader>`.
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    // Whether the open settings sheet has an unsaved staged edit right now —
    // reported up by SpaceSettingsSheet's onDirtyChange. Exists so every
    // close route (not just the sheet's own footer, which already makes
    // Discard a required first click before Close) can apply the same
    // don't-silently-discard guarantee. See confirmDiscardSettingsIfDirty
    // below and its two call sites (the cog) plus onSettingsDirtyChange
    // (bubbled to AppComponentView for the routes it owns: node switch,
    // the pane's own header close, status-chip peek jumps).
    const [isSettingsDirty, setIsSettingsDirty] = useState(false);
    // Imperative handle onto the open sheet's own Save/discardOrClose — the
    // BottomBar buttons below call these directly rather than this pane
    // re-implementing any staging logic. `sheetFooterState` is the read side
    // (dirty count, saving, error) the BottomBar needs to render those
    // buttons correctly; both replace the sheet's OWN footer, removed in
    // favor of this ONE footer showing contextual contents ("Replace the
    // upgrade footer with the save button. as a footer. style them the
    // same."). A ref, not a second lifted-state copy of the drafts
    // themselves, because the drafts have no reason to exist outside the
    // sheet — only the ACTIONS need to be reachable from here.
    const settingsSheetRef = useRef<SpaceSettingsSheetHandle>(null);
    const [sheetFooterState, setSheetFooterState] = useState<SpaceSettingsFooterState>({
      isDirty: false,
      dirtyCount: 0,
      isSaving: false,
      saveError: null,
    });
    const [forcedExpandedGroups, setForcedExpandedGroups] = useState<Set<string>>(new Set());
    const [filterText, setFilterText] = useState('');
    // Which deployment the dormant-revision-gap explainer banner was dismissed
    // for. Storing the id (rather than a boolean) makes the dismissal reset
    // itself when the selected component changes — no effect, no cleanup.
    const [dormantBannerDismissedFor, setDormantBannerDismissedFor] = useState<string | null>(null);
    // Which pane-content tab is showing — only meaningful when canRelease
    // (single-verb Spaces never render the tab bar, so this stays 'config').
    const [activeTab, setActiveTab] = useState<'config' | 'releases'>('config');
    // A release-stamp peek's deep-link to one specific release, forwarded to
    // ReleasesPane, which selects that release's bar and scroll-pulses it.
    // The nonce (borrowed from tabFocus) lets re-clicking the same release
    // re-trigger the scroll/highlight even though `num` didn't change.
    // One-shot: the pane reports back once it has applied the link and this is
    // cleared, because the pane is unmounted whenever the Configuration tab is
    // showing and an uncleared link would re-select its release on every
    // subsequent visit to the Releases tab.
    const [highlightRelease, setHighlightRelease] = useState<{ num: number; nonce: number } | null>(null);
    const handleHighlightConsumed = useCallback(() => setHighlightRelease(null), []);
    // What the two release selectors hold: 0, 1 or 2 ids (a ReleaseID, or
    // ReleasesPane's declared-bar sentinel), in click order.
    // Lives HERE rather than inside the pane because the shared BottomBar —
    // which is outside the tab body — swaps its verb on it. Ephemeral view
    // state by design: not a route, and deliberately does not survive a
    // reload or a node switch.
    //
    // `null` means UNTOUCHED, and is not the same as the empty array. A reader
    // arriving at the tab is shown the latest release against its predecessor
    // — the change they are most likely to have come to see — which needs a
    // starting value that the release list can only supply once it has loaded.
    // An explicit `[]` is the reader asking to compare nothing, which is how
    // they get back to the unreleased view; if both meant the same thing the
    // default would reassert itself the moment they cleared it.
    const [releaseSelection, setReleaseSelection] = useState<readonly string[] | null>(null);
    // ── Named release (plan 002): optional Name/Notes, notes collapsed by
    // default. Both fields live in the footer action row now (v7), alongside
    // the Release button that consumes them.
    const [isNamingExpanded, setIsNamingExpanded] = useState(false);
    const [releaseName, setReleaseName] = useState('');
    const [releaseNotes, setReleaseNotes] = useState('');
    // ── True-staging signals/state ──
    // Per-unit staged-path counts reported up by each ComponentValuesSection.
    const [stagedCountByUnit, setStagedCountByUnit] = useState<Map<string, number>>(new Map());
    // Per-unit staged-PROTECTION counts, reported up separately from the value
    // count above (card 8: "N staged" and "N kept" are distinct numbers).
    // `protectCount` (of `total`) is how many target Protected:true — tells a
    // uniform "will be kept" batch from a mixed "Update N keys" one.
    const [stagedProtectionCountByUnit, setStagedProtectionCountByUnit] = useState<Map<string, { total: number; protectCount: number }>>(new Map());
    // Per-unit staged-edit "keep" summary: of this unit's staged MANUAL edits
    // (excludes staged upgrade picks — card 3's scenario is specifically about
    // typed values), how many total and how many are NOT yet effectively kept.
    // Drives the "N staged · both may be overwritten" / "both kept on merge"
    // bar disclosure (Section 6).
    const [stagedEditKeepSummaryByUnit, setStagedEditKeepSummaryByUnit] = useState<Map<string, { total: number; unkept: number }>>(new Map());
    // Unit ids whose MutationSources a leaf/folder kebab has actually asked
    // for (Finding 2's lazy fetch) — grows via requestProtectionData, never
    // shrinks within a pane session. Fetched ALONGSIDE (not instead of) the
    // Scope chip's own contributing-unit set below, in one combined query.
    const [protectionRequestedUnitIds, setProtectionRequestedUnitIds] = useState<Set<string>>(new Set());
    const requestProtectionData = useCallback((unitId: string) => {
      setProtectionRequestedUnitIds((prev) => (prev.has(unitId) ? prev : new Set([...prev, unitId])));
    }, []);
    // Monotonic signals bridged down to each section (mirrors the old accept-all signal).
    const [commitStagedSignal, setCommitStagedSignal] = useState(0);
    const [clearStagedSignal, setClearStagedSignal] = useState(0);
    // Explicit "Discard" (footer) — drops EVERYTHING staged incl. sticky edits.
    const [discardAllSignal, setDiscardAllSignal] = useState(0);
    const [stageAllSignal, setStageAllSignal] = useState(0);
    // "Keep both on merge" / "Undo keep" bar buttons (card 3b) — staging-level
    // actions, not commits. See ComponentValuesSectionProps.keepStagedEditsSignal.
    const [keepStagedEditsSignal, setKeepStagedEditsSignal] = useState(0);
    const [undoKeepStagedEditsSignal, setUndoKeepStagedEditsSignal] = useState(0);
    // "Stop keeping N keys" — the Scope chip's flattened-view bulk-reverse
    // (Section 7/card 4b). See ComponentValuesSectionProps.stopKeepingAllSignal.
    const [stopKeepingAllSignal, setStopKeepingAllSignal] = useState(0);
    const [filterMode, setFilterMode] = useState<'incoming' | 'all'>(
      (upgradeEntries.length > 0 || hasUpgradableUnits) ? 'incoming' : 'all'
    );
    const [scopeFilter, setScopeFilter] = useState<'local-overrides' | 'local-only' | 'kept-on-merge' | null>(null);

    // Auto-manage the staged selection as the filter tab changes (done in the
    // setter — not a useEffect — so it covers tab clicks, node switches):
    //   - entering 'incoming' → stage ALL upgradable paths (same as Select all)
    //   - leaving 'incoming'  → discard the staged selection (same as Discard)
    // Clearing staged never touches committedDiffs, so committed/"done" rows stay
    // visible; re-staging stages only currently-upgradable paths (committed excluded).
    const setFilterModeWithStaging = useCallback((next: 'incoming' | 'all') => {
      setFilterMode((prev) => {
        if (next !== prev) {
          if (next === 'incoming') setStageAllSignal((s) => s + 1);
          else if (prev === 'incoming') setClearStagedSignal((s) => s + 1);
        }
        return next;
      });
    }, []);
    const [recentlyUpgradedUnitIds, setRecentlyUpgradedUnitIds] = useState<Set<string>>(new Set());
    // ── Oversized-unit gate ("show fast, load full on demand") ──
    // Units whose payload is over `HEAVY_UNIT_BYTES` and which the user
    // has explicitly chosen to render anyway. Opt-in is per-unit and per-node
    // visit: cleared on node switch below, alongside recentlyUpgradedUnitIds.
    const [materializedUnitIds, setMaterializedUnitIds] = useState<Set<string>>(new Set());
    // Which unit's "Render anyway" is in flight. Set URGENTLY so the card is
    // replaced by the loading state on the very next paint, while the build
    // itself runs as a low-priority transition (see handleRenderAnyway).
    const [materializingUnitId, setMaterializingUnitId] = useState<string | null>(null);
    const [isMaterializing, startMaterializing] = useTransition();
    const [viewMode, setViewMode] = useState<'diff' | 'source'>('diff');
    // ── Per-unit Source-view override ────────────────────────────────────────
    // Oversized units the user opened in Source view FROM their placeholder
    // card. Separate state from `viewMode` on purpose, and `viewMode` is never
    // written by this path: the pane toggle is PANE-WIDE, so answering "what is
    // in this one 5MB unit?" through it would drag every sibling into Monaco.
    //
    // components.md rule 13 ("Treeview is the DEFAULT view … do not flip the
    // default") is respected literally: the pane default stays 'diff', nothing
    // auto-switches, and this only ever moves on an explicit click.
    //
    // Per-node like `materializedUnitIds` — cleared on node switch below.
    const [sourceOverrideUnitIds, setSourceOverrideUnitIds] = useState<Set<string>>(new Set());
    const [upgradeHovered, setUpgradeHovered] = useState(false);
    // Persist the full upgrade-all preview (inline value-swap + dim unchanged
    // rows + pill scaling) whenever the Upgradable tab is active, not just while
    // the footer Upgrade-all button is hovered.
    const showUpgradePreview = upgradeHovered || filterMode === 'incoming';
    // Hoisted so the Scope row's render gate and the protection-lookup fetch's
    // skip condition read the IDENTICAL predicate — they must never disagree
    // about whether the "Kept on merge" chip exists (the fetch would either run
    // pointlessly with no row to show its answer, or the row would render before
    // its data could ever arrive).
    const scopeRowVisible = viewMode === 'diff' && filterMode === 'all';
    const isDragging = useRef(false);
    const dragStartPos = useRef(0);
    const dragStartSize = useRef(0);
    const containerRef = useRef<HTMLDivElement>(null);

    const handleResizeStart = useCallback(
      (e: React.MouseEvent) => {
        e.preventDefault();
        isDragging.current = true;
        dragStartPos.current = e.clientX;
        dragStartSize.current = width;
        let didMove = false;
        onResizeStart?.();

        const handleMouseMove = (moveEvent: MouseEvent) => {
          if (!isDragging.current) return;
          const delta = dragStartPos.current - moveEvent.clientX;
          if (Math.abs(delta) > 3) didMove = true;
          if (!didMove) return;
          const parentSize = layoutRef?.current?.clientWidth ?? window.innerWidth;
          const maxSize = parentSize * MAX_PERCENT;
          const newSize = Math.min(Math.max(dragStartSize.current + delta, MIN_SIZE), maxSize);
          onWidthChange(newSize);
        };

        const handleMouseUp = () => {
          isDragging.current = false;
          onResizeEnd?.();
          document.removeEventListener('mousemove', handleMouseMove);
          document.removeEventListener('mouseup', handleMouseUp);
        };

        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
      },
      [width, onWidthChange, layoutRef, onResizeStart, onResizeEnd],
    );

    const handleResizeDoubleClick = useCallback(() => {
      const parentSize = layoutRef?.current?.clientWidth ?? window.innerWidth;
      const maxSize = parentSize * MAX_PERCENT;
      const isAtMax = Math.abs(width - maxSize) < 10;
      onWidthChange(isAtMax ? defaultWidth : maxSize);
    }, [width, defaultWidth, onWidthChange, layoutRef]);

    const deploymentMap = useMemo(() => buildDeploymentMap(deployments), [deployments]);

    // Currently-selected deployment (single-select model). Bases (no Target)
    // can't be applied; root deployments (no upstream) can't be upgraded —
    // hide the corresponding tabs/actions for them.
    const selectedDeployment = useMemo(() => {
      const id = selectedDeploymentIds.values().next().value;
      return id ? deploymentMap.get(id) : undefined;
    }, [selectedDeploymentIds, deploymentMap]);
    // In a graph of several Components every Component has a "prod", so the
    // header says which Component the open node belongs to.
    const multiComponent = useMemo(() => isMultiComponent(deployments), [deployments]);
    const headerComponent = multiComponent ? selectedDeployment?.componentName : undefined;
    const canRelease = !!selectedDeployment?.releaseTargetId;
    // also true for a same-Space upstream, which parentDeploymentId excludes
    const canUpgrade = selectedDeployment?.parentDeploymentId != null || !!hasUpgradableUnits;

    // ── Comparing several deployments ──────────────────────────────────────
    //
    // Slot A is `selectedDeployment`: the deployment this pane is open on. The
    // extra slots come from the URL, so a comparison is a link. Empty is the
    // shipped pane — one deployment, one tree, one set of staging controls —
    // and nothing below changes until a second deployment is picked.
    const compareExtraIds = compareDeploymentIds ?? EMPTY_COMPARE_IDS;
    /**
     * Units whose configuration request has completed at least once.
     *
     * A ref rather than state: it records what has already happened and must not
     * itself cause a render, and it only ever grows.
     */
    const settledUnitIdsRef = useRef<Set<string>>(new Set());
    const isComparing = compareExtraIds.length > 0 && !!selectedDeployment;

    /** Slot order, the open deployment first — what the selector row and the columns both read. */
    const compareSelection = useMemo(
      () => (selectedDeployment ? [selectedDeployment.deploymentId, ...compareExtraIds] : []),
      [selectedDeployment, compareExtraIds],
    );

    const compareOptions = useMemo<DeploymentOption[]>(
      () =>
        deployments.map((deployment) => {
          const units = unitsByDeployment.get(deployment.deploymentId);
          // `deployment.displayName` is the SAME `Space.Labels.Variant ?? slug`
          // the flow graph node prints (`componentData.ts`, `DeploymentFlowNode`'s
          // `NodeName`) — the one source of truth for what a deployment is
          // called, reused rather than re-derived. `label` is what every compare
          // surface shows primarily; `displayName` is the Space name, carried
          // along ONLY when it differs from what is shown, so a deployment with
          // no variant gets no redundant second line.
          const shown = deployment.displayName;
          return {
            id: deployment.deploymentId,
            label: shown,
            displayName: shown === deployment.slug ? undefined : deployment.slug,
            componentName: multiComponent ? deployment.componentName : undefined,
            isCurrent: !!deployment.releaseTargetId && deployment.unappliedCount === 0,
            isDeclared: deployment.unappliedCount > 0,
            meta: `${deployment.unitCount} ${deployment.unitCount === 1 ? 'unit' : 'units'}`,
            // A deployment whose units have not arrived cannot be counted yet,
            // and must not report zero — zero reads as "identical".
            state: units === undefined ? 'pending' : 'ready',
            changedFields: units === undefined ? undefined : deployment.upgradeableCount,
          };
        }),
      [deployments, unitsByDeployment, multiComponent],
    );

    /**
     * Deployment ID → what it is shown as (variant label, or the Space slug
     * when it has none), for the drag layer's overlay chip and announcements.
     */
    const compareLabelById = useMemo(
      () => new Map(compareOptions.map((option) => [option.id, option.label])),
      [compareOptions],
    );

    /**
     * One entry per unit ANY selected deployment holds, each with a column per
     * slot.
     *
     * Walking `compareSelection` left to right — first-appearance order —
     * rather than reading only slot A's units: with no reference column, a
     * unit only a LATER slot carries is still worth a row, the same way a
     * field only a later column carries still gets one in the grid itself.
     */
    const compareUnits = useMemo<CompareUnit[]>(() => {
      if (!isComparing || !selectedDeployment) return [];
      // Anything visible while the query is idle has had its answer, whatever
      // that answer was.
      if (!isUnitDataFetching) {
        for (const ids of unitsByDeployment.values()) {
          for (const unit of ids) settledUnitIdsRef.current.add(unit.unitId);
        }
      }
      const slugs: string[] = [];
      const seenSlugs = new Set<string>();
      for (const deploymentId of compareSelection) {
        for (const unit of unitsByDeployment.get(deploymentId) ?? []) {
          if (seenSlugs.has(unit.slug)) continue;
          seenSlugs.add(unit.slug);
          slugs.push(unit.slug);
        }
      }
      return slugs.map((slug) => ({
        slug,
        columns: compareSelection.map((deploymentId) => {
          const deployment = deploymentMap.get(deploymentId);
          // Same rule as `compareOptions` above: show the variant label (or the
          // slug, when there is none), and carry the Space slug alongside only
          // when it says something the shown name does not already.
          const shown = deployment?.displayName ?? deployment?.slug ?? deploymentId;
          const sibling = unitsByDeployment
            .get(deploymentId)
            ?.find((candidate) => candidate.slug === slug);
          return {
            deploymentId,
            label: shown,
            displayName: deployment && shown !== deployment.slug ? deployment.slug : undefined,
            data: sibling?.data,
            unitId: sibling?.unitId,
            // Three separate facts, and each gets its own word. "Loading" is
            // the only one that is transient, so it is the only one allowed to
            // depend on a request being in flight — a unit with no bytes and no
            // request outstanding is empty, and saying "loading" about it is a
            // wait that never ends.
            unavailable: !sibling
              ? ('no-such-unit' as const)
              : sibling.data
                ? undefined
                : // PER UNIT, not per component. `isUnitDataFetching` is one flag
                  // over one bulk query covering every unit of every deployment,
                  // so a refetch caused by editing somewhere else would flip an
                  // already-settled empty unit back to "loading" — the stuck
                  // loading bug returning through a different door. A unit that
                  // has once been seen settled stays settled.
                  isUnitDataFetching && !settledUnitIdsRef.current.has(sibling.unitId)
                  ? ('loading' as const)
                  : ('empty-unit' as const),
          };
        }),
      }));
    }, [isComparing, selectedDeployment, unitsByDeployment, compareSelection, deploymentMap, isUnitDataFetching]);

    const handleCompareSelectionChange = useCallback(
      (next: readonly string[]) => onCompareSelectionChange?.(next),
      [onCompareSelectionChange],
    );

    // A node switch can land on a tab that no longer exists for the new node
    // (e.g. from a release-enabled Space to a plain one) — reset rather than
    // render a tab bar showing something else selected.
    useEffect(() => {
      if (activeTab === 'releases' && !(canRelease && release)) setActiveTab('config');
      // Only the current node's own capabilities matter here — a node SWITCH
      // is what can invalidate the current tab, not activeTab itself
      // changing (that would fight a legitimate user click into a tab that
      // is about to be gated true a moment later, e.g. release data still
      // loading).
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedDeployment?.deploymentId, canRelease, release]);

    // "Just published" signal for the Releases tab's fresh-tint dot. It lives
    // HERE, not inside the Releases pane, because that pane unmounts while
    // the Configuration tab is active and would miss the transition;
    // ComponentSidePane stays mounted regardless of the active tab, so it can
    // catch it. Do not move it into ReleasesPane.
    const isReleaseFresh = useFreshSignal(
      release?.latestRelease?.Release?.ReleaseID,
      release?.latestRelease?.Release?.CreatedAt,
      RELEASE_FRESH_SETTLE_MS,
    );

    const mergedUnits = useMemo((): MergedUnit[] => {
      const upgradeByUnit = new Map(upgradeEntries.map((e) => [e.unitId, e]));
      const applyByUnit = new Map(allApplyEntries.map((e) => [e.unitId, e]));
      const variationByUnit = new Map(variationEntries.map((e) => [e.unitId, e]));

      const units: MergedUnit[] = [];
      for (const [did, deploymentUnits] of unitsByDeployment) {
        if (!selectedDeploymentIds.has(did)) continue;
        for (const u of deploymentUnits) {
          const ue = upgradeByUnit.get(u.unitId);
          const ae = applyByUnit.get(u.unitId);
          const ve = variationByUnit.get(u.unitId);
          const isUpgradeLoading = !!dryRunPendingIds?.has(u.unitId);
          units.push({
            ...u,
            upgradeEntry: ue,
            applyEntry: ae,
            variationEntry: ve,
            isUpgradeLoading,
            hasAction: !!ue || !!ae || isUpgradeLoading,
          });
        }
      }

      units.sort((a, b) => {
        if (a.hasAction !== b.hasAction) return a.hasAction ? -1 : 1;
        return a.slug.localeCompare(b.slug);
      });

      return units;
    }, [
      upgradeEntries,
      allApplyEntries,
      variationEntries,
      unitsByDeployment,
      selectedDeploymentIds,
      dryRunPendingIds,
    ]);

    // Units belonging to the selected Space's Release target set — the SAME
    // filter release_core.go applies when bundling a publish (TargetID ==
    // Space.ReleaseTargetID). Feeds the "Unreleased changes" section (task
    // #60), which diffs each of these units' head Data against its last-
    // released revision. Deliberately independent of `mergedUnits` above:
    // that structure carries Upgrade/Apply/Variation entries that don't
    // apply here, and this only needs {unitId, slug, spaceId, data}.
    const releaseUnits = useMemo(() => {
      if (!selectedDeployment?.releaseTargetId) return [];
      const targetId = selectedDeployment.releaseTargetId;
      const list: { unitId: string; slug: string; spaceId: string; data?: string }[] = [];
      for (const [did, deploymentUnits] of unitsByDeployment) {
        if (!selectedDeploymentIds.has(did)) continue;
        for (const u of deploymentUnits) {
          if (u.targetId === targetId) {
            list.push({ unitId: u.unitId, slug: u.slug, spaceId: u.spaceId, data: u.data });
          }
        }
      }
      return list;
    }, [selectedDeployment, unitsByDeployment, selectedDeploymentIds]);

    // Shared "changed since the last release" resolution (task #69) —
    // HEAD-SCOPED, feeds the footer Release button's count chip
    // unconditionally (never the `baseline` argument — see the second
    // instance below) and, in the default state, the diff viewport. Only fed
    // real units while the Releases tab is actually active — on the
    // Configuration tab the Release button doesn't even render (task #52),
    // so there's nothing to keep this warm for.
    const {
      resultsByUnit: unreleasedResultsByUnit,
      allResolved: unreleasedAllResolved,
      totalChangedFields: totalUnreleasedFields,
    } = useUnreleasedChanges(
      activeTab === 'releases' ? releaseUnits : EMPTY_RELEASE_UNITS,
      release?.latestRelease?.Release?.ReleaseID,
      selectedDeployment?.deploymentId ?? '',
    );

    // Single pass so the visible list and "why it matched" stay in sync by
    // construction — a unit only auto-opens for search (see `isUnitExpandedInPane`)
    // when the SAME check that put it in the list found the query inside its
    // content, not just in its name. A slug-only match doesn't get the row
    // opened: the name is already on screen in the header, so there's nothing
    // hidden that the search was looking for.
    const { filteredUnits, searchContentMatchedUnitIds } = useMemo(() => {
      if (!filterText) return { filteredUnits: mergedUnits, searchContentMatchedUnitIds: EMPTY_STRING_SET };
      const lower = filterText.toLowerCase();
      const units: MergedUnit[] = [];
      const contentMatchedIds = new Set<string>();
      for (const u of mergedUnits) {
        const slugMatches = u.slug.toLowerCase().includes(lower);
        const allDiffs = [
          ...(u.upgradeEntry?.fieldDiffs ?? []),
          ...(u.applyEntry?.fieldDiffs ?? []),
        ];
        const allPathEntries = [
          ...(u.upgradeEntry?.allPaths ?? []),
          ...(u.applyEntry?.allPaths ?? []),
          ...(u.variationEntry?.allPaths ?? []),
        ];
        const contentMatches =
          allDiffs.some(
            (d) =>
              d.path.toLowerCase().includes(lower) ||
              d.oldValue.toLowerCase().includes(lower) ||
              d.newValue.toLowerCase().includes(lower),
          ) ||
          allPathEntries.some(
            (p) => p.path.toLowerCase().includes(lower) || p.value.toLowerCase().includes(lower),
          );
        if (slugMatches || contentMatches) units.push(u);
        if (contentMatches) contentMatchedIds.add(u.unitId);
      }
      return { filteredUnits: units, searchContentMatchedUnitIds: contentMatchedIds };
    }, [mergedUnits, filterText]);

    // The expansion inputs, bundled so the row rendering and the field-count chip
    // evaluate the SAME predicate against the SAME state.
    const expansionState = useMemo<UnitExpansionState>(
      () => ({
        collapsedGroups,
        forcedExpandedGroups,
        recentlyUpgradedUnitIds,
        materializedUnitIds,
        filterMode,
        scopeFilter,
        unitCount: mergedUnits.length,
        searchContentMatchedUnitIds,
      }),
      [
        collapsedGroups,
        forcedExpandedGroups,
        recentlyUpgradedUnitIds,
        materializedUnitIds,
        filterMode,
        scopeFilter,
        mergedUnits.length,
        searchContentMatchedUnitIds,
      ],
    );

    /**
     * Opt an oversized unit in to being rendered.
     *
     * Two updates on purpose, at two different priorities:
     *   1. `setMaterializingUnitId` is URGENT, so the very next paint swaps the
     *      placeholder card for the loading state. The click acknowledges itself
     *      immediately instead of appearing to do nothing for a second.
     *   2. `setMaterializedUnitIds` runs inside `startTransition`, so React
     *      builds the (expensive) values section at low priority with the
     *      loading state still on screen, rather than blocking the click's own
     *      paint. Without this the page would freeze straight from card to
     *      finished tree and the loading state would never be seen — which the
     *      design calls out explicitly as worse than having designed none.
     *
     * `materializingUnitId` is deliberately never cleared on completion: once the
     * id is in `materializedUnitIds` the gate branch is not taken, so a stale
     * value is unreachable. It IS cleared on node switch, with everything else.
     */
    const handleRenderAnyway = useCallback((unitId: string) => {
      setMaterializingUnitId(unitId);
      startMaterializing(() => {
        setMaterializedUnitIds((prev) => setSetMember(prev, unitId, true));
      });
    }, []);

    /**
     * Show ONE oversized unit in Source view, leaving the pane — and every
     * sibling unit in it — in Tree view.
     *
     * Not deferred through a transition the way `handleRenderAnyway` is,
     * because it doesn't need to be. Measured in Chromium on the 5.3MB kyverno
     * fixture (`test-data/kyverno-no-replicas.yaml`) with the Monaco chunk
     * already loaded: ~120ms of blocked main thread, editor on screen at
     * ~155ms, fully settled at ~300ms — inside the 300ms budget
     * `HEAVY_UNIT_BUILD_BUDGET_MS` sets, and roughly an eighth of the ~900ms
     * the same payload costs as a field tree. Monaco renders only the ~26 lines
     * in view, and above `MONACO_SCHEMA_MAX_BYTES` (CodeEditor.tsx) it drops
     * schema validation, the per-line decoration pass and the minimap, which is
     * what keeps this cheap. That guard is load-bearing for this action: if it
     * is ever removed, re-measure before trusting this button.
     */
    const handleOpenInSource = useCallback((unitId: string) => {
      setSourceOverrideUnitIds((prev) => setSetMember(prev, unitId, true));
    }, []);

    /** Return one overridden unit to the treeview — i.e. to its gate card. */
    const handleBackToTree = useCallback((unitId: string) => {
      setSourceOverrideUnitIds((prev) => setSetMember(prev, unitId, false));
    }, []);

    // ── Deferred first paint for merely-LARGE (allowed) units ────────────────
    // `useDeferredValue` is React 18's purpose-built tool for "show lighter UI
    // while a heavy update is in flight" — the same reasoning, and the same
    // shape, as `UnitListPage`'s cross-tab transition flag.
    //
    // When the user switches node, this key changes; React first re-renders at
    // high priority with the STALE key (so `isHeavyPaintPending` is true and big
    // units render a skeleton, which paints in a frame), then re-renders at low
    // priority with the current key and swaps the real trees in. The alternative
    // — mounting every values section synchronously — makes the pane's own
    // chrome wait behind the heaviest unit in the node.
    //
    // KEYED ON THE SELECTED NODE ONLY, deliberately. Filter-tab, scope and
    // view changes are NOT in the key, even though they are also expensive
    // re-renders, because swapping a mounted `ComponentValuesSection` out for a
    // skeleton UNMOUNTS it — and its staged manual edits live in that
    // component's own state, which components.md rule 9 requires to survive a
    // tab switch (only `discardAllSignal` or a commit may clear them). A node
    // switch is the one transition where those sections are torn down anyway:
    // the sections are keyed on `unit.unitId` and a different node means
    // different units, so nothing that should persist is lost.
    //
    // Bounded by `shouldDeferUnitPaint` at the point of use, so ordinary units
    // never flash a skeleton they didn't need. Note this defers on CHANGES; the
    // pane's very first render for a session has no previous key to lag behind,
    // and pays the full mount as before.
    const heavyPaintKey = useMemo(
      () => [...selectedDeploymentIds].join(','),
      [selectedDeploymentIds],
    );
    const deferredHeavyPaintKey = useDeferredValue(heavyPaintKey);
    const isHeavyPaintPending = deferredHeavyPaintKey !== heavyPaintKey;

    // The historical / span comparisons the Releases tab can show are owned
    // by `ReleasesPane` now: the lane resolves them from its own progressive
    // cache (`useReleaseMagnitudes`), and only a span whose upper end is the
    // declared state costs a request. The head-scoped instance above stays
    // separate and unconditional, which is what makes the footer's "cannot
    // publish while reading history" guard trustworthy — the footer reads
    // `totalUnreleasedFields`/`unreleasedAllResolved` from that instance and
    // from nothing else.
    // `releases` is newest-first, so [0] is current.
    const currentReleaseId = release?.releases?.[0]?.Release?.ReleaseID;
    // THE DEFAULT IS THE CHANGE A READER MOST LIKELY CAME FOR, which depends on
    // whether there is anything unreleased:
    //   work waiting  ->  the working configuration
    //   none waiting  ->  the current release
    // The target — the newer end — goes in the first slot, which is where the
    // pane already puts it.
    //
    // ONE END ONLY. The second slot starts empty and is the reader's to fill.
    // It is not a missing value: a lone selection is read against its own
    // immediate predecessor, so the diff on screen is the same one a seeded
    // pair produced, and picking that predecessor by hand changes only which
    // control names it. Seeding it instead answered a question the reader had
    // not asked, and spent the pane's widest control saying what the pane was
    // already going to show.
    //
    // HELD UNTIL THE UNRELEASED COUNT RESOLVES. It arrives from a query, so
    // seeding before it lands would show one comparison and silently replace it
    // with the other. The pane already has a loading treatment for "not known
    // yet"; a comparison that changes under a reader who touched nothing has
    // none, and leaves them unable to tell whether they mis-saw it or it moved.
    const effectiveReleaseSelection = useMemo(() => {
      if (releaseSelection) return releaseSelection;
      if (!currentReleaseId || !unreleasedAllResolved) return EMPTY_RELEASE_SELECTION;
      return totalUnreleasedFields > 0 ? [DECLARED_BAR_ID] : [currentReleaseId];
    }, [releaseSelection, currentReleaseId, unreleasedAllResolved, totalUnreleasedFields]);
    // Untouched AND undecided. The pane cannot tell that apart from a reader
    // who cleared both slots, and the two mean opposite things, so it is told.
    //
    // BOTH INPUTS, because the default above needs both. The unreleased count
    // and the release list resolve independently, so when the count lands first
    // the selection is still empty while nothing is marked undecided — and the
    // pane renders two empty selectors stating "nothing is selected" at the one
    // moment it cannot know that. The guard has to cover every condition under
    // which the default is still withheld, or it is not guarding that default.
    const releaseSelectionPending =
      releaseSelection === null && (!unreleasedAllResolved || !currentReleaseId);
    // The footer offers Release whenever UNRELEASED WORK IS PART OF WHAT IS ON
    // SCREEN, and shows nothing at all otherwise. Two cases qualify: a slot
    // holding the working configuration, and nothing selected at all — which
    // renders the current release against the working configuration and is
    // therefore a view OF the unreleased work, not a view of history.
    //
    // Keyed on what is being SHOWN rather than on whether a selection exists.
    // The footgun this closes is a live Release button under a screenful of
    // some past release's diff.
    const showsUnreleased =
      effectiveReleaseSelection.length === 0 ||
      effectiveReleaseSelection.includes(DECLARED_BAR_ID);

    const totalUpgradableFields = useMemo(
      () => mergedUnits.reduce((n, u) => n + countUpgradableBadgeFields(u), 0),
      [mergedUnits],
    );
    // Units with a REAL revision gap (an entry in `upgradeEntries` only ever
    // exists when upstreamRevisionNum < upstreamHeadRevisionNum — see
    // buildUpgradeEntries) but ZERO stageable fields — either the upstream's
    // new revision is byte-identical in content, or every diffed path is
    // blocked by a local override. Staging has nothing to offer these units,
    // so they never appear in `totalStaged`, but the revision POINTER is
    // still genuinely behind and Upgrade should still be able to advance it
    // (task #61).
    const dormantUpgradeableUnits = useMemo(
      () => mergedUnits.filter((u) => !!u.upgradeEntry && countUpgradableBadgeFields(u) === 0),
      [mergedUnits],
    );
    // Count TRUE per-document leaves. The `allPaths` fallback below is deduplicated by
    // bare dot-path, so a unit holding several documents that share `apiVersion`/`kind`
    // under-counts them — the chip must match the fields the grouped tree renders.
    //
    // Counting used to structurally parse EVERY unit of the node — including the
    // collapsed ones the user never opened — on open and again whenever
    // `mergedUnits` changed, i.e. on every poll. Now a unit is counted only when
    // that costs nothing: either its count is already known (`peekGroupedLeafCount`
    // — it was materialized earlier), or the pane is materializing it in this very
    // render, in which case the parse is the one its values section performs anyway
    // and both calls share the parse cache. Units left uncounted flip
    // `allFieldsPartial`, which renders the chip as "N+" — never a silent
    // under-count.
    //
    // An OVERSIZED unit is expanded but not materialized (its body shows the
    // placeholder card), so it takes the same "+" path as a collapsed one. That
    // is the correct answer and not a special case: a unit we deliberately never
    // decoded has no knowable field count, and inventing one — or parsing it just
    // to count it — would defeat the gate entirely.
    const { totalAllFields, allFieldsPartial } = useMemo(
      () => computeTotalAllFields(mergedUnits, (u) => isUnitMaterializedInPane(u, expansionState)),
      [mergedUnits, expansionState],
    );
    const totalLocalOverrides = useMemo(
      () => mergedUnits.reduce((n, u) => n + countLogicalChanges((u.variationEntry?.fieldDiffs ?? []).map((d) => d.path)), 0),
      [mergedUnits],
    );
    const totalLocalOnly = useMemo(
      () => mergedUnits.reduce((n, u) => n + (u.variationEntry?.localOnlyPaths?.length ?? 0), 0),
      [mergedUnits],
    );

    // ── "Kept on merge" (L2) ──────────────────────────────────────────────
    // Units that could contribute to the chip: anything liveFieldDiffs (the
    // untainted, current-vs-upstream set the value border also reads — see
    // VariationEntry.liveFieldDiffs) reports as differing from upstream right
    // now. Deliberately NOT variationEntry.fieldDiffs (dry-run-tainted): using
    // that here would be the same bug this whole feature exists to avoid.
    const contributingUnits = useMemo(
      () => mergedUnits.filter((u) => (u.variationEntry?.liveFieldDiffs.length ?? 0) > 0),
      [mergedUnits],
    );
    // .sort() matters: mergedUnits is re-sorted by hasAction then slug on every
    // render (see `units.sort` above), so an unsorted id list would change this
    // query's cache key on every dry-run poll and refetch a multi-MB
    // MutationSources payload each time. Same reasoning as the `spaceIds` sort
    // in AppComponentView.tsx, ahead of ITS useListAllUnitsQuery call.
    const protectionUnitIds = useMemo(
      () => contributingUnits.map((u) => u.unitId).sort(),
      [contributingUnits],
    );
    // Per unit, the live-diverged paths a protection lookup can actually answer
    // for — array-indexed paths excluded (see protectedPaths.ts's module
    // comment for why: MutationSources keys array elements associatively,
    // ResolvedPath, while the tree addresses them positionally, and there is no
    // parser in ui/src to translate between the two, so guessing would risk
    // reporting "will be overwritten" about a value a merge in fact protects).
    const checkablePathsByUnit = useMemo(() => {
      const m = new Map<string, string[]>();
      for (const u of contributingUnits) {
        const paths = (u.variationEntry?.liveFieldDiffs ?? [])
          .map((d) => d.path)
          .filter((p) => !pathContainsArrayIndex(p));
        if (paths.length > 0) m.set(u.unitId, paths);
      }
      return m;
    }, [contributingUnits]);
    // L = every path liveFieldDiffs reports, across all contributing units,
    // arrays included. M = the checkable subset (see checkablePathsByUnit).
    // M <= L always, by construction, so "M of L" can never invert.
    const totalLiveL = useMemo(
      () => contributingUnits.reduce((n, u) => n + (u.variationEntry?.liveFieldDiffs.length ?? 0), 0),
      [contributingUnits],
    );
    const totalCheckableM = useMemo(
      () => Array.from(checkablePathsByUnit.values()).reduce((n, paths) => n + paths.length, 0),
      [checkablePathsByUnit],
    );
    // Union of the Scope chip's own contributing-unit set (while the Scope row
    // is on screen) with whatever units a leaf/folder kebab has actually asked
    // for (Finding 2's lazy fetch, ANY tab) — one combined query rather than
    // two separately-gated ones, so the same MutationSources payload for a
    // unit is never fetched twice.
    const protectionFetchUnitIds = useMemo(() => {
      const ids = new Set<string>(protectionRequestedUnitIds);
      if (scopeRowVisible) for (const id of protectionUnitIds) ids.add(id);
      // While comparing, every column's unit needs its own answer: protection is
      // a property of a path in a UNIT, so two deployments can disagree about
      // whether the same field is kept. Fetched only while the comparison is on
      // screen, and it is the same handful of units the grid is already showing
      // — the cost this query is careful about is asking for the whole app, not
      // for the units in front of the user.
      for (const unit of compareUnits) {
        for (const column of unit.columns) if (column.unitId) ids.add(column.unitId);
      }
      return Array.from(ids).sort();
    }, [protectionRequestedUnitIds, scopeRowVisible, protectionUnitIds, compareUnits]);
    // MutationSources is deliberately absent from the pane's main units query
    // (AppComponentView.tsx's useListAllUnitsQuery `select` — its own comment
    // explains the ~5MB/revision cost, 14MB to 50MB for the whole app). It is
    // affordable HERE because this asks only for the handful of units that
    // actually need it — either they contribute to the Scope chip's count
    // (only while that row is on screen) or a kebab was opened for them (any
    // tab, lazily, never unconditionally for every unit — Finding 2).
    const { sourcesFor: mutationSourcesFor, isFetching: protectionDataFetching } =
      useUnitMutationSourcesMap(protectionFetchUnitIds);
    const hasProtectionData = protectionFetchUnitIds.length > 0 && !protectionDataFetching;
    const mutationSourcesByUnitId = useMemo(
      () => new Map(protectionFetchUnitIds.map((id) => [id, mutationSourcesFor(id)])),
      [protectionFetchUnitIds, mutationSourcesFor],
    );
    const totalKeptOnMergeN = useMemo(() => {
      if (!hasProtectionData) return 0;
      let n = 0;
      for (const u of contributingUnits) {
        const paths = checkablePathsByUnit.get(u.unitId);
        if (!paths) continue;
        const fieldPathMeta = buildFieldPathMeta(u.data);
        const isProtected = buildProtectedPathLookup(mutationSourcesByUnitId.get(u.unitId), fieldPathMeta);
        n += paths.filter(isProtected).length;
      }
      return n;
    }, [hasProtectionData, contributingUnits, checkablePathsByUnit, mutationSourcesByUnitId]);
    // Per-unit CURRENT effective protection lookup, handed to each
    // ComponentValuesSection instance as `isProtected` (see NodeRowProps).
    // Unfetched → buildProtectedPathLookup(undefined, ...) → () => false,
    // Finding 2's safe default (unknown reads as unprotected).
    const isProtectedByUnit = useMemo(() => {
      const m = new Map<string, (path: string) => boolean>();
      for (const u of mergedUnits) {
        const fieldPathMeta = buildFieldPathMeta(u.data);
        m.set(u.unitId, buildProtectedPathLookup(mutationSourcesByUnitId.get(u.unitId), fieldPathMeta));
      }
      return m;
    }, [mergedUnits, mutationSourcesByUnitId]);
    /**
     * Per-unit kept-on-merge lookups for the compared deployments.
     *
     * Same source the single-deployment tree reads —
     * `buildProtectedPathLookup(mutationSources, fieldPathMeta)` — so the two
     * surfaces cannot disagree about what is kept. Unfetched resolves to
     * `() => false`, which is the shipped safe default: unknown reads as
     * unprotected rather than inventing a lock.
     */
    const compareProtectionByUnitId = useMemo(() => {
      const lookups = new Map<string, (path: string) => boolean>();
      for (const unit of compareUnits) {
        for (const column of unit.columns) {
          if (!column.unitId || lookups.has(column.unitId)) continue;
          lookups.set(
            column.unitId,
            buildProtectedPathLookup(
              mutationSourcesByUnitId.get(column.unitId),
              buildFieldPathMeta(column.data),
            ),
          );
        }
      }
      return lookups;
    }, [compareUnits, mutationSourcesByUnitId]);

    const compareUnitsWithProtection = useMemo(
      () =>
        compareUnits.map((unit) => ({
          ...unit,
          columns: unit.columns.map((column) => ({
            ...column,
            isProtected: column.unitId ? compareProtectionByUnitId.get(column.unitId) : undefined,
          })),
        })),
      [compareUnits, compareProtectionByUnitId],
    );

    // Stable per-unit callback so a kebab click can lazily request this unit's
    // protection data without breaking ComponentValuesSection's memo.
    const requestProtectionDataByUnit = useMemo(() => {
      const m = new Map<string, () => void>();
      for (const u of mergedUnits) m.set(u.unitId, () => requestProtectionData(u.unitId));
      return m;
    }, [mergedUnits, requestProtectionData]);

    const prevSelectedIdRef = useRef<string | undefined>(undefined);
    const prevTabFocusNonceRef = useRef<number | undefined>(undefined);
    // Bubble the settings sheet's dirty state up to AppComponentView, which
    // owns the close routes THIS component can't guard itself: a node switch
    // (clicking a different deployment) reaches here only after
    // `selectedDeploymentIds` already changed — by then this component's own
    // effects are too late to stop anything, since the sheet's `key` prop
    // (keyed on the deployment id) has already forced React to unmount the
    // old instance as part of the same commit. Only the caller that ORIGINATES
    // the selection change (AppComponentView's node-click / close handlers)
    // can actually block it, which is why this is reported one level further
    // up rather than guarded locally like the cog is.
    useEffect(() => {
      onSettingsDirtyChange?.(isSettingsDirty);
    }, [isSettingsDirty, onSettingsDirtyChange]);
    // On node switch, reset filterMode to the optimistic default for the new node.
    // Uses the cheap synchronous signal so we land on 'upgradable' the instant a
    // node with known upgrades is selected, without waiting for the dry-run. Manual
    // tab selection is preserved while the user stays on the same node (this only
    // fires when the selected id actually changes).
    useEffect(() => {
      const selectedId = selectedDeploymentIds.values().next().value;
      if (selectedId === prevSelectedIdRef.current) return;
      prevSelectedIdRef.current = selectedId;
      if (selectedId === undefined) return; // selection cleared; pane is unmounting anyway
      setFilterMode(hasUpgradableUnits ? 'incoming' : 'all');
      setScopeFilter(null);
      // Drop the inline details pane when switching graph nodes so it never
      // persists across deployments.
      setDetailsUnit(null);
      // Same for the Space settings sheet — it belongs to the node it was
      // opened on, not a standing preference that should follow the selection.
      setIsSettingsOpen(false);
      // Land back on the Configuration tab for the newly-selected node —
      // a manually-chosen Releases tab shouldn't stick across node switches.
      setActiveTab('config');
      // A half-typed release name/notes for the PREVIOUS node's release must
      // never leak into the newly-selected node's publish.
      setIsNamingExpanded(false);
      setReleaseName('');
      setReleaseNotes('');
      // A lane selection belongs to the node it was made on — the new node's
      // release history is a different list entirely. The deep link that made
      // that selection goes with it: replayed on another node it would match
      // whichever unrelated release happens to share the same ReleaseNum.
      setReleaseSelection(null);
      setHighlightRelease(null);
      // The "just upgraded" display is purely transient for the current node's
      // interaction — drop it on node switch so it never persists across nodes
      // (and the Set can't grow unbounded over a session).
      setRecentlyUpgradedUnitIds((prev) => (prev.size ? new Set() : prev));
      // Open/closed rows are a decision about the node being looked at. Since
      // rows now start closed, a leaked forced-expand would open rows on a node
      // the user never opened them on, and a leaked collapse would hold a row
      // shut against the incoming-upgrade rule — so a newly selected node must
      // start from the pane's own default, fully collapsed.
      setForcedExpandedGroups((prev) => (prev.size ? new Set() : prev));
      setCollapsedGroups((prev) => (prev.size ? new Set() : prev));
      // Same for the oversized-unit opt-in: "render this one anyway" is a
      // decision about the node the user is looking at, not a standing
      // preference. Carrying it across nodes would silently re-introduce the
      // multi-second freeze on the next node that happens to reuse a unit id,
      // and would let the Set grow unbounded over a session.
      setMaterializedUnitIds((prev) => (prev.size ? new Set() : prev));
      setMaterializingUnitId(null);
      // And the per-unit "show me this one as source" override, for the same
      // reasons: it is a decision about a unit on the node being looked at, not
      // a standing preference, and the pane's own default must be Tree view
      // (components.md rule 13) every time a node is opened.
      setSourceOverrideUnitIds((prev) => (prev.size ? new Set() : prev));
    }, [selectedDeploymentIds, hasUpgradableUnits]);

    // Honor a status-chip peek's deep-link to a specific tab. Runs AFTER the
    // node-switch reset above (later effect wins), so a chip that opens a NEW
    // node still lands on the requested tab; the nonce guard means it also
    // re-focuses when the node is already open, and never re-fires for a stale
    // request when the user later navigates normally.
    useEffect(() => {
      if (!tabFocus || tabFocus.nonce === prevTabFocusNonceRef.current) return;
      prevTabFocusNonceRef.current = tabFocus.nonce;
      const selectedId = selectedDeploymentIds.values().next().value;
      if (tabFocus.id !== selectedId) return;
      setActiveTab(tabFocus.tab);
      if (tabFocus.releaseNum != null) {
        setHighlightRelease({ num: tabFocus.releaseNum, nonce: tabFocus.nonce });
      }
    }, [tabFocus, selectedDeploymentIds]);

    // Initial mount: if we land already on the Incoming tab, no tab CHANGE fires,
    // so stage-all wouldn't trigger via the setter. Fire it once here. Minimal
    // one-shot effect (ref-guarded) — justified because there is no transition to
    // hook for the initial state. Subsequent enters/leaves go through the setter.
    const didInitialStageAllRef = useRef(false);
    useEffect(() => {
      if (didInitialStageAllRef.current) return;
      if (filterMode === 'incoming') {
        didInitialStageAllRef.current = true;
        setStageAllSignal((s) => s + 1);
      }
    }, [filterMode]);

    // Pre-bind the per-unit field handlers so ComponentValuesSection receives
    // stable callback references across renders. Inline arrows would be
    // recreated every render, breaking ComponentValuesSection's memo during
    // unrelated re-renders (group collapse, filter typing, etc.).
    // Keyed on mergedUnits (not filteredUnits) so callbacks are stable across
    // search keystrokes — filteredUnits changes on every character typed,
    // rebuilding these maps and giving ComponentValuesSection new function
    // references, defeating its memo on every keypress.
    const setFieldValueByUnit = useMemo(() => {
      if (!onSetFieldValue) return null;
      const m = new Map<string, (path: string, newValue: string, meta?: FieldPathMeta) => Promise<void>>();
      for (const u of mergedUnits) {
        m.set(u.unitId, async (path, newValue, meta) => { await onSetFieldValue(u.unitId, u.spaceId, path, newValue, meta); });
      }
      return m;
    }, [mergedUnits, onSetFieldValue]);
    const deleteFieldValueByUnit = useMemo(() => {
      if (!onDeleteFieldValue) return null;
      const m = new Map<string, (path: string, meta?: FieldPathMeta) => Promise<void>>();
      for (const u of mergedUnits) {
        m.set(u.unitId, (path, meta) => onDeleteFieldValue(u.unitId, u.spaceId, path, meta));
      }
      return m;
    }, [mergedUnits, onDeleteFieldValue]);

    const saveDataByUnit = useMemo(() => {
      if (!onSaveData) return null;
      const m = new Map<string, (newEncodedData: string) => Promise<void>>();
      for (const u of mergedUnits) {
        m.set(u.unitId, (newEncodedData) => onSaveData(u.unitId, u.spaceId, newEncodedData));
      }
      return m;
    }, [mergedUnits, onSaveData]);

    // ── True-staging wiring ───────────────────────────────────────────────────
    // Each section reports its staged-path count up; sum drives the footer chip
    // and button enablement.
    const handleStagedCountChange = useCallback((unitId: string, count: number) => {
      setStagedCountByUnit((prev) => {
        if ((prev.get(unitId) ?? 0) === count) return prev;
        const next = new Map(prev);
        if (count === 0) next.delete(unitId);
        else next.set(unitId, count);
        return next;
      });
    }, []);

    // Counted SEPARATELY from handleStagedCountChange (card 8's "N staged" vs
    // "N kept" rule — see ComponentValuesSectionProps.onStagedProtectionChange).
    const handleStagedProtectionCountChange = useCallback((unitId: string, total: number, protectCount: number) => {
      setStagedProtectionCountByUnit((prev) => {
        const existing = prev.get(unitId);
        if (existing && existing.total === total && existing.protectCount === protectCount) return prev;
        const next = new Map(prev);
        if (total === 0) next.delete(unitId);
        else next.set(unitId, { total, protectCount });
        return next;
      });
    }, []);

    // Card 3/6's "N staged · both may be overwritten / both kept on merge"
    // disclosure — see ComponentValuesSectionProps.onStagedEditKeepSummaryChange.
    const handleStagedEditKeepSummaryChange = useCallback((unitId: string, total: number, unkept: number) => {
      setStagedEditKeepSummaryByUnit((prev) => {
        const existing = prev.get(unitId);
        if (existing && existing.total === total && existing.unkept === unkept) return prev;
        const next = new Map(prev);
        if (total === 0) next.delete(unitId);
        else next.set(unitId, { total, unkept });
        return next;
      });
    }, []);


    // Per-unit commit binding (stable refs so the section memo isn't broken).
    const commitStagedByUnit = useMemo(() => {
      if (!onCommitStaged) return null;
      const m = new Map<string, (payload: StagedCommitPayload) => Promise<boolean>>();
      for (const u of mergedUnits) {
        m.set(u.unitId, (payload) => onCommitStaged(u.unitId, u.spaceId, payload));
      }
      return m;
    }, [mergedUnits, onCommitStaged]);

    // Per-unit protection-commit binding — a SEPARATE endpoint/revision from
    // commitStagedByUnit (see Section 9 / ComponentValuesSectionProps.onCommitProtection).
    const commitProtectionByUnit = useMemo(() => {
      if (!onCommitProtection) return null;
      const m = new Map<string, (protection: ResourceProtection[]) => Promise<boolean>>();
      for (const u of mergedUnits) {
        m.set(u.unitId, (protection) => onCommitProtection(u.unitId, u.spaceId, protection));
      }
      return m;
    }, [mergedUnits, onCommitProtection]);

    const totalStaged = useMemo(
      () => [...stagedCountByUnit.values()].reduce((n, c) => n + c, 0),
      [stagedCountByUnit],
    );
    // Counted separately per card 8's rule — a staged protection change is
    // never part of "N staged" (value changes).
    const totalStagedProtection = useMemo(
      () => [...stagedProtectionCountByUnit.values()].reduce((n, { total }) => n + total, 0),
      [stagedProtectionCountByUnit],
    );
    const totalStagedProtectionProtectCount = useMemo(
      () => [...stagedProtectionCountByUnit.values()].reduce((n, { protectCount }) => n + protectCount, 0),
      [stagedProtectionCountByUnit],
    );
    // T / K from card 3 & 6 — of the staged MANUAL edits (never staged
    // upgrade picks), how many total and how many are not yet effectively kept.
    const totalStagedEditsKeepable = useMemo(
      () => [...stagedEditKeepSummaryByUnit.values()].reduce((n, { total }) => n + total, 0),
      [stagedEditKeepSummaryByUnit],
    );
    const totalStagedEditsUnkept = useMemo(
      () => [...stagedEditKeepSummaryByUnit.values()].reduce((n, { unkept }) => n + unkept, 0),
      [stagedEditKeepSummaryByUnit],
    );

    // ── The bar's derived disclosure state (Section 6 / card 8's five rows) ──
    // "one derived label, no new control" — this never adds a control, only
    // chooses which of the existing bar strings/buttons to show. The
    // `extraScope` heuristic (protection entries beyond what the T
    // staged-edited paths could account for) is a best-effort approximation:
    // exact per-path attribution of which staged protection entries came from
    // an edited row vs an independent kebab click would need path-level
    // plumbing across unit boundaries that isn't built, so it's a lower
    // bound, appended to the edits-based lead text rather than replacing it.
    // DEVIATION from card 8's clean five-row table: whenever T > 0 (any
    // manual edit is staged), this ALWAYS prefers the edits-based
    // may-be-overwritten/kept-on-merge framing and its Keep-both/Undo-keep
    // controls — even if an unrelated, independently-staged lock/unlock also
    // exists — rather than collapsing to a plain "N scope changes" lead with
    // no controls. Verified against card 7's own mockup (an edited-and-kept
    // row plus two independent scope changes reads "2 staged · 3 scope
    // changes" there, with no Undo-keep) — this implementation instead reads
    // "1 staged · kept on merge · 2 more scope changes" and keeps Undo-keep
    // available. Chosen deliberately: an unrelated lock elsewhere should
    // never make the staging-level undo for what you JUST did disappear. It
    // only affects the WORDING/affordance choice, never which endpoint(s)
    // actually get called or in what order.
    const barKeepState = useMemo((): {
      kind: 'none' | 'editsUnkept' | 'editsKept' | 'scopeUniform' | 'scopeMixed' | 'valuesAndScope';
      lead?: string;
      keepButtonLabel?: string; // "Keep both on merge" / "Keep N on merge" / "Keep N keys"
      showUndoKeep: boolean;
      showKeepButton: boolean;
    } => {
      const T = totalStagedEditsKeepable;
      const K = totalStagedEditsUnkept;
      if (totalStaged === 0 && totalStagedProtection === 0) {
        return { kind: 'none', showUndoKeep: false, showKeepButton: false };
      }
      if (totalStaged === 0) {
        // Pure scope batch — one endpoint, one revision (card 2d/4b/8 row 3-4).
        const uniform = totalStagedProtectionProtectCount === totalStagedProtection;
        return uniform
          ? {
              kind: 'scopeUniform',
              lead: `${totalStagedProtection} ${totalStagedProtection === 1 ? 'key' : 'keys'} will be kept on merge`,
              keepButtonLabel: `Keep ${totalStagedProtection} ${totalStagedProtection === 1 ? 'key' : 'keys'}`,
              showUndoKeep: false,
              showKeepButton: false, // committed via the relabeled Upgrade-slot button, not a separate stage-only action
            }
          : {
              kind: 'scopeMixed',
              lead: `${totalStagedProtection} scope ${totalStagedProtection === 1 ? 'change' : 'changes'}`,
              keepButtonLabel: `Update ${totalStagedProtection} ${totalStagedProtection === 1 ? 'key' : 'keys'}`,
              showUndoKeep: false,
              showKeepButton: false,
            };
      }
      // Value changes are staged. `extraScope`: staged protection entries
      // beyond what the T edited paths could plausibly account for — a
      // best-effort lower bound (see the approximation note above), appended
      // to the edits-based lead rather than replacing it, so an unrelated
      // independent lock/unlock never hides the Keep-both/Undo-keep controls
      // (card 3's own staging-level actions stay available regardless of
      // what else happens to be staged at the same time).
      const extraScope = Math.max(0, totalStagedProtection - T);
      const extraScopeSuffix = extraScope > 0 ? ` · ${extraScope} more scope ${extraScope === 1 ? 'change' : 'changes'}` : '';
      if (T === 0) {
        if (totalStagedProtection === 0) return { kind: 'none', showUndoKeep: false, showKeepButton: false };
        return {
          kind: 'valuesAndScope',
          lead: `${totalStaged} staged · ${totalStagedProtection} scope ${totalStagedProtection === 1 ? 'change' : 'changes'}`,
          showUndoKeep: false,
          showKeepButton: false,
        };
      }
      if (K === 0) {
        return {
          kind: 'editsKept',
          lead: `${totalStaged} staged · ${T === 2 ? 'both' : T} kept on merge${extraScopeSuffix}`,
          showUndoKeep: true,
          showKeepButton: false,
        };
      }
      return {
        kind: 'editsUnkept',
        lead: `${totalStaged} staged · ${K === 2 && K === T ? 'both' : K} may be overwritten${extraScopeSuffix}`,
        keepButtonLabel: `Keep ${K === 2 && K === T ? 'both' : K} on merge`,
        showUndoKeep: false,
        showKeepButton: true,
      };
    }, [totalStaged, totalStagedProtection, totalStagedProtectionProtectCount, totalStagedEditsKeepable, totalStagedEditsUnkept]);

    // Clear the hover flag whenever the Upgrade button becomes disabled while the
    // cursor may still be over it. A disabled element does not dispatch mouseleave,
    // so clicking Upgrade (enabled→disabled with no enabled frame under a stationary
    // cursor) would otherwise latch `upgradeHovered` true forever — leaving the
    // upgrade-preview dim stuck on the 'all' tab after the upgrade completes. This
    // covers ANY path that disables the button while hovered, not just commit.
    useEffect(() => {
      if (totalStaged === 0 || isUpgrading) setUpgradeHovered(false);
    }, [totalStaged, isUpgrading]);

    // Commit the staged changes (upgrades + manual edits) directly — the Upgrade
    // button runs this with no intermediate review step.
    const handleConfirmCommit = useCallback(() => {
      // Belt-and-suspenders: also clear the hover flag on commit so the disabled
      // button's swallowed mouseleave can never leave the preview dim stuck on.
      setUpgradeHovered(false);
      setRecentlyUpgradedUnitIds((prev) => {
        const next = new Set(prev);
        for (const u of mergedUnits) if (hasRealUpgrade(u)) next.add(u.unitId);
        return next;
      });
      // Dormant units (task #61): each ComponentValuesSection's own
      // commitStagedSignal effect no-ops when its staged set is empty
      // (`if (staged.size === 0 || !onCommitStaged) return;` in that file) —
      // by construction, a dormant unit's staged set IS always empty (there's
      // nothing stageable). The normal signal below can never reach these
      // units, so fire an explicit wholesale upgrade-all commit for each,
      // bypassing the per-unit staging mechanism entirely. This is the SAME
      // onCommitStaged call/payload shape ComponentValuesSection itself sends
      // for a full "everything staged" upgrade, so it hits the identical
      // upgrade:true mutation and correctly participates in the caller's
      // isUpgrading tracking (handleCommitStaged in AppComponentView.tsx).
      if (onCommitStaged) {
        for (const u of dormantUpgradeableUnits) {
          void onCommitStaged(u.unitId, u.spaceId, { kind: 'upgrade-all' });
        }
      }
      setCommitStagedSignal((s) => s + 1);
    }, [mergedUnits, dormantUpgradeableUnits, onCommitStaged]);

    // The dormant revision-gap state (task #61), surfaced IN the panel rather
    // than only through the Upgrade button's tooltip: the component is behind
    // its upstream but the dry run found nothing stageable, so the Incoming
    // list looks empty for no visible reason.
    //
    // Deliberately NOT the Upgrade button's own `isDormantEdgeCase`: that one
    // has no loading guard (correct for the button — it only decides enabled/
    // disabled), so reusing it here would flash the explainer while the dry run
    // is still in flight, since totalUpgradableFields is 0 until it resolves.
    // `isDryRunLoading` is the same signal the Incoming segment's `dormant`
    // dimming uses, so the explainer and the dimmed segment appear together.
    const isDormantRevisionGap =
      totalStaged === 0 &&
      totalUpgradableFields === 0 &&
      !!hasUpgradableUnits &&
      !isUpgrading &&
      !isDryRunLoading;
    const showDormantBanner =
      isDormantRevisionGap && dormantBannerDismissedFor !== selectedDeployment?.deploymentId;

    // Inline unit details mode: render the details pane in place of the overview.
    // The overview's local state remains mounted (we early-return above its JSX
    // but the component stays mounted), so `onBack` restores the prior state.
    if (detailsUnit && onUpdateUnitMeta) {
      return (
        <UnitDetailsPane
          unitId={detailsUnit.unitId}
          spaceId={detailsUnit.spaceId}
          slug={detailsUnit.slug}
          width={width}
          defaultWidth={defaultWidth}
          isResizing={isResizing}
          onWidthChange={onWidthChange}
          onResizeStart={onResizeStart}
          onResizeEnd={onResizeEnd}
          layoutRef={layoutRef}
          onBack={() => setDetailsUnit(null)}
          onClose={() => { setDetailsUnit(null); onClose?.(); }}
          onUpdateUnitMeta={onUpdateUnitMeta}
          onNavigate={(uid, sid, sl) => {
            setDetailsUnit({ unitId: uid, spaceId: sid, slug: sl });
            onFocusDeployment?.(sid);
          }}
        />
      );
    }

    return (
      <PaneContainer
        ref={containerRef}
        data-testid='component-side-pane'
        $width={width}
        $isResizing={isResizing}
        className={showUpgradePreview ? 'pane-upgrade-preview' : undefined}
        sx={{
          // In upgrade-preview mode, tint unchecked non-blocked checkboxes purple
          // and scale them slightly so they read as "ready to check". Blocked rows
          // lose their dim (opacity 1) — the lock-icon shake this used to also
          // trigger was removed with the lock glyph itself (the dashed provenance
          // border now carries that signal).
          '&.pane-upgrade-preview .upgrade-pill:not(.upgrade-pill-blocked) .MuiCheckbox-root': {
            color: componentTheme.upgrade,
            transform: 'scale(1.07)',
          },
          '&.pane-upgrade-preview .upgrade-pill-blocked': {
            opacity: 1,
          },
        }}
      >
        <ResizeHandle
          data-testid='component-side-pane-resize'
          onMouseDown={handleResizeStart}
          onDoubleClick={handleResizeDoubleClick}
        />

        <PaneHeader>
          {headerComponent && (
            <Typography
              component='span'
              data-testid='component-side-pane-component'
              title={headerComponent}
              sx={{
                flexShrink: 1,
                minWidth: 0,
                maxWidth: '45%',
                fontSize: 12,
                fontWeight: 600,
                fontFamily: componentTheme.fontSans,
                color: componentTheme.fgMuted,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                '&::after': { content: '" ›"', color: componentTheme.fgSubtle },
              }}
            >
              {headerComponent}
            </Typography>
          )}
          {filterUrl ? (
            <Link
              href={filterUrl}
              target='_blank'
              rel='noopener noreferrer'
              sx={{
                fontSize: 14,
                fontWeight: 600,
                fontFamily: componentTheme.fontSans,
                color: componentTheme.fgDefault,
                textDecoration: 'underline',
                textDecorationColor: componentTheme.fgMuted,
                textUnderlineOffset: 2,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                '&:hover': { color: 'primary.main', textDecorationColor: 'primary.main' },
              }}
            >
              {selectedDeployment?.displayName ?? 'Component Review'}
            </Link>
          ) : (
            <Typography
              sx={{
                fontSize: 14,
                fontWeight: 600,
                fontFamily: componentTheme.fontSans,
                color: componentTheme.fgDefault,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {selectedDeployment?.displayName ?? 'Component Review'}
            </Typography>
          )}
          {selectedDeployment?.targets.map(({ targetId, label, url }) => {
            return url ? (
              <Tooltip key={targetId} title={`Open ${label}`} placement='top'>
                <Link
                  href={url}
                  target='_blank'
                  rel='noopener noreferrer'
                  sx={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 0.25,
                    textDecoration: 'none',
                    '& > .target-badge': {
                      transition: 'color 0.15s, border-color 0.15s',
                    },
                    '&:hover > .target-badge': {
                      color: 'primary.main',
                      borderColor: 'primary.main',
                    },
                    '& svg': {
                      fontSize: 12,
                      color: componentTheme.fgSubtle,
                      transition: 'color 0.15s',
                    },
                    '&:hover svg': { color: 'primary.main' },
                  }}
                >
                  <TagBadge className='target-badge'>{label}</TagBadge>
                  <OpenInNewIcon />
                </Link>
              </Tooltip>
            ) : (
              <TagBadge key={targetId}>{label}</TagBadge>
            );
          })}
          {/* Single flex wrapper carrying the ONE `ml: 'auto'` for this button
              group (design-mockups/variant-settings/BUILD-PLAN.md commit 1,
              step 2). Previously `ml: 'auto'` lived on the create-variant
              button alone, with close falling back to it when create-variant
              was absent — inserting the cog between them would have broken
              that fallback. BUILD-PLAN is authoritative over VERDICT.md's
              alternative (relocating the per-button `ml`) wherever the two
              disagree. */}
          <Box sx={{ ml: 'auto', display: 'flex', alignItems: 'center', gap: 1 }}>
            {onCreateVariant && selectedDeployment && (
              <Tooltip title='Create variant' placement='top'>
                <IconButton
                  onClick={() => onCreateVariant(selectedDeployment.deploymentId)}
                  size='small'
                  sx={{
                    width: 28,
                    height: 28,
                    border: `1px solid ${componentTheme.borderDefault}`,
                    borderRadius: '50%',
                    color: componentTheme.fgMuted,
                    backgroundColor: componentTheme.bgSubtle,
                    '&:hover': { color: componentTheme.fgDefault, backgroundColor: componentTheme.bgInset },
                  }}
                >
                  <CallSplitIcon sx={{ fontSize: 16 }} />
                </IconButton>
              </Tooltip>
            )}
            {selectedDeployment && (
              <Tooltip title='Space settings' placement='top'>
                <IconButton
                  onClick={() => {
                    // Closing (not opening) while dirty is the silent-loss
                    // route verification caught — apply the same guarantee
                    // the footer already has to this trigger too.
                    if (isSettingsOpen && isSettingsDirty) {
                      if (!window.confirm('Discard unsaved Space settings changes?')) return;
                    }
                    setIsSettingsOpen((v) => !v);
                  }}
                  size='small'
                  data-testid='component-space-settings-cog'
                  sx={{
                    width: 28,
                    height: 28,
                    border: `1px solid ${isSettingsOpen ? 'rgba(186,61,3,.42)' : componentTheme.borderDefault}`,
                    borderRadius: '50%',
                    color: isSettingsOpen ? componentTheme.accent : componentTheme.fgMuted,
                    backgroundColor: isSettingsOpen ? componentTheme.accentMuted : componentTheme.bgSubtle,
                    '&:hover': {
                      color: isSettingsOpen ? componentTheme.accent : componentTheme.fgDefault,
                      backgroundColor: isSettingsOpen ? componentTheme.accentMuted : componentTheme.bgInset,
                    },
                  }}
                >
                  <SettingsIcon sx={{ fontSize: 16 }} />
                </IconButton>
              </Tooltip>
            )}
            {onClose && (
              <IconButton
                onClick={onClose}
                size='small'
                sx={{
                  width: 28,
                  height: 28,
                  border: `1px solid ${componentTheme.borderDefault}`,
                  borderRadius: '50%',
                  color: componentTheme.fgMuted,
                  backgroundColor: componentTheme.bgSubtle,
                  '&:hover': { color: componentTheme.fgDefault, backgroundColor: componentTheme.bgInset },
                }}
              >
                <CloseIcon sx={{ fontSize: 16 }} />
              </IconButton>
            )}
          </Box>
        </PaneHeader>

        {/* Content band: tabs + error card + both PaneContent variants (below)
            PLUS the Space settings sheet all share this box. It — not
            PaneContainer — is the settings sheet's positioned ancestor, so the
            sheet's `position: absolute; inset: 0` covers exactly this band:
            never the header above (fixed, outside this box) and never
            BottomBar below (also outside this box, unconditionally rendered
            after it closes). PaneContent stays a normal mounted flex child
            here at all times — the sheet only sits visually on top of it via
            z-index, which is the whole point (design-mockups/variant-settings/
            BUILD-PLAN.md commit 1, step 1: no early return, ComponentValuesSection
            never unmounts). */}
        {/* `isolation: 'isolate'` establishes a fresh stacking context for this
            band: several treeview rows use their own z-index (up to 20, e.g.
            diffStyles.ts's $plain ReviewRow at 11, the column-resize divider at
            10, ComponentKeyComposer's popover at 20) for THEIR internal
            layering needs. Without isolation those values compete directly
            against the sheet's z-index at the PaneContainer level instead of
            staying scoped to this band, and specific rows visibly punch through
            the sheet. Isolating guarantees the sheet (below) only has to out-
            rank whatever is used inside this band, never anything outside it. */}
        <Box sx={{ position: 'relative', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden', isolation: 'isolate' }}>
        {/* Only a Space with something besides plain config to switch between
            renders a tab bar — release capability.
            A plain Space's pane stays byte-identical to before this feature. */}
        {canRelease && release && (
          <PaneTabs
            value={activeTab}
            onChange={(_, v: 'config' | 'releases') => setActiveTab(v)}
            aria-label='Side pane content'
          >
            <PaneTab label='Configuration' value='config' data-testid='component-pane-tab-config' />
            <PaneTab
              value='releases'
              data-testid='component-pane-tab-releases'
              label={
                <Box sx={{ display: 'flex', alignItems: 'center' }}>
                  Releases
                  {isReleaseFresh && <TabFreshDot data-testid='component-releases-tab-fresh-dot' />}
                </Box>
              }
            />
          </PaneTabs>
        )}

        {/* Pane-wide, not tab-scoped: a Release/Withdraw error (Releases tab
            action) and an Apply/Upgrade error (Configuration tab action)
            must both surface regardless of which tab is currently showing. */}
        {error && (
          <ErrorCard data-testid='component-error-card'>
            <ErrorHeader>
              <ErrorOutlineIcon sx={{ fontSize: 18, color: componentTheme.danger }} />
              <Typography
                sx={{
                  fontSize: 15,
                  fontWeight: 700,
                  fontFamily: componentTheme.fontSans,
                  color: componentTheme.danger,
                  flex: 1,
                }}
              >
                {error.title}
              </Typography>
              <Typography
                sx={{
                  fontSize: 13,
                  fontFamily: componentTheme.fontSans,
                  color: componentTheme.danger,
                  opacity: 0.7,
                  flexShrink: 0,
                }}
              >
                {formatTimeAgo(error.timestamp)}
              </Typography>
            </ErrorHeader>
            <ErrorDetail>{error.detail}</ErrorDetail>
            <Box sx={{ display: 'flex', gap: 1 }}>
              <Button
                size='small'
                onClick={onClearError}
                sx={{
                  textTransform: 'none',
                  fontWeight: 600,
                  fontSize: 14,
                  borderRadius: '6px',
                  color: componentTheme.danger,
                  border: `1px solid ${componentTheme.danger}`,
                  px: 1.5,
                  '&:hover': { backgroundColor: componentTheme.dangerHoverTint },
                }}
              >
                Dismiss
              </Button>
            </Box>
          </ErrorCard>
        )}

        {canRelease && release && activeTab === 'releases' && (
          // The v7 pane is edge-to-edge and draws its own dividers, so the
          // shared PaneContent's padding/gap are zeroed here — it is kept for
          // the scroll container (and the sticky pane head that needs one).
          <PaneContent sx={{ padding: 0, gap: 0 }}>
            <ReleasesPane
              release={release}
              spaceId={selectedDeployment?.deploymentId ?? ''}
              targetName={selectedDeployment?.releaseTargetName}
              releaseUnits={releaseUnits}
              unreleasedResultsByUnit={unreleasedResultsByUnit}
              unreleasedAllResolved={unreleasedAllResolved}
              highlightRelease={highlightRelease}
              onHighlightConsumed={handleHighlightConsumed}
              selection={effectiveReleaseSelection}
              selectionPending={releaseSelectionPending}
              onSelectionChange={setReleaseSelection}
            />
          </PaneContent>
        )}

        {activeTab === 'config' && selectedDeployment && (
          <CompareColumnDnd
            order={compareSelection}
            labels={compareLabelById}
            onReorder={handleCompareSelectionChange}
          >
            {compareOptions.length > 1 && (
              <CompareCollapsible storageKey={CONFIG_COMPARE_COLLAPSED_KEY} testId='component-compare'>
                <DeploymentSelectors
                  options={compareOptions}
                  selection={compareSelection}
                  onSelectionChange={handleCompareSelectionChange}
                />
              </CompareCollapsible>
            )}

            {isComparing && (
              <ComponentCompareSection
                units={compareUnitsWithProtection}
                deploymentCount={compareSelection.length}
                onCommitStaged={onCommitStaged}
              />
            )}
          </CompareColumnDnd>
        )}

        {activeTab === 'config' && !isComparing && (
        <>
        <ComponentToolbar
          testIdPrefix="component"
          filterText={filterText}
          onFilterTextChange={setFilterText}
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          filterMode={filterMode}
          onFilterModeChange={(next) => { setFilterModeWithStaging(next); setScopeFilter(null); }}
          totalUpgradableFields={totalUpgradableFields}
          isDryRunLoading={isDryRunLoading}
          hasUpgradableUnits={hasUpgradableUnits}
          totalAllFields={totalAllFields}
          allFieldsPartial={allFieldsPartial}
          scopeFilter={scopeFilter}
          onScopeFilterChange={setScopeFilter}
          totalLocalOverrides={totalLocalOverrides}
          totalLocalOnly={totalLocalOnly}
          totalCheckableM={totalCheckableM}
          totalKeptOnMergeN={totalKeptOnMergeN}
          totalLiveL={totalLiveL}
          hasProtectionData={hasProtectionData}
        />

        {/* Kept-on-merge flatnote — page-specific explanatory text for the
            flattened scope view, not a toolbar control, so it stays here
            rather than moving into the shared ComponentToolbar. */}
        {scopeFilter === 'kept-on-merge' && (
          <Box
            data-testid='component-kept-on-merge-flatnote'
            sx={{
              px: '10px', py: '5px',
              fontFamily: componentTheme.fontSans, fontSize: 11,
              color: componentTheme.fgSubtle,
              background: componentTheme.bgSubtle,
              borderBottom: `1px solid ${componentTheme.borderSubtle}`,
            }}
          >
            Set here and kept on merge. A merge from base will not change these.
          </Box>
        )}

        {/* `component-values-list` is pure instrumentation: it gives the guided
            tour a stable handle for "the Configuration view" as a whole. Its
            only alternative, `component-leaf-row`, is stamped per row, so a
            tour anchor resolved to whichever row happened to match first
            (`apiVersion`) while the copy described the entire view. */}
        <PaneContent data-testid='component-values-list'>
          {showDormantBanner && (
            <Box
              data-testid='dormant-upgrade-banner'
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
                // Faint upgrade tint (not borderMuted) so the explainer reads as
                // belonging to the Upgrade action rather than as a warning.
                border: `1px solid ${componentTheme.upgradeEdge}`,
                background: componentTheme.bgSubtle,
                fontSize: 11,
                fontFamily: componentTheme.fontSans,
                color: componentTheme.fgMuted,
              }}
            >
              <Box component='span' sx={{ flexShrink: 0, color: componentTheme.upgrade, opacity: 0.8, lineHeight: 1 }}>
                <svg viewBox='0 0 14 14' fill='none' stroke='currentColor' strokeWidth='1.5' style={{ width: 12, height: 12, display: 'block' }}>
                  <circle cx='7' cy='7' r='5.5' />
                  <line x1='7' y1='5' x2='7' y2='7.5' />
                  <circle cx='7' cy='9.5' r='0.6' fill='currentColor' stroke='none' />
                </svg>
              </Box>
              <Box component='span' sx={{ flex: 1, lineHeight: 1.4 }}>
                The upstream changes don&apos;t touch this component&apos;s fields. Upgrading only brings the revision in line &mdash; your config won&apos;t change.
              </Box>
              <Box
                component='button'
                onClick={() => setDormantBannerDismissedFor(selectedDeployment?.deploymentId ?? null)}
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
                aria-label='Dismiss'
              >
                <svg viewBox='0 0 12 12' fill='none' stroke='currentColor' strokeWidth='1.8' style={{ width: 11, height: 11 }}>
                  <line x1='2' y1='2' x2='10' y2='10' />
                  <line x1='10' y1='2' x2='2' y2='10' />
                </svg>
              </Box>
            </Box>
          )}
          {filteredUnits.length === 0 && filterText && (
            <Box
              sx={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                py: 6,
                px: 3,
                gap: 1,
              }}
            >
              <SearchIcon sx={{ fontSize: 32, color: componentTheme.fgSubtle, opacity: 0.5 }} />
              <Typography
                sx={{
                  fontSize: 13,
                  fontFamily: componentTheme.fontSans,
                  color: componentTheme.fgMuted,
                }}
              >
                No results for &ldquo;{filterText}&rdquo;
              </Typography>
            </Box>
          )}
          {filteredUnits.map((unit) => {
            const upgradeLoading = unit.isUpgradeLoading && !unit.upgradeEntry;
            const unitKey = unit.unitId;
            const isUnitExpanded = isUnitExpandedInPane(unit, expansionState);
            const revisionLabel = unit.upgradeEntry
              ? `r${unit.upgradeEntry.upstreamRevisionNum}→r${unit.upgradeEntry.upstreamHeadRevisionNum}`
              : unit.applyEntry
                ? `r${unit.applyEntry.appliedRevision}→r${unit.applyEntry.headRevision}`
                : null;
            // A unit is "changed" by an upgrade if at least one upstream field
            // would ACTUALLY upgrade — including brand-new paths. Only paths the
            // unit overrides with a local value set are excluded. A unit whose
            // every available upgrade is blocked by a local override is treated
            // as unchanged and dimmed while the Upgrade button is hovered, to
            // preview the real upgrade scope. Units still computing their
            // upgrade stay "changed" (not dimmed). A just-upgraded unit also stays
            // un-dimmed so its accepted rows clearly read as upgraded.
            const isUpgradeChanged =
              unit.isUpgradeLoading || hasRealUpgrade(unit) || recentlyUpgradedUnitIds.has(unitKey);

            // Is THIS unit showing source while the pane shows trees?
            //
            // `isUnitGated` is re-evaluated here rather than trusting the Set
            // alone, and that is the safety property, not belt-and-braces: it
            // makes the override structurally incapable of applying to a
            // MATERIALIZED unit. A materialized unit has a mounted
            // ComponentValuesSection holding staged manual edits in its own
            // state, and components.md rule 9 requires those to survive
            // everything except an explicit Discard or a commit. Because this
            // implies `isUnitGated`, the ComponentValuesSection branch below is
            // left byte-for-byte unchanged and cannot be reached differently on
            // account of this state — no unmount, no lost edits. (A gated unit
            // has no mounted section to lose in the first place: its body is
            // the placeholder card.)
            //
            // Also gated on the pane being in 'diff': when the pane toggle is
            // on Source everything is already source, so the per-unit override
            // is dormant rather than double-applied — and it is remembered, so
            // toggling the pane back to Tree restores exactly what was on
            // screen before.
            const isSourceOverridden =
              viewMode === 'diff' &&
              isUnitGated(unit, materializedUnitIds) &&
              sourceOverrideUnitIds.has(unitKey);

            return (
              <UnitRow
                key={unit.unitId}
                // The source view is always rendered fully opaque, so we only
                // tag unchanged units with the dim class in diff view. The
                // upgrade-preview dim (.pane-upgrade-preview .unit-unchanged)
                // therefore never affects the source view.
                className={viewMode !== 'source' && !isUpgradeChanged ? 'unit-unchanged' : undefined}
              >
                <UnitHeaderRow
                  onClick={() => {
                    // A click has to reconcile BOTH sets to invert the effective
                    // state, because each one alone can only move it in a single
                    // direction: `forcedExpandedGroups` is the only thing that
                    // opens a unit no rule opens by itself, and `collapsedGroups`
                    // is the only thing that closes a unit the incoming-upgrade
                    // or just-upgraded rule opens. Flipping one would leave the
                    // other pinning the row, so a click on some units would do
                    // nothing.
                    if (isUnitExpanded) {
                      // Collapse: force-collapse via the override and drop any
                      // forced-expand so it can't immediately re-open.
                      setCollapsedGroups((prev) => setSetMember(prev, unitKey, true));
                      setForcedExpandedGroups((prev) => setSetMember(prev, unitKey, false));
                    } else {
                      // Expand: clear the collapse override and add the
                      // forced-expand, which is the expand path for any unit the
                      // pane wouldn't have opened on its own.
                      setCollapsedGroups((prev) => setSetMember(prev, unitKey, false));
                      setForcedExpandedGroups((prev) => setSetMember(prev, unitKey, true));
                    }
                  }}
                >
                  <ChevronIcon $expanded={isUnitExpanded}>
                    <ChevronRightIcon />
                  </ChevronIcon>
                  <DataObjectIcon
                    sx={{ fontSize: 15, color: componentTheme.fgMuted, flexShrink: 0 }}
                  />
                  <UnitSlug
                    href={`/units/${unit.spaceId}/${unit.unitId}`}
                    // Keep the real href so middle-click / cmd-click / context
                    // menu still open the full unit page in a new tab and for
                    // accessibility. A plain left-click is intercepted to open
                    // the inline details pane instead.
                    target='_blank'
                    rel='noopener noreferrer'
                    onClick={(e: React.MouseEvent) => {
                      e.stopPropagation();
                      // Let the browser handle modified clicks (new tab) and
                      // non-primary buttons; only intercept a plain left-click.
                      // Also bail out if the inline details pane can't render
                      // (onUpdateUnitMeta absent) so the link stays functional.
                      if (!onUpdateUnitMeta || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) {
                        return;
                      }
                      e.preventDefault();
                      setDetailsUnit({ unitId: unit.unitId, spaceId: unit.spaceId, slug: unit.slug });
                    }}
                  >
                    {filterText ? highlightText(unit.slug, filterText) : unit.slug}
                  </UnitSlug>
                  {/* Size chip — explains slowness before the user has to ask,
                      and survives after the tree renders as the standing
                      explanation. A SIZE, never a change count: a per-unit-row
                      "N changes" counter was removed and must not come back
                      (components.md, Rejected approaches). */}
                  {shouldShowUnitSizeChip(unit.data) && (
                    <UnitSizeChip
                      data={unit.data}
                      held={isUnitGated(unit, materializedUnitIds)}
                    />
                  )}
                  {upgradeLoading && (
                    <CircularProgress
                      size={12}
                      sx={{ color: componentTheme.upgrade, flexShrink: 0 }}
                    />
                  )}
                  <Fade
                    in={!!unit.applyEntry?.isGated}
                    timeout={300}
                    unmountOnExit
                  >
                    <Tooltip
                      title={unit.applyEntry?.gateKeys.join(', ') ?? ''}
                      placement='left'
                      arrow
                    >
                      <GateBadge
                        label={
                          unit.validationErrors?.['awaiting/triggers'] ? (
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                              Gated
                              <CircularProgress
                                size={10}
                                sx={{ color: componentTheme.attention }}
                              />
                            </Box>
                          ) : (
                            'Gated'
                          )
                        }
                        size='small'
                      />
                    </Tooltip>
                  </Fade>
                  <Box sx={{ display: 'flex', gap: '8px', alignItems: 'center', ml: 'auto' }}>
                    {revisionLabel && (
                      <Typography
                        sx={{
                          fontSize: 10,
                          fontWeight: 500,
                          fontFamily: componentTheme.fontMono,
                          color: componentTheme.fgSubtle,
                          flexShrink: 0,
                        }}
                      >
                        {revisionLabel}
                      </Typography>
                    )}
                  </Box>
                </UnitHeaderRow>
                {isUnitExpanded && (
                  <>
                    {upgradeLoading && (
                      <Box
                        sx={{
                          px: 2,
                          py: 1.5,
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 0.75,
                        }}
                      >
                        <Skeleton
                          variant='rounded'
                          width={80}
                          height={14}
                          sx={{ bgcolor: componentTheme.upgradeSkeleton, borderRadius: '4px' }}
                        />
                        <Skeleton
                          variant='rounded'
                          height={26}
                          sx={{ bgcolor: componentTheme.upgradeSkeletonQuiet, borderRadius: '4px' }}
                        />
                        <Skeleton
                          variant='rounded'
                          height={26}
                          sx={{ bgcolor: componentTheme.upgradeSkeletonQuiet, borderRadius: '4px' }}
                        />
                      </Box>
                    )}
                    {/* ── Oversized-unit gate ────────────────────────────────
                        Sits OUTSIDE ComponentValuesSection on purpose: the gate
                        only ever sees `unit.data`, a configuration STRING, and a gated
                        unit's section is never mounted, so no decode, no YAML
                        parse and no tree build happen for it at all. Gating from
                        inside the section would mean the section had already
                        been handed the payload and run its memos.

                        Per-unit because expansion is not a one-row-at-a-time
                        affair: an auto-expand rule (incoming upgrades, a scope
                        filter, a just-committed upgrade) can open several units
                        at once, and clicks accumulate open rows. The cost of a
                        parse is paid per unit, so the gate has to be decided per
                        unit too — a single 5MB payload among ten open rows would
                        otherwise stall the whole pane. */}
                    {!upgradeLoading && viewMode === 'diff' && isUnitGated(unit, materializedUnitIds) && !isSourceOverridden && (
                      isMaterializing && materializingUnitId === unit.unitId ? (
                        <HeavyUnitLoading narrate />
                      ) : (
                        <HeavyUnitGate
                          data={unit.data}
                          slug={unit.slug}
                          toolchainType={unit.toolchainType}
                          onRenderAnyway={() => handleRenderAnyway(unit.unitId)}
                          onOpenInSource={() => handleOpenInSource(unit.unitId)}
                        />
                      )
                    )}
                    {!upgradeLoading && viewMode === 'diff' && !isUnitGated(unit, materializedUnitIds) && (
                      // A large-but-allowed unit shows skeleton rows for the one
                      // high-priority render before the deferred key catches up,
                      // so the pane's chrome paints without waiting on its tree.
                      // Small units skip this entirely — see shouldDeferUnitPaint.
                      isHeavyPaintPending && shouldDeferUnitPaint(unit.data) ? (
                        <HeavyUnitLoading />
                      ) : (
                      <ComponentValuesSection
                        key={unit.unitId}
                        unit={unit}
                        filterText={filterText}
                        filterMode={filterMode === 'incoming' ? 'upgradable' : 'all'}
                        scopeFilter={filterMode === 'all' ? scopeFilter : null}
                        valueOverlay={fieldOverlay?.get(unit.unitId)}
                        onSetFieldValue={setFieldValueByUnit?.get(unit.unitId)}
                        onDeleteFieldValue={deleteFieldValueByUnit?.get(unit.unitId)}
                        deployments={deployments}
                        unitsByDeployment={unitsByDeployment}
                        onStagedCountChange={handleStagedCountChange}
                        commitStagedSignal={commitStagedSignal}
                        clearStagedSignal={clearStagedSignal}
                        discardAllSignal={discardAllSignal}
                        stageAllSignal={stageAllSignal}
                        keepStagedEditsSignal={keepStagedEditsSignal}
                        undoKeepStagedEditsSignal={undoKeepStagedEditsSignal}
                        onCommitStaged={commitStagedByUnit?.get(unit.unitId)}
                        onCommitProtection={commitProtectionByUnit?.get(unit.unitId)}
                        isProtected={isProtectedByUnit.get(unit.unitId)}
                        onRequestProtectionData={requestProtectionDataByUnit.get(unit.unitId)}
                        onStagedProtectionChange={handleStagedProtectionCountChange}
                        onStagedEditKeepSummaryChange={handleStagedEditKeepSummaryChange}
                        stopKeepingAllSignal={stopKeepingAllSignal}
                      />
                      )
                    )}
                    {/* Source view: for the whole pane, or for this one
                        oversized unit the user asked to read. The override
                        carries its own "back to tree view" strip so the action
                        is never a one-way door — the pane toggle still says
                        Tree, and without a way back that reads as a bug. */}
                    {!upgradeLoading && (viewMode === 'source' || isSourceOverridden) && (
                      <>
                        {isSourceOverridden && (
                          <UnitSourceOverrideBar
                            onBackToTree={() => handleBackToTree(unit.unitId)}
                          />
                        )}
                        <Suspense fallback={<CodeEditorFallback />}>
                          <ComponentSourceSection
                            data={unit.data}
                            toolchainType={unit.toolchainType}
                            filterText={filterText}
                            onSaveData={saveDataByUnit?.get(unit.unitId)}
                          />
                        </Suspense>
                      </>
                    )}
                  </>
                )}
              </UnitRow>
            );
          })}
        </PaneContent>
        </>
        )}

        {isSettingsOpen && selectedDeployment && (
          <SpaceSettingsSheet
            ref={settingsSheetRef}
            key={selectedDeployment.deploymentId}
            spaceId={selectedDeployment.deploymentId}
            slug={selectedDeployment.slug}
            unitCount={selectedDeployment.unitCount}
            targets={targets}
            onFooterStateChange={setSheetFooterState}
            onClose={() => setIsSettingsOpen(false)}
            // Deleted variant: close the settings sheet AND clear the pane's
            // selection (BUILD-PLAN step 23) — reuses the same `onClose` the
            // header's own close button uses, since that already empties
            // `selectedDeploymentIds` in AppComponentView (`handleClose`).
            onDeleted={() => {
              setIsSettingsOpen(false);
              // Clear dirty state SYNCHRONOUSLY (both locally and in the
              // parent, not via the async onDirtyChange effect below, which
              // wouldn't have fired yet by the time onClose() runs in this
              // same tick) — the Space is already gone, so any staged draft
              // is moot and must not trigger AppComponentView's "discard
              // unsaved changes?" guard on the onClose() call right after.
              setIsSettingsDirty(false);
              onSettingsDirtyChange?.(false);
              onClose?.();
            }}
            onDirtyChange={setIsSettingsDirty}
          />
        )}
        </Box>

        <BottomBar>
          {isSettingsOpen ? (
            <>
              {/* ONE footer, contextual contents (task #34): while the Space
                  settings sheet is open, this BottomBar shows ITS Save/Discard
                  instead of Upgrade/Release — never both, never stacked. The
                  buttons below call the sheet's own `save`/`discardOrClose`
                  via `settingsSheetRef`; they own no staging logic here. The
                  sheet's OWN drafts (`draftLabels`/`releaseTargetDraft`/etc.)
                  are a completely separate state tree from the treeview's
                  staged edits below (`totalStaged`/`discardAllSignal`) — this
                  branch and the treeview's Discard button are mutually
                  exclusive in the DOM, so a Discard click can never touch the
                  wrong one. */}
              {sheetFooterState.isDirty && (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.875, mr: 'auto' }}>
                  <Box sx={{ width: 6, height: 6, borderRadius: '50%', background: componentTheme.accent }} />
                  <Typography sx={{ fontSize: 12, fontWeight: 600, fontFamily: componentTheme.fontSans, color: componentTheme.accent }}>
                    {sheetFooterState.dirtyCount} unsaved change{sheetFooterState.dirtyCount === 1 ? '' : 's'}
                  </Typography>
                </Box>
              )}
              {sheetFooterState.saveError && (
                <Typography
                  sx={{
                    fontSize: 12,
                    fontWeight: 600,
                    fontFamily: componentTheme.fontSans,
                    color: componentTheme.danger,
                    mr: sheetFooterState.isDirty ? 0 : 'auto',
                  }}
                >
                  {sheetFooterState.saveError}
                </Typography>
              )}
              <Button
                data-testid='space-settings-discard'
                variant='text'
                size='small'
                disabled={sheetFooterState.isSaving}
                onClick={() => settingsSheetRef.current?.discardOrClose()}
                sx={bottomBarTextButtonSx}
              >
                {sheetFooterState.isDirty ? 'Discard' : 'Close'}
              </Button>
              <Button
                data-testid='space-settings-save'
                variant='contained'
                size='small'
                disabled={!sheetFooterState.isDirty || sheetFooterState.isSaving}
                onClick={() => settingsSheetRef.current?.save()}
                sx={bottomBarPrimaryButtonSx}
              >
                {sheetFooterState.isSaving ? <CircularProgress size={14} sx={{ color: 'inherit' }} /> : 'Save'}
              </Button>
            </>
          ) : (
            <>
          {successMessage && (
            <Box
              data-testid="component-action-success"
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 0.5,
                mr: 'auto',
                animation: 'fadeIn 0.2s ease-out',
                '@keyframes fadeIn': {
                  from: { opacity: 0, transform: 'translateX(-4px)' },
                  to: { opacity: 1, transform: 'translateX(0)' },
                },
              }}
            >
              <CheckCircleOutlineIcon sx={{ fontSize: 17, color: componentTheme.success }} />
              <Typography
                sx={{
                  fontSize: 14,
                  fontWeight: 600,
                  fontFamily: componentTheme.fontSans,
                  color: componentTheme.success,
                }}
              >
                {successMessage}
              </Typography>
            </Box>
          )}
          {/* Section 7/card 4b: the flattened "Kept on merge" view's OWN
              dedicated bar — "N kept in this component" / "Stop keeping N
              keys" — REPLACES the normal staged-commit controls while nothing
              is staged yet (the moment something IS staged, e.g. by clicking
              this very button, totalStagedProtection > 0 and the normal bar's
              Section-6 "scope changes" state takes back over, which is where
              the actual commit happens — this button only stages). */}
          {scopeFilter === 'kept-on-merge' && totalStagedProtection === 0 && totalKeptOnMergeN > 0 && activeTab !== 'releases' && (
            <>
              <Typography
                data-testid='component-kept-on-merge-bar-lead'
                sx={{ fontSize: 12, fontWeight: 600, fontFamily: componentTheme.fontSans, color: componentTheme.fgMuted, mr: 'auto' }}
              >
                {totalKeptOnMergeN} kept in this component
              </Typography>
              <Button
                data-testid='component-stop-keeping-button'
                variant='text'
                size='small'
                disabled={isUpgrading}
                onClick={() => setStopKeepingAllSignal((s) => s + 1)}
                sx={bottomBarTextButtonSx}
              >
                {`Stop keeping ${totalKeptOnMergeN} ${totalKeptOnMergeN === 1 ? 'key' : 'keys'}`}
              </Button>
            </>
          )}
          {/* The staged-commit controls show when the deployment can upgrade OR
              whenever ANY change is staged (sticky manual edits can exist even on
              a root deployment with no upstream) — AND only on the Configuration
              tab (task #56): these are config-scoped actions, same principle as
              #52 scoping Release to the Releases tab. A Space with no tab bar
              at all is always 'config' — unaffected. */}
          {!(scopeFilter === 'kept-on-merge' && totalStagedProtection === 0 && totalKeptOnMergeN > 0)
            && (canUpgrade || totalStaged > 0 || totalStagedProtection > 0) && activeTab === 'config'
            // The comparison is a read-only surface. Nothing on it stages
            // anything, so an Upgrade bar under it would be offering to commit
            // changes the user cannot see and did not make here.
            && !isComparing && (
            <>
              {/* Section 6 lead line (card 3 & 8) — "no new control, one derived
                  label": states which staged edits will be overwritten vs kept
                  on the next merge, or names a pure scope batch. Warn colour
                  (accent) for "may be overwritten"/mixed-scope; muted for the
                  reassuring "kept on merge" state. */}
              {!successMessage && barKeepState.lead && (
                <Typography
                  data-testid='component-bar-keep-lead'
                  sx={{
                    fontSize: 12,
                    fontWeight: 600,
                    fontFamily: componentTheme.fontSans,
                    color: barKeepState.kind === 'editsUnkept' ? componentTheme.accent : componentTheme.fgMuted,
                    mr: 'auto',
                  }}
                >
                  {barKeepState.lead}
                </Typography>
              )}
              {/* Select all — STAGES every available upgrade (does not commit).
                  Only meaningful on the Incoming tab: staging is auto-cleared
                  when leaving 'incoming' (setFilterModeWithStaging), so the
                  button is inert on 'all' — gate it to that tab. */}
              {filterMode === 'incoming' && totalUpgradableFields > 0 && totalStaged < totalUpgradableFields && (
                <Button
                  data-testid='component-select-all-button'
                  variant='text'
                  size='small'
                  disabled={isUpgrading}
                  onClick={() => setStageAllSignal((s) => s + 1)}
                  sx={{
                    textTransform: 'none',
                    fontWeight: 600,
                    fontSize: 13,
                    borderRadius: `${componentTheme.radiusMd}px`,
                    color: componentTheme.done,
                    px: 1,
                    '&:hover': { backgroundColor: componentTheme.doneMuted },
                  }}
                >
                  {`Select all (${totalUpgradableFields})`}
                </Button>
              )}
              {/* Keep both on merge — STAGES a protect for every currently
                  staged-edited-but-not-yet-kept path (card 3b). Does not
                  write; the same commit button/two-call ordering handles it. */}
              {barKeepState.showKeepButton && (
                <Button
                  data-testid='component-keep-staged-edits-button'
                  variant='text'
                  size='small'
                  disabled={isUpgrading}
                  onClick={() => setKeepStagedEditsSignal((s) => s + 1)}
                  sx={{
                    textTransform: 'none',
                    fontWeight: 600,
                    fontSize: 13,
                    borderRadius: `${componentTheme.radiusMd}px`,
                    color: componentTheme.accent,
                    px: 1,
                    '&:hover': { backgroundColor: '#fdf2ec' },
                  }}
                >
                  {barKeepState.keepButtonLabel}
                </Button>
              )}
              {/* Undo keep — a STAGING-level undo of the click above (or an
                  individual kebab protect on an edited row), not a second
                  full-width verb. Dies when the set commits or is discarded;
                  the durable reverse ("Let merges update this") lives on the
                  row's own kebab. */}
              {barKeepState.showUndoKeep && (
                <Button
                  data-testid='component-undo-keep-button'
                  variant='text'
                  size='small'
                  disabled={isUpgrading}
                  onClick={() => setUndoKeepStagedEditsSignal((s) => s + 1)}
                  sx={bottomBarTextButtonSx}
                >
                  Undo keep
                </Button>
              )}
              {/* Discard — clears the staged set without committing. */}
              {(totalStaged > 0 || totalStagedProtection > 0) && (
                <Button
                  data-testid='component-discard-staged-button'
                  variant='text'
                  size='small'
                  disabled={isUpgrading}
                  onClick={() => setDiscardAllSignal((s) => s + 1)}
                  sx={bottomBarTextButtonSx}
                >
                  Discard
                </Button>
              )}
              {/* task #61: a unit can have a REAL revision gap (hasUpgradableUnits)
                  with literally nothing stageable (totalUpgradableFields === 0 —
                  the upstream's new revision is either byte-identical in content
                  or every diffed path is blocked by a local override). Staging
                  can never produce totalStaged > 0 in that state, so the button
                  must ALSO enable there — otherwise a genuine revision gap could
                  never be resolved. This does NOT loosen the normal case: when
                  there ARE upgradable fields simply not yet staged
                  (totalUpgradableFields > 0 && totalStaged === 0), the button
                  stays disabled exactly as before. */}
              {(() => {
                const isDormantEdgeCase =
                  totalStaged === 0 && totalUpgradableFields === 0 && !!hasUpgradableUnits && !isUpgrading;
                return (
                  <Tooltip
                    title={isDormantEdgeCase ? 'No fields to stage, but the revision is behind — this brings the revisions in line.' : ''}
                    placement='top'
                  >
                    <span>
                      <Button
                        data-testid='component-upgrade-button'
                        variant='contained'
                        size='small'
                        disabled={isUpgrading || (totalStaged === 0 && totalStagedProtection === 0 && !(totalUpgradableFields === 0 && hasUpgradableUnits))}
                        onClick={() => {
                          // Commit all staged changes immediately — no review step.
                          handleConfirmCommit();
                        }}
                        onMouseEnter={() => setUpgradeHovered(true)}
                        onMouseLeave={() => setUpgradeHovered(false)}
                        sx={bottomBarPrimaryButtonSx}
                      >
                        {isUpgrading ? (
                          <CircularProgress size={14} sx={{ color: 'inherit' }} />
                        ) : barKeepState.kind === 'scopeUniform' || barKeepState.kind === 'scopeMixed' ? (
                          // Pure scope batch (card 8 rows 3-4): the button's own
                          // label already carries the count — one endpoint call,
                          // one revision, no separate "Upgrade" verb and no badge.
                          barKeepState.keepButtonLabel
                        ) : (
                          'Upgrade'
                        )}
                        {/* Badge count — omitted for the pure-scope states above
                            (their label already carries the number). Otherwise
                            prefers the value-staged count, falling back to the
                            protection count for a protection-only batch, so the
                            button never shows a misleading "0" while enabled. */}
                        {barKeepState.kind !== 'scopeUniform' && barKeepState.kind !== 'scopeMixed' && (
                          <Chip
                            label={totalStaged > 0 ? totalStaged : totalStagedProtection}
                            size='small'
                            sx={{
                              height: 16,
                              minWidth: 16,
                              fontSize: 11,
                              fontWeight: 700,
                              backgroundColor: 'rgba(255,255,255,0.25)',
                              color: 'inherit',
                              '.MuiChip-label': { px: 0.5 },
                            }}
                          />
                        )}
                      </Button>
                    </span>
                  </Tooltip>
                );
              })()}
            </>
          )}
          {/* Release only occupies the deploy-verb slot while the Releases
              tab is active (task #52) — on the Configuration tab the slot
              is intentionally empty. (The Apply fallback that used to live
              here was removed upstream — canUpgrade now covers that case.) */}
          {/* The action row appears only while UNRELEASED WORK IS ON SCREEN.
              With none there is nothing to release and no way back to offer, so
              the row is absent rather than empty — an empty action bar
              advertises a capability that does not exist in that state. */}
          {canRelease && release && activeTab === 'releases' && showsUnreleased && (
              // The mockup's `.act` row, rendered in the footer that already
              // exists rather than as a second sticky bar: [name][⌄][Release].
              <Box sx={{ display: 'flex', alignItems: 'center', gap: '7px', flex: '1 1 auto', minWidth: 0, position: 'relative' }}>
                {/* PLACEHOLDER, not a pre-filled value — a deliberate
                    one-attribute deviation from the mockup. Pre-filling
                    `rel-N+1` would send a name on EVERY publish, which
                    creates a Tag every time and turns every release into a
                    "named" one. An empty field still publishes unnamed,
                    exactly as before. */}
                <NameInput
                  size='small'
                  placeholder={`rel-${(release.latestRelease?.Release?.ReleaseNum ?? 0) + 1}`}
                  value={releaseName}
                  onChange={(e) => setReleaseName(e.target.value)}
                  disabled={release.isReleasing}
                  slotProps={{ htmlInput: { 'aria-label': 'New release name' } }}
                  data-testid='component-release-name-input'
                />
                <ReleaseNameToggle
                  type='button'
                  $expanded={isNamingExpanded}
                  aria-expanded={isNamingExpanded}
                  aria-label='Release notes'
                  disabled={release.isReleasing}
                  onClick={() => setIsNamingExpanded((v) => !v)}
                  data-testid='component-release-name-toggle'
                >
                  <ChevronIcon $expanded={isNamingExpanded}>
                    <ChevronRightIcon />
                  </ChevronIcon>
                  Notes
                </ReleaseNameToggle>
                {/* Opens ABOVE the footer rather than growing it — BottomBar
                    is a fixed-height row shared with the Configuration tab. */}
                {isNamingExpanded && (
                  <ReleaseNameFields>
                    <TextField
                      size='small'
                      placeholder='Notes (optional)'
                      value={releaseNotes}
                      onChange={(e) => setReleaseNotes(e.target.value)}
                      disabled={release.isReleasing}
                      multiline
                      minRows={2}
                      maxRows={6}
                      data-testid='component-release-notes-input'
                    />
                  </ReleaseNameFields>
                )}
                <PaneButton
                  data-testid='component-release-button'
                  $tone='go'
                  disabled={release.isReleasing}
                  onClick={() => {
                    // Optimistic reset (plan 002): the name/notes are "consumed"
                    // into the Tag being created the instant this fires — collapse
                    // and clear immediately rather than waiting to learn whether
                    // the publish succeeds, so a later unnamed publish never
                    // silently reuses a stale name.
                    const name = releaseName;
                    const notes = releaseNotes;
                    setIsNamingExpanded(false);
                    setReleaseName('');
                    setReleaseNotes('');
                    release.onRelease({ name, notes });
                  }}
                >
                  {release.isReleasing ? <CircularProgress size={14} sx={{ color: 'inherit' }} /> : 'Release'}
                  {/* task #69: unlike Apply/Upgrade's chips (which always show,
                      even "0", since those actions are inherently partial/
                      selectable), Release stays chip-less until we have a real,
                      fully-resolved, non-zero count — publish is atomic (RULE
                      the fidelity review already established for this button),
                      so a "0" chip here would misleadingly suggest a partial
                      action, and a chip that pops in in the middle of loading
                      would flicker. */}
                  {unreleasedAllResolved && totalUnreleasedFields > 0 && (
                    <Chip
                      label={totalUnreleasedFields}
                      size='small'
                      data-testid='component-release-changes-chip'
                      sx={{
                        height: 16,
                        minWidth: 16,
                        fontSize: 11,
                        fontWeight: 700,
                        backgroundColor: 'rgba(255,255,255,0.25)',
                        color: 'inherit',
                        '.MuiChip-label': { px: 0.5 },
                      }}
                    />
                  )}
                </PaneButton>
              </Box>
          )}
            </>
          )}
        </BottomBar>
      </PaneContainer>
    );
  },
);

ComponentSidePane.displayName = 'ComponentSidePane';
