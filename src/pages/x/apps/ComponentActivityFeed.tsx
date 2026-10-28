// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { useCallback, useMemo, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import type { SerializedError } from '@reduxjs/toolkit';
import type { FetchBaseQueryError } from '@reduxjs/toolkit/query';

import { useUserInfo } from '@/components/authenticated-context/AuthenticatedContext';
import { ConfigDiffView, type ConfigDiffColumns } from '@/components/config-diff/ConfigDiffView';
import { summarizeConfigDiff } from '@/components/config-diff/configDiffTree';
import {
  type ExtendedRevisionRead,
  type ExtendedSpaceRead,
  type RevisionRead,
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
import { useListRecentRevisionsChunkedQuery } from '@/hooks/chunkedQueriesApi';
import { useGetRevisionDiffQuery } from '@/hooks/configDiffApi';
import { spaceComponentSlug, useComponentSlugs } from '@/hooks/useComponentSlugs';
import { useInViewport } from '@/hooks/useInViewport';
import { getApiErrorMessage } from '@/utility/error-functions';

import {
  countEntriesByTab,
  filterEntriesByTab,
  MAX_FEED_ENTRIES,
  type ActivityFeedTab,
  type FeedEntry,
} from './activityFeedEntries';
import { ROUTE_COMPONENTS } from './appTypes';
import { useColumnResize } from './useColumnResize';

// ============================================================================
// CONSTANTS
// ============================================================================

/**
 * IntersectionObserver rootMargin used to lazily read each feed row's diff.
 * Positive margin starts the read slightly before a row is actually on-screen
 * so the "N changes" badge is usually already populated by the time the user
 * scrolls to it.
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

/** The Revision Sources the feed reads. */
const FEED_REVISION_SOURCES = Object.keys(REVISION_SOURCE_LABELS);

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
// REVISION DIFF (one read, two trigger sources)
// ============================================================================

/**
 * What `revision` changed: the server's diff from the Revision before it. Read by two
 * trigger sources with the same arguments, so RTK Query serves both from one request:
 *  - FeedEntryRow, once the row scrolls near the viewport, for the "N changes" badge.
 *  - RevisionDiffPanel, once the row is expanded, for the diff itself.
 *
 * The server matches array elements by merge key, so an element inserted into a list
 * is one change, and the elements after it are not reported as changed.
 *
 * A first Revision is not read. In this feed it is usually a clone, whose diff from
 * nothing would list every resource as added; the panel says there is no previous instead.
 *
 * `from` is named rather than left to the server's default, the Revision before `to`: a
 * Revision that a named selector cannot find is a 404 the panel can tell apart, as
 * `isNoPreviousRevision` does, where the default's lookup answers a 500.
 */
function useRevisionChangeDiff(revision: RevisionRead, enabled: boolean) {
  const revNum = revision.RevisionNum ?? 0;
  const isFirstRevision = revNum <= 1;
  const spaceId = revision.SpaceID ?? '';
  const unitId = revision.UnitID ?? '';

  const { data, error } = useGetRevisionDiffQuery(
    { spaceId, unitId, from: String(revNum - 1), to: String(revNum) },
    { skip: !enabled || isFirstRevision || !spaceId || !unitId },
  );
  const summary = useMemo(() => (data ? summarizeConfigDiff(data.Diff) : undefined), [data]);

  return { isFirstRevision, data, error, summary };
}

/** The 404 the server answers when the `from` Revision is not found, as `from: <why>`. */
function isNoPreviousRevision(error: FetchBaseQueryError | SerializedError): boolean {
  return 'status' in error && error.status === 404 && getApiErrorMessage(error, '').startsWith('from: ');
}

// ============================================================================
// REVISION DIFF PANEL
// ============================================================================

interface RevisionDiffPanelProps {
  revision: RevisionRead;
  onCollapse: () => void;
  /** Column widths shared by every row's panel, so a resize holds across rows. */
  columns: ConfigDiffColumns;
}

function PanelMessage({ children, color = 'text.secondary' }: { children: React.ReactNode; color?: string }) {
  return (
    <Box sx={{ px: 1.5, py: 1.5 }}>
      <Typography sx={{ fontSize: 12, color }}>{children}</Typography>
    </Box>
  );
}

/**
 * Accordion panel rendered beneath an expanded revision feed row: what the
 * Revision changed from the one before it, resource by resource.
 */
const RevisionDiffPanel = ({ revision, onCollapse, columns }: RevisionDiffPanelProps) => {
  const theme = useTheme();
  const revNum = revision.RevisionNum ?? 0;

  // This panel is mounted only while its row is expanded (`Collapse unmountOnExit`),
  // so reading unconditionally here is still lazy.
  const { isFirstRevision, data, error, summary } = useRevisionChangeDiff(revision, true);

  let panelBody: React.ReactNode;
  if (isFirstRevision) {
    panelBody = <PanelMessage>First revision — no previous to compare</PanelMessage>;
  } else if (error) {
    panelBody =
      isNoPreviousRevision(error) ? (
        <PanelMessage>Previous revision not available</PanelMessage>
      ) : (
        <PanelMessage color='error.main'>{getApiErrorMessage(error, 'The diff could not be loaded.')}</PanelMessage>
      );
  } else if (!data || !summary) {
    panelBody = (
      <Box sx={{ px: 1.5, py: 1.5, display: 'flex', flexDirection: 'column', gap: '6px' }}>
        <Skeleton variant='text' width='80%' height={14} />
        <Skeleton variant='text' width='60%' height={14} />
        <Skeleton variant='text' width='70%' height={14} />
      </Box>
    );
  } else if (summary.total === 0) {
    panelBody = <PanelMessage>No changes detected</PanelMessage>;
  } else {
    panelBody = <ConfigDiffView diff={data.Diff ?? {}} columns={columns} />;
  }

  return (
    <Box
      data-testid='activity-feed-diff'
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
  columns: ConfigDiffColumns;
  /** SpaceID (lowercased) → Slug map for substituting UUIDs in revision description text. */
  spaceIdToSlug: Map<string, string>;
}

const FeedEntryRow = ({
  entry,
  isCurrentUser,
  isExpanded,
  onToggle,
  columns,
  spaceIdToSlug,
}: FeedEntryRowProps) => {
  const theme = useTheme();
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

  // ── Viewport-based diff read ────────────────────────────────────────────────
  // Once this row scrolls into (or near) the viewport, read the same diff
  // RevisionDiffPanel draws, so the "N changes" badge shows without expanding
  // the row. Reading every row on mount would fire one request per row on first paint.
  const [prefetchRef, hasBeenInView] = useInViewport<HTMLDivElement>(PREFETCH_ROOT_MARGIN);
  const { summary } = useRevisionChangeDiff(entry.revision, hasBeenInView);
  const changeCount = summary?.total;

  return (
    <>
      <Box
        ref={prefetchRef}
        data-testid='activity-feed-row'
        data-revision-num={entry.revision.RevisionNum}
        role='button'
        tabIndex={0}
        onClick={onToggle}
        onKeyDown={(e) => {
          // A key on the Component link inside the row is the link's, not the row's.
          if (e.target !== e.currentTarget) return;
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
              level this feed is read at and the level the link navigates to. The expanded diff
              panel names each resource the Revision changed. */}
          <Box sx={{ mt: '2px' }}>
            <Typography component='span' sx={{ fontSize: 13, color: 'text.secondary' }}>
              {'on '}
              <Link
                component={RouterLink}
                to={
                  entry.spaceId
                    ? `${ROUTE_COMPONENTS}?app=${encodeURIComponent(componentName)}&space=${encodeURIComponent(entry.spaceId)}`
                    : `${ROUTE_COMPONENTS}?app=${encodeURIComponent(componentName)}`
                }
                onClick={(e: React.MouseEvent) => e.stopPropagation()}
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
              {changeCount !== undefined && (
                <Box component='span' data-testid='activity-feed-change-count' sx={{ color: 'text.disabled' }}>
                  {` · ${changeCount} change${changeCount === 1 ? '' : 's'}`}
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
        <RevisionDiffPanel revision={entry.revision} onCollapse={onToggle} columns={columns} />
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

  const { columnStyle, onDividerMouseDown, isDragging } = useColumnResize();
  const columns = useMemo<ConfigDiffColumns>(
    () => ({ columnStyle, onDividerMouseDown, isDragging }),
    [columnStyle, onDividerMouseDown, isDragging],
  );

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
  // The newest MAX_FEED_ENTRIES Revisions of these Sources across the Spaces, with
  // extended.User and extended.Unit. The Space ids are split over several requests,
  // since one `SpaceID IN (...)` over an org's few hundred Spaces is longer than the
  // server accepts. Every Revision is read, not one per Unit, so one busy Unit
  // cannot take the whole feed.
  const {
    data: revisionsData = [],
    isLoading: revisionsLoading,
    isError: revisionsError,
  } = useListRecentRevisionsChunkedQuery(
    { spaceIds: componentSpaceIds, sources: FEED_REVISION_SOURCES, limit: MAX_FEED_ENTRIES },
    { skip: componentSpaceIds.length === 0 },
  );

  // ── Build revision feed entries ─────────────────────────────────────────────
  const revisionFeedEntries = useMemo((): FeedEntry[] => {
    return (revisionsData as ExtendedRevisionRead[])
      .map((extended): FeedEntry | null => {
        const revision = extended.Revision;
        if (!revision) return null;
        const componentName = revision.SpaceID ? spaceIdToComponent.get(revision.SpaceID) : undefined;
        if (!componentName) return null;
        const timestamp = revision.CreatedAt ? new Date(revision.CreatedAt).getTime() : 0;
        // A Revision written by no User, such as by a Trigger, has no UserID.
        const automated = !revision.UserID;

        if (automated) {
          return {
            componentName,
            spaceId: revision.SpaceID,
            timestamp,
            isAutomated: true,
            revision,
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
  // `include` param (see the revision query above) only expands *structured*
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
                columns={columns}
                spaceIdToSlug={spaceIdToSlug}
              />
            );
          })}
        </>
      )}

    </Box>
  );
};
