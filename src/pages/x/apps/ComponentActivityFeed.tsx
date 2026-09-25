// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';

import { useUserInfo } from '@/components/authenticated-context/AuthenticatedContext';
import { buildUnitDiff } from '@/components/invoker/utils/diff-from-revisions';
import {
  type ExtendedRevisionRead,
  type ExtendedSpaceRead,
  type RevisionRead,
  useListAllRevisionsQuery,
  useListExtendedRevisionsQuery,
  useListSpacesQuery,
} from '@confighub/rtk-query';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import SmartToyOutlinedIcon from '@mui/icons-material/SmartToyOutlined';
import Avatar from '@mui/material/Avatar';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import Collapse from '@mui/material/Collapse';
import Link from '@mui/material/Link';
import Skeleton from '@mui/material/Skeleton';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import Typography from '@mui/material/Typography';
import { alpha, keyframes, useTheme, type Theme } from '@mui/material/styles';

import { formatShortTimestamp } from '@/components/invoker/utils/date-format.utils';
import { spaceComponentSlug, useComponentSlugs } from '@/hooks/useComponentSlugs';
import { useInViewport } from '@/hooks/useInViewport';

import {
  countEntriesByTab,
  filterEntriesByTab,
  MAX_FEED_ENTRIES,
  type ActivityFeedTab,
  type FeedEntry,
} from './activityFeedEntries';
import { AUTOMATED_USER_ID, ROUTE_COMPONENTS } from './appTypes';
import { TreeDiffSection } from './TreeDiffSection';
import { useColumnResize } from './useColumnResize';
import { useRevisionDataMap } from '@/hooks/useUnitData';

// ============================================================================
// CONSTANTS
// ============================================================================

/**
 * IntersectionObserver rootMargin used to lazily trigger predecessor-revision
 * prefetching for feed rows. Positive margin starts the fetch slightly before
 * a row is actually on-screen so the "N fields changed" badge is usually
 * already populated by the time the user scrolls to it.
 */
const PREFETCH_ROOT_MARGIN = '400px 0px';

/** Human-readable labels for revision Source values included in the feed. */
const REVISION_SOURCE_LABELS: Record<string, string> = {
  UpdateUnit: 'edited config',
  PatchUnit: 'edited config',
  MergeExternal: 'pushed changes',
  CloneUnit: 'cloned unit set',
  RestoreRevision: 'restored a previous revision',
};

/** Matches any UUID in a string (case-insensitive). */
const UUID_REGEX = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

/**
 * Replace UUIDs in `text` with their corresponding slugs from `idToSlug`.
 * Unresolved UUIDs (non-space, deleted, or inaccessible) are left verbatim.
 * Returns `text` unchanged when `idToSlug` is empty.
 */
function substituteUuids(text: string, idToSlug: Map<string, string>): string {
  if (idToSlug.size === 0) return text;
  return text.replace(UUID_REGEX, (uuid) => idToSlug.get(uuid.toLowerCase()) ?? uuid);
}

function makePulse(color: string) {
  return keyframes`
    0%   { box-shadow: 0 0 0 0 ${color}80; }
    70%  { box-shadow: 0 0 0 5px ${color}00; }
    100% { box-shadow: 0 0 0 0 ${color}00; }
  `;
}

// ============================================================================
// HELPERS
// ============================================================================

function avatarPaletteColor(userId: string, palette: Theme['palette']): string {
  const colors = [
    palette.error.main,
    palette.warning.main,
    palette.info.main,
    palette.success.main,
    palette.secondary.main,
  ];
  return colors[(userId.charCodeAt(0) ?? 0) % colors.length];
}

function getRevisionDescription(revision: RevisionRead | undefined): string {
  if (!revision) return 'config change';
  const trimmed = revision.Description?.trim();
  // Ignore descriptions that are just the raw SourceType name (e.g. "PatchUnit")
  // so they fall through to REVISION_SOURCE_LABELS instead of surfacing verbatim.
  if (trimmed && trimmed !== revision.Source) return trimmed;
  return REVISION_SOURCE_LABELS[revision.Source ?? ''] ?? revision.Source ?? 'config change';
}

// ============================================================================
// PREDECESSOR DIFF (shared fetch/compute, two trigger sources)
// ============================================================================

/**
 * Fetches the predecessor revision (RevisionNum - 1) for `revision` and
 * computes the field-level diff against it. Shared by two trigger sources:
 *  - FeedEntryRow, which enables this once the row scrolls near the viewport,
 *    purely to resolve the "N fields changed" badge count.
 *  - RevisionDiffPanel, which always enables this once mounted (row expanded)
 *    to render the full diff.
 * Both call sites use identical query args (spaceId, unitId, RevisionNum - 1),
 * so RTK Query's cache dedups them — whichever fires first satisfies both,
 * and re-triggering an already-fetched row is free.
 *
 * When `onFieldChangeCount` is provided, the resolved count is published
 * upward as soon as it's known so collapsed rows can keep showing the badge.
 */
function usePredecessorDiff(
  revision: RevisionRead,
  unitSlug: string | undefined,
  enabled: boolean,
  onFieldChangeCount?: (revisionId: string, count: number) => void,
) {
  const revNum = revision.RevisionNum ?? 0;
  const isFirstRevision = revNum <= 1;
  const spaceId = revision.SpaceID ?? '';
  const unitId = revision.UnitID ?? '';
  const canFetch = enabled && !isFirstRevision && !!spaceId && !!unitId;

  const { data: prevExtended = [], isFetching } = useListExtendedRevisionsQuery(
    { spaceId, unitId, where: `RevisionNum = ${revNum - 1}` },
    { skip: !canFetch },
  );

  const prevRevision = prevExtended[0]?.Revision;

  // Both Revisions of the diff come from one request; configuration is not on the Revision.
  const { dataFor } = useRevisionDataMap([prevRevision?.RevisionID, revision.RevisionID]);

  const diff = useMemo(() => {
    if (!canFetch || isFetching || !prevRevision) return null;
    return buildUnitDiff(
      unitId,
      spaceId,
      unitSlug ?? unitId,
      dataFor(prevRevision.RevisionID),
      dataFor(revision.RevisionID),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canFetch, isFetching, prevRevision, unitId, spaceId, unitSlug, revision.RevisionID, dataFor]);

  // Publish the count upward so the collapsed row keeps its "N fields changed"
  // badge once it's known, regardless of which trigger source resolved it.
  const revisionId = revision.RevisionID ?? '';
  const resolvedCount = diff?.diffs.length;
  useEffect(() => {
    if (resolvedCount === undefined || !revisionId || !onFieldChangeCount) return;
    onFieldChangeCount(revisionId, resolvedCount);
  }, [resolvedCount, revisionId, onFieldChangeCount]);

  return { isFirstRevision, canFetch, isFetching, prevRevision, diff };
}

// ============================================================================
// REVISION DIFF PANEL
// ============================================================================

interface RevisionDiffPanelProps {
  revision: RevisionRead;
  unitSlug?: string;
  onCollapse: () => void;
  columnStyle: CSSProperties;
  onDividerMouseDown: (columnIndex: 0 | 1, e: React.MouseEvent) => void;
  isDragging: boolean;
  /**
   * Reports the resolved field-change count back to the feed so the collapsed
   * row can keep showing the "N fields changed" badge after the panel closes.
   * FeedEntryRow may also have already resolved (and reported) this same
   * count via its own viewport-triggered prefetch — in that case this panel's
   * fetch is served from the RTK Query cache instead of hitting the network.
   */
  onFieldChangeCount: (revisionId: string, count: number) => void;
}

/**
 * Accordion panel rendered beneath an expanded revision feed row.
 * Fetches the previous revision and renders a TreeDiffSection showing
 * the field-level before→after diff.
 */
const RevisionDiffPanel = ({
  revision,
  unitSlug,
  onCollapse,
  columnStyle,
  onDividerMouseDown,
  isDragging,
  onFieldChangeCount,
}: RevisionDiffPanelProps) => {
  const theme = useTheme();
  const revNum = revision.RevisionNum ?? 0;

  // Always enabled: this panel is only mounted when a row is expanded
  // (`Collapse unmountOnExit`), so fetching unconditionally here is still
  // lazy at the panel level. If FeedEntryRow's viewport-triggered prefetch
  // already resolved this same revision, RTK Query serves it from cache.
  const { isFirstRevision, isFetching, prevRevision, diff } = usePredecessorDiff(
    revision,
    unitSlug,
    true,
    onFieldChangeCount,
  );

  // Determine the panel body based on state
  let panelBody: React.ReactNode;
  if (isFirstRevision) {
    panelBody = (
      <Box sx={{ px: 1.5, py: 1.5 }}>
        <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>
          First revision — no previous to compare
        </Typography>
      </Box>
    );
  } else if (isFetching) {
    panelBody = (
      <Box sx={{ px: 1.5, py: 1.5, display: 'flex', flexDirection: 'column', gap: '6px' }}>
        <Skeleton variant='text' width='80%' height={14} />
        <Skeleton variant='text' width='60%' height={14} />
        <Skeleton variant='text' width='70%' height={14} />
      </Box>
    );
  } else if (!prevRevision) {
    panelBody = (
      <Box sx={{ px: 1.5, py: 1.5 }}>
        <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>
          Previous revision not available
        </Typography>
      </Box>
    );
  } else if (!diff || diff.diffs.length === 0) {
    panelBody = (
      <Box sx={{ px: 1.5, py: 1.5 }}>
        <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>
          No field changes detected
        </Typography>
      </Box>
    );
  } else {
    panelBody = (
      <TreeDiffSection
        entry={{ unitId: diff.unitId, fieldDiffs: diff.diffs }}
        allPaths={diff.allPaths}
        keyPrefix={`feed-diff-${revision.RevisionID}`}
        label='config changes'
        variant='data'
        hideLabel
        columnStyle={columnStyle}
        onDividerMouseDown={onDividerMouseDown}
        isDragging={isDragging}
      />
    );
  }

  return (
    <Box
      sx={{
        pl: 7,
        pr: 0,
        pb: '14px',
        borderBottom: `1px solid ${theme.palette.divider}`,
      }}
    >
      <Box
        sx={{
          bgcolor: alpha(theme.palette.text.primary, 0.025),
          border: `1px solid ${alpha(theme.palette.text.primary, 0.07)}`,
          borderRadius: '7px',
          overflow: 'hidden',
        }}
      >
        {/* Panel header: title + collapse link */}
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            px: 1.5,
            py: '7px',
            borderBottom: `1px solid ${alpha(theme.palette.text.primary, 0.07)}`,
            bgcolor: alpha(theme.palette.text.primary, 0.018),
          }}
        >
          <Typography
            sx={{
              fontSize: '0.65rem',
              fontWeight: 700,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              color: 'text.secondary',
            }}
          >
            Changes · Revision {revNum} vs previous
          </Typography>
          <Link
            component='button'
            onClick={onCollapse}
            sx={{
              fontSize: 11,
              fontWeight: 500,
              color: 'primary.main',
              textDecoration: 'none',
              lineHeight: 1,
              '&:hover': { textDecoration: 'underline' },
            }}
          >
            Collapse
          </Link>
        </Box>

        {/* Panel body: varies by load state */}
        {panelBody}
      </Box>
    </Box>
  );
};

// ============================================================================
// ENTRY ROW
// ============================================================================

interface FeedEntryRowProps {
  entry: FeedEntry;
  isCurrentUser: boolean;
  /** Whether this row's diff accordion is open. */
  isExpanded: boolean;
  /** Toggle the accordion open/closed. Called for both open and close. */
  onToggle: () => void;
  columnStyle: CSSProperties;
  onDividerMouseDown: (columnIndex: 0 | 1, e: React.MouseEvent) => void;
  isDragging: boolean;
  /** SpaceID (lowercased) → Slug map for substituting UUIDs in revision description text. */
  spaceIdToSlug: Map<string, string>;
  /**
   * Resolved field-change count for this row. Undefined until it has resolved — either because
   * this row scrolled near the viewport (see the `useInViewport`-gated prefetch below) or because
   * the row was expanded — and always undefined for first revisions (nothing to diff against). 0
   * means no config fields changed (e.g. metadata-only patch). Supplied via parent state
   * (`fieldChangeCounts` in ComponentActivityFeed), written by whichever trigger resolves first.
   */
  fieldChangeCount?: number;
  /** Passed through to RevisionDiffPanel and the viewport prefetch so both can publish the resolved count. */
  onFieldChangeCount: (revisionId: string, count: number) => void;
}

const FeedEntryRow = ({
  entry,
  isCurrentUser,
  isExpanded,
  onToggle,
  columnStyle,
  onDividerMouseDown,
  isDragging,
  spaceIdToSlug,
  fieldChangeCount,
  onFieldChangeCount,
}: FeedEntryRowProps) => {
  const theme = useTheme();
  const navigate = useNavigate();
  const { componentName, isAutomated, autoDisplayName, autoSubLabel } = entry;

  // Resolve display user: human revision → entry.revisionUser (absent for automated revisions).
  const displayUser = entry.revisionUser;
  const humanDisplayName = displayUser?.DisplayName ?? 'Unknown';
  const avatarBg = avatarPaletteColor(displayUser?.UserID ?? 'z', theme.palette);

  // SpaceSlug for the path label
  const spaceSlug = entry.revision.SpaceSlug;

  // Description text, with any UUIDs (e.g. from CloneUnit/RestoreRevision metadata) replaced by
  // their human-readable space slugs. Unresolved UUIDs (non-space, deleted, inaccessible) are left
  // verbatim.
  const descriptionText = substituteUuids(getRevisionDescription(entry.revision), spaceIdToSlug);

  // ── Viewport-based predecessor prefetch ─────────────────────────────────────
  // Once this row scrolls into (or near) the viewport, kick off the same
  // predecessor-revision fetch RevisionDiffPanel uses, purely to resolve the
  // "N fields changed" badge without requiring the user to expand the row.
  const [prefetchRef, hasBeenInView] = useInViewport<HTMLDivElement>(PREFETCH_ROOT_MARGIN);
  const shouldPrefetch = hasBeenInView && fieldChangeCount === undefined;
  usePredecessorDiff(entry.revision, entry.unitSlug, shouldPrefetch, onFieldChangeCount);

  return (
    <>
      <Box
        ref={prefetchRef}
        role='button'
        tabIndex={0}
        onClick={onToggle}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onToggle();
          }
        }}
        sx={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: 2,
          py: '12px',
          px: 0,
          borderBottom: isExpanded ? 'none' : `1px solid ${theme.palette.divider}`,
          bgcolor: isExpanded ? alpha(theme.palette.text.primary, 0.028) : undefined,
          cursor: 'pointer',
          '&:hover': { bgcolor: alpha(theme.palette.text.primary, 0.028) },
          transition: 'background-color 0.1s ease',
        }}
      >
        {/* Avatar */}
        {isAutomated ? (
          <Avatar
            sx={{
              width: 40,
              height: 40,
              flexShrink: 0,
              bgcolor: alpha(theme.palette.text.secondary, 0.12),
              color: 'text.secondary',
            }}
          >
            <SmartToyOutlinedIcon sx={{ fontSize: 20 }} />
          </Avatar>
        ) : (
          <Avatar
            src={displayUser?.ProfilePictureURL ?? undefined}
            sx={{ width: 40, height: 40, fontSize: 15, fontWeight: 600, bgcolor: avatarBg, flexShrink: 0 }}
          >
            {humanDisplayName.charAt(0).toUpperCase()}
          </Avatar>
        )}

        {/* Content column */}
        <Box sx={{ flex: 1, minWidth: 0 }}>
          {/* Row 1: actor name + YOU chip */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
            <Typography sx={{ fontSize: 14, fontWeight: 600, color: 'text.primary' }}>
              {isAutomated ? autoDisplayName : humanDisplayName}
            </Typography>
            {!isAutomated && isCurrentUser && (
              <Chip
                label='YOU'
                color='primary'
                size='small'
                sx={{
                  height: 16,
                  fontSize: '0.60rem',
                  fontWeight: 700,
                  borderRadius: '4px',
                  '& .MuiChip-label': { px: '5px' },
                }}
              />
            )}
          </Box>

          {/* Row 1b: automated identity sub-line — "AUTO · sub-label" on one line */}
          {isAutomated && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: '4px', mt: '2px' }}>
              <Chip
                label='AUTO'
                size='small'
                sx={{
                  height: 16,
                  fontSize: '0.60rem',
                  fontWeight: 700,
                  borderRadius: '4px',
                  bgcolor: alpha(theme.palette.text.secondary, 0.12),
                  color: 'text.secondary',
                  '& .MuiChip-label': { px: '5px' },
                }}
              />
              {autoSubLabel && (
                <Typography component='span' sx={{ fontSize: 12, color: 'text.secondary' }}>
                  · {autoSubLabel}
                </Typography>
              )}
            </Box>
          )}

          {/* Row 2: "on [component] / [space] — description".
              No unit segment: activity is attributed to the space it happened in, which is the
              level this feed is read at and the level the link navigates to. The unit still appears
              in the expanded diff panel, where it is the thing actually being diffed. */}
          <Box sx={{ mt: '2px' }}>
            <Typography component='span' sx={{ fontSize: 13, color: 'text.secondary' }}>
              {'on '}
              <Link
                component='button'
                onClick={(e) => {
                  e.stopPropagation();
                  navigate(
                    entry.spaceId
                      ? `${ROUTE_COMPONENTS}?app=${encodeURIComponent(componentName)}&space=${encodeURIComponent(entry.spaceId)}`
                      : `${ROUTE_COMPONENTS}?app=${encodeURIComponent(componentName)}`
                  );
                }}
                sx={{
                  fontSize: 13,
                  fontWeight: 700,
                  color: 'text.primary',
                  textDecoration: 'none',
                  '&:hover': { textDecoration: 'underline' },
                }}
              >
                {componentName}
                {spaceSlug && (
                  <>
                    <Box component='span' sx={{ fontWeight: 400, color: 'text.disabled' }}>{' / '}</Box>
                    {spaceSlug}
                  </>
                )}
              </Link>
              {' — '}
              {descriptionText}
              {fieldChangeCount !== undefined && (
                <Box component='span' sx={{ color: 'text.disabled' }}>
                  {` · ${fieldChangeCount} field${fieldChangeCount === 1 ? '' : 's'} changed`}
                </Box>
              )}
            </Typography>
          </Box>
        </Box>

        {/* Right column: timestamp */}
        <Box sx={{ flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
          <Typography sx={{ fontSize: 11, color: 'text.disabled' }}>
            {formatShortTimestamp(entry.timestamp)}
          </Typography>
        </Box>

        {/* Chevron — rotates 90° when expanded */}
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 18,
            height: 18,
            color: 'text.disabled',
            flexShrink: 0,
          }}
        >
          <ChevronRightIcon
            sx={{
              fontSize: 16,
              transition: 'transform 0.22s cubic-bezier(0.4, 0, 0.2, 1)',
              transform: isExpanded ? 'rotate(90deg)' : 'none',
            }}
          />
        </Box>
      </Box>

      {/* Accordion diff panel */}
      <Collapse in={isExpanded} timeout={280} unmountOnExit>
        <RevisionDiffPanel
          revision={entry.revision}
          unitSlug={entry.unitSlug}
          onCollapse={onToggle}
          columnStyle={columnStyle}
          onDividerMouseDown={onDividerMouseDown}
          isDragging={isDragging}
          onFieldChangeCount={onFieldChangeCount}
        />
      </Collapse>
    </>
  );
};

// ============================================================================
// MAIN COMPONENT
// ============================================================================

interface ComponentActivityFeedProps {
  spaces: ExtendedSpaceRead[];
}

export const ComponentActivityFeed = ({ spaces }: ComponentActivityFeedProps) => {
  const theme = useTheme();
  const { userInfo } = useUserInfo();
  const [activeTab, setActiveTab] = useState<ActivityFeedTab>('all');
  const [expandedRevisionId, setExpandedRevisionId] = useState<string | null>(null);

  // Per-row field-change counts, populated by RevisionDiffPanel when a row is
  // expanded and its predecessor revision resolves. Keyed by RevisionID.
  // Deliberately lazy: preloading every row on mount fired one extra request
  // per revision row (up to MAX_FEED_ENTRIES) on first paint.
  const [fieldChangeCounts, setFieldChangeCounts] = useState<Map<string, number>>(() => new Map());

  // Stable callback: idempotent to avoid render loops (returns prev when unchanged).
  const handleCountResult = useCallback((revisionId: string, count: number) => {
    setFieldChangeCounts((prev) =>
      prev.get(revisionId) === count ? prev : new Map(prev).set(revisionId, count),
    );
  }, []);
  const { columnStyle, onDividerMouseDown, isDragging } = useColumnResize();

  const handleToggleRevision = useCallback((revisionId: string) => {
    setExpandedRevisionId((prev) => (prev === revisionId ? null : revisionId));
  }, []);

  const { slugById } = useComponentSlugs();
  const spaceIdToComponent = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of spaces) {
      const spaceId = s.Space?.SpaceID;
      const compName = spaceComponentSlug(s.Space, slugById);
      if (spaceId && compName) map.set(spaceId, compName);
    }
    return map;
  }, [spaces, slugById]);

  const componentSpaceIds = useMemo(() => Array.from(spaceIdToComponent.keys()), [spaceIdToComponent]);

  // ── Revision query ──────────────────────────────────────────────────────────
  // include: 'UserID,UnitID' fetches extended.User and extended.Unit alongside each revision.
  const revisionsWhere = useMemo(() => {
    if (componentSpaceIds.length === 0) return undefined;
    const spaceIds = componentSpaceIds.map((id) => `'${id}'`).join(', ');
    const sources = Object.keys(REVISION_SOURCE_LABELS).map((s) => `'${s}'`).join(', ');
    return `SpaceID IN (${spaceIds}) AND Source IN (${sources})`;
  }, [componentSpaceIds]);

  // Server returns the most-recent MAX_FEED_ENTRIES matching revisions pre-sorted
  // (orderBy: DESC:CreatedAt) and pre-filtered — this is the feed's only source, so
  // no further client-side sort/cap is required before the tab filter runs below.
  //
  // distinct_on: 'Off' is what makes this an activity stream. The endpoint's default
  // returns at most one row per *unit*, which spends the whole limit on one busy
  // space; any coarser key spends it worse still. A feed wants neither — it wants
  // the most recent rows, full stop, and to label them by space (a display choice,
  // made from SpaceID below). 'Unit' remains the endpoint's default for every other
  // caller. distinct_on=Off requires an explicit limit, which the `limit` here satisfies.
  const {
    data: revisionsData = [],
    isLoading: revisionsLoading,
    isError: revisionsError,
  } = useListAllRevisionsQuery(
    {
      where: revisionsWhere,
      include: 'UserID,UnitID',
      limit: MAX_FEED_ENTRIES,
      orderBy: 'DESC:CreatedAt',
      distinctOn: 'Off',
    },
    { skip: !revisionsWhere },
  );

  // ── Build revision feed entries ─────────────────────────────────────────────
  // extended.Unit?.Slug is available because include: 'UserID,UnitID' is set above.
  const revisionFeedEntries = useMemo((): FeedEntry[] => {
    return (revisionsData as ExtendedRevisionRead[])
      .map((extended): FeedEntry | null => {
        const revision = extended.Revision;
        if (!revision) return null;
        const componentName = revision.SpaceID ? spaceIdToComponent.get(revision.SpaceID) : undefined;
        if (!componentName) return null;
        const timestamp = revision.CreatedAt ? new Date(revision.CreatedAt).getTime() : 0;
        const automated = revision.UserID === AUTOMATED_USER_ID;
        const unitSlug = extended.Unit?.Slug;

        if (automated) {
          return {
            componentName,
            spaceId: revision.SpaceID,
            timestamp,
            isAutomated: true,
            revision,
            unitSlug,
            autoDisplayName: 'ConfigHub System',
            autoSubLabel: REVISION_SOURCE_LABELS[revision.Source ?? ''],
          };
        }

        return {
          componentName,
          spaceId: revision.SpaceID,
          timestamp,
          isAutomated: false,
          revision,
          unitSlug,
          revisionUser: extended.User,
        };
      })
      .filter((e): e is FeedEntry => e !== null);
  }, [revisionsData, spaceIdToComponent]);

  // ── Space-slug resolution (UUID → slug substitution in description text) ──────
  // Scan revision descriptions for UUIDs so we can resolve them to space slugs
  // (e.g. "Cloned from <SpaceID>/unit-slug" → "Cloned from env-prod/unit-slug").
  // Only space IDs are resolved; non-space UUIDs are left verbatim.
  const descriptionUuids = useMemo(() => {
    const ids = new Set<string>();
    for (const entry of revisionFeedEntries) {
      const text = getRevisionDescription(entry.revision);
      const matches = text.match(UUID_REGEX);
      if (matches) {
        for (const m of matches) ids.add(m.toLowerCase());
      }
    }
    return ids;
  }, [revisionFeedEntries]);

  // The `spaces` prop is already loaded (it's how this whole feed is scoped),
  // so any embedded UUID that happens to reference one of THOSE spaces can be
  // resolved for free, with no request at all. Only UUIDs pointing at spaces
  // outside this set (e.g. a clone/restore sourced from another app/component)
  // still require the round trip below.
  //
  // NOTE: there is no `include`-based fix for this — the revisions endpoint's
  // `include` param (see revisionsWhere query above) only expands *structured*
  // relations the API tracks as real columns (ChangeSetID, SpaceID, UnitID,
  // UserID, ...). The space UUID here is embedded free-text inside
  // Revision.Description (e.g. "Cloned from <uuid>/unit-slug") — the API has
  // no column tying a Revision to that referenced space, so it can't expand
  // it via `include`. A full fix would need a backend change (e.g. a
  // structured SourceSpaceID column on Revision for CloneUnit/RestoreRevision,
  // resolvable via `include`) to eliminate the round trip for cross-component
  // references entirely.
  const propSpaceIdToSlug = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of spaces) {
      const spaceId = s.Space?.SpaceID;
      const slug = s.Space?.Slug;
      if (spaceId && slug) map.set(spaceId.toLowerCase(), slug);
    }
    return map;
  }, [spaces]);

  const unresolvedDescriptionUuids = useMemo(
    () => new Set([...descriptionUuids].filter((id) => !propSpaceIdToSlug.has(id))),
    [descriptionUuids, propSpaceIdToSlug],
  );

  const spaceSlugWhere = useMemo(() => {
    if (unresolvedDescriptionUuids.size === 0) return undefined;
    const idsClause = [...unresolvedDescriptionUuids].map((id) => `'${id}'`).join(', ');
    return `SpaceID IN (${idsClause})`;
  }, [unresolvedDescriptionUuids]);

  const { data: slugSpacesData = [] } = useListSpacesQuery(
    { where: spaceSlugWhere ?? '', select: 'Slug' },
    { skip: !spaceSlugWhere },
  );

  // SpaceID (lowercased) → Slug, for O(1) lookup in substituteUuids. Starts
  // from the free, already-loaded propSpaceIdToSlug and layers in whatever
  // the fallback fetch resolved for spaces outside this feed's scope.
  const spaceIdToSlug = useMemo(() => {
    const map = new Map(propSpaceIdToSlug);
    for (const ext of slugSpacesData) {
      const spaceId = ext.Space?.SpaceID;
      const slug = ext.Space?.Slug;
      if (spaceId && slug) map.set(spaceId.toLowerCase(), slug);
    }
    return map;
  }, [propSpaceIdToSlug, slugSpacesData]);

  // Sort by recency and cap defensively. The revisions query above already returns at most
  // MAX_FEED_ENTRIES rows sorted DESC:CreatedAt, so this is normally a no-op — but keeping the
  // sort+cap explicit here (rather than trusting the query's exact behavior) keeps this step's
  // contract self-evident, and keeps it running before the tab filter below, not after: tab
  // counts must describe this capped slice, not the total DB count.
  const feedEntries = useMemo(
    () => [...revisionFeedEntries].sort((a, b) => b.timestamp - a.timestamp).slice(0, MAX_FEED_ENTRIES),
    [revisionFeedEntries],
  );

  const tabCounts = useMemo(() => countEntriesByTab(feedEntries), [feedEntries]);

  const displayedEntries = useMemo(
    () => filterEntriesByTab(feedEntries, activeTab),
    [feedEntries, activeTab],
  );

  return (
    <Box>
      {/* ── Section header ── */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          py: '10px',
          px: 0,
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Box
            sx={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              bgcolor: 'success.main',
              flexShrink: 0,
              animation: `${makePulse(theme.palette.success.main)} 2s infinite`,
            }}
          />
          <Typography
            sx={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: 'text.secondary',
            }}
          >
            Recent Activity
          </Typography>
        </Box>

        {/* ── Activity tabs ── */}
        <Tabs
          value={activeTab}
          onChange={(_, v: ActivityFeedTab) => setActiveTab(v)}
          sx={{ minHeight: 28 }}
        >
          <Tab
            label={`All (${tabCounts.all})`}
            value='all'
            sx={{ minHeight: 28, py: 0, textTransform: 'none', fontSize: '0.75rem' }}
          />
          <Tab
            label={`People (${tabCounts.people})`}
            value='people'
            sx={{ minHeight: 28, py: 0, textTransform: 'none', fontSize: '0.75rem' }}
          />
          <Tab
            label={`Automated (${tabCounts.automated})`}
            value='automated'
            sx={{ minHeight: 28, py: 0, textTransform: 'none', fontSize: '0.75rem' }}
          />
        </Tabs>
      </Box>

      {/* ── Hairline divider ── */}
      <Box sx={{ height: '1px', bgcolor: 'divider' }} />

      {/* ── Entry list ── */}
      {revisionsLoading ? (
        <Box sx={{ py: 2, display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {[...Array(3)].map((_, i) => (
            <Box key={i} sx={{ display: 'flex', gap: 2, alignItems: 'flex-start' }}>
              <Skeleton variant='circular' width={40} height={40} />
              <Box sx={{ flex: 1 }}>
                <Skeleton variant='text' width='60%' height={18} />
                <Skeleton variant='text' width='80%' height={16} sx={{ mt: '4px' }} />
              </Box>
            </Box>
          ))}
        </Box>
      ) : revisionsError ? (
        <Box sx={{ py: 3, textAlign: 'center' }}>
          <Typography sx={{ color: 'error.main', fontSize: 13 }}>Failed to load activity</Typography>
        </Box>
      ) : displayedEntries.length === 0 ? (
        <Box sx={{ py: 3, textAlign: 'center' }}>
          <Typography sx={{ color: 'text.disabled' }}>No recent activity</Typography>
        </Box>
      ) : (
        <>
          {displayedEntries.map((entry) => {
            const entryKey = `revision-${entry.revision.RevisionID}`;
            const entryUserID = entry.revisionUser?.UserID;
            const revisionId = entry.revision.RevisionID ?? '';
            return (
              <FeedEntryRow
                key={entryKey}
                entry={entry}
                isCurrentUser={!!(userInfo?.UserID && userInfo.UserID === entryUserID)}
                isExpanded={expandedRevisionId === revisionId}
                onToggle={() => handleToggleRevision(revisionId)}
                columnStyle={columnStyle}
                onDividerMouseDown={onDividerMouseDown}
                isDragging={isDragging}
                spaceIdToSlug={spaceIdToSlug}
                fieldChangeCount={fieldChangeCounts.get(revisionId)}
                onFieldChangeCount={handleCountResult}
              />
            );
          })}
        </>
      )}

    </Box>
  );
};
