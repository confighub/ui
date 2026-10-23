// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import { useMemo, useState } from 'react';

import CloseIcon from '@mui/icons-material/Close';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import Drawer from '@mui/material/Drawer';
import IconButton from '@mui/material/IconButton';
import Link from '@mui/material/Link';
import Stack from '@mui/material/Stack';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import Typography from '@mui/material/Typography';

import {
  Column,
  ExtendedViewRead,
  useListAllResourcesQuery,
} from '@confighub/rtk-query';
import { GroupNavRow, getCellValue } from '../../cell-value';
import { CodeEditor } from '@/components/code-editor/CodeEditor';
import { isKubernetesToolchain } from '@/components/code-editor/language';
import { ResourceContext } from '@/components/resource-overview/ResourceContext';
import { ResourceOverview } from '@/components/resource-overview/ResourceOverview';
import { TOP_NAV_HEIGHT } from '@/utility/constants';
import { resourceDisplayName } from '@/utility/resource-type-functions';

import { EntityAdapter } from '../../adapters';
import { isResourceViewRow, ResourceViewRow } from '../../adapters/resource-row';
import { decodeRawData } from '../../queries/useResourceViewRows';
import { getGroupByColumns } from '../../types';
import { ResourcesTab } from './ResourcesTab';
import type { ResourceView } from '@/components/unit-resources/UnitResourceBrowser';
import { useUnitResources } from '@/hooks/useUnitResources';

/** One line of the Details tab, given by a caller that has no saved View to read columns from. */
export interface DetailLine {
  label: string;
  value: string;
  /** Show the value in the code font (ids, paths). */
  mono?: boolean;
}

interface EntityDetailPanelProps {
  row: GroupNavRow;
  view: ExtendedViewRead | null;
  adapter: EntityAdapter;
  onClose: () => void;
  details?: readonly DetailLine[];
  /** The row's page link, when the caller adds to it; else the adapter's. */
  rowHref?: string;
}

/**
 * The drawer's content as a plain panel, for a page that lays it out itself
 * (beside a table, say) instead of sliding it over the page.
 */
export function EntityDetailPanel({
  row,
  view,
  adapter,
  onClose,
  details,
  rowHref,
}: EntityDetailPanelProps) {
  return (
    <DrawerBody
      key={adapter.getRowId(row) ?? 'unknown'}
      row={row}
      view={view}
      adapter={adapter}
      onClose={onClose}
      details={details}
      rowHref={rowHref}
    />
  );
}

interface EntityDetailDrawerProps {
  row: GroupNavRow | null;
  view: ExtendedViewRead | null;
  adapter: EntityAdapter | null;
  onClose: () => void;
}

type ActiveTab = 'details' | 'resources' | 'overview' | 'yaml';

/**
 * Right-side detail pane for the View Explorer. Replaces the navigate-away
 * row click; the user stays on the explorer page while inspecting one entity
 * at a time. The Resources tab is only available when the adapter declares
 * `supportsResources` (currently Units only) and lists that Unit's resources
 * from the resource API, each as an Overview or as YAML.
 */
export function EntityDetailDrawer({
  row,
  view,
  adapter,
  onClose,
}: EntityDetailDrawerProps) {
  const open = row !== null && adapter !== null && view !== null;

  // Reset tab to Details each time the drawer opens with a new row. Keyed
  // remount makes this fall out for free.
  return (
    <Drawer
      anchor='right'
      open={open}
      onClose={onClose}
      slotProps={{
        paper: {
          sx: { width: { xs: '100%', md: 720 }, display: 'flex', flexDirection: 'column' },
        },
      }}
    >
      {open && (
        <DrawerBody
          // Force remount when the row changes so per-row state (active tab,
          // expanded resource) resets cleanly.
          key={adapter.getRowId(row) ?? 'unknown'}
          row={row}
          view={view}
          adapter={adapter}
          onClose={onClose}
        />
      )}
    </Drawer>
  );
}

function DrawerBody({
  row,
  view,
  adapter,
  onClose,
  details,
  rowHref,
}: {
  row: GroupNavRow;
  view: ExtendedViewRead | null;
  adapter: EntityAdapter;
  onClose: () => void;
  details?: readonly DetailLine[];
  rowHref?: string;
}) {
  const isResource = isResourceViewRow(row);
  // Resource rows open straight on the resource itself, as an Overview, since
  // that's the primary thing the user clicked through to see; they have no
  // Details tab, as their columns are the row itself and the resource. Unit +
  // Space rows show metadata first.
  const [activeTab, setActiveTab] = useState<ActiveTab>(isResource ? 'overview' : 'details');
  const href = rowHref ?? adapter.getRowHref(row);
  const resourceBody = useResourceBody(isResource ? (row as ResourceViewRow) : null);
  // The friendly views are of Kubernetes resources; other configuration is
  // shown as written. Until the toolchain is known, the Overview is offered.
  const hasOverview =
    resourceBody.toolchainType === undefined || isKubernetesToolchain(resourceBody.toolchainType);
  const shownTab = activeTab === 'overview' && !hasOverview ? 'yaml' : activeTab;

  // Header title varies by entity type. Resource rows show ResourceName +
  // ResourceType so the drawer header matches what the user clicked.
  const title = isResource
    ? resourceDisplayName((row as ResourceViewRow).ResourceName, resourceBody.toolchainType) ||
      '(unnamed)'
    : getCellValue(row, 'Slug') || getCellValue(row, 'DisplayName') || '(unnamed)';
  const subtitle = isResource
    ? (row as ResourceViewRow).ResourceType
    : getCellValue(row, 'DisplayName');

  const supportsResources = adapter.supportsResources;
  const { spaceID, unitID } = useMemo(() => extractUnitIDs(row), [row]);
  // The Unit's resources: their names for the tab's count, and their bodies from the first
  // time the tab is opened (kept after that, so going back to Details and returning does not
  // fetch them again). The selection and the view are kept while this row is open; this body
  // is keyed by row, so a new row starts over.
  const [bodiesWanted, setBodiesWanted] = useState(false);
  const unitResources = useUnitResources({
    spaceID,
    unitID,
    withBody: bodiesWanted,
    skip: !supportsResources,
  });
  const [resourceId, setResourceId] = useState('');
  const [resourceView, setResourceView] = useState<ResourceView>('overview');
  // No count while loading, or when the list could not be read (it is not zero then).
  const resourceCount =
    unitResources.error || (unitResources.isLoading && unitResources.rows.length === 0)
      ? null
      : unitResources.rows.length;

  return (
    <>
      <Stack
        direction='row'
        alignItems='center'
        justifyContent='space-between'
        sx={{ p: 2, borderBottom: 1, borderColor: 'divider' }}
      >
        <Box sx={{ minWidth: 0 }}>
          <Typography variant='subtitle1' fontWeight={600} noWrap>
            {title}
          </Typography>
          <Typography
            variant='body2'
            color='text.secondary'
            noWrap
            component='div'
            // Kinds are case-sensitive and read as code.
            sx={isResource ? { fontFamily: 'var(--font-mono)' } : undefined}
          >
            {isResource ? subtitle || 'Resource' : adapter.entityType}
            {!isResource && subtitle && subtitle !== title ? ` · ${subtitle}` : ''}
          </Typography>
        </Box>
        <Stack direction='row' alignItems='center' spacing={0.5}>
          {href && (
            <IconButton
              size='small'
              component={Link}
              href={href}
              target='_blank'
              rel='noopener noreferrer'
              aria-label='Open full detail page'
              sx={{ color: 'text.secondary' }}
            >
              <OpenInNewIcon fontSize='small' />
            </IconButton>
          )}
          <IconButton size='small' onClick={onClose} aria-label='Close drawer'>
            <CloseIcon fontSize='small' />
          </IconButton>
        </Stack>
      </Stack>

      {isResource && (
        <ResourceContext
          resourceId={(row as ResourceViewRow).ResourceID}
          unitId={(row as ResourceViewRow).UnitID}
          unitSlug={(row as ResourceViewRow).UnitSlug}
          spaceId={(row as ResourceViewRow).SpaceID}
          spaceSlug={(row as ResourceViewRow).SpaceSlug}
          targetSlug={resourceBody.targetSlug}
          toolchainType={resourceBody.toolchainType}
        />
      )}

      <Tabs
        value={shownTab}
        onChange={(_, v: ActiveTab) => {
          if (v === 'resources') setBodiesWanted(true);
          setActiveTab(v);
        }}
        sx={{ borderBottom: 1, borderColor: 'divider', minHeight: 36 }}
      >
        {isResource && hasOverview && (
          <Tab
            label='Overview'
            value='overview'
            sx={{ minHeight: 36, textTransform: 'none', fontSize: '0.78rem' }}
          />
        )}
        {isResource && (
          <Tab
            label='YAML'
            value='yaml'
            sx={{ minHeight: 36, textTransform: 'none', fontSize: '0.78rem' }}
          />
        )}
        {!isResource && (
          <Tab
            label='Details'
            value='details'
            sx={{ minHeight: 36, textTransform: 'none', fontSize: '0.78rem' }}
          />
        )}
        {supportsResources && (
          <Tab
            label={resourceCount === null ? 'Resources' : `Resources (${resourceCount})`}
            value='resources'
            sx={{ minHeight: 36, textTransform: 'none', fontSize: '0.78rem' }}
          />
        )}
      </Tabs>

      {/* The Resources tab scrolls inside its own detail area, under its bar. */}
      <Box
        sx={{ flex: 1, minHeight: 0, overflow: shownTab === 'resources' ? 'hidden' : 'auto' }}
      >
        {shownTab === 'details' && (
          <DetailsTab row={row} view={view} details={details} href={href} />
        )}
        {shownTab === 'resources' && supportsResources && (
          <ResourcesTab
            rows={unitResources.rows}
            isLoading={unitResources.isLoading}
            error={unitResources.error}
            selectedId={resourceId}
            onSelect={setResourceId}
            view={resourceView}
            onViewChange={setResourceView}
            unitName={title}
          />
        )}
        {(shownTab === 'overview' || shownTab === 'yaml') && isResource && (
          <ResourceContent
            row={row as ResourceViewRow}
            resourceBody={resourceBody}
            view={shownTab}
          />
        )}
      </Box>
    </>
  );
}

interface ResourceBody {
  body: string | undefined;
  toolchainType: string | undefined;
  targetSlug: string | undefined;
  isFetching: boolean;
  isError: boolean;
}

/**
 * The body of a Resource row, in its original toolchain-native form, the
 * toolchain it is in, and the Target of its Unit. The row carries the
 * toolchain and Target only when a column asked for them.
 *
 * Fetched on open rather than carried by every table row: the bodies are bulk
 * and a table has no use for them. It is one row's read, so it is quick.
 */
function useResourceBody(row: ResourceViewRow | null): ResourceBody {
  const { data, isFetching, isError } = useListAllResourcesQuery(
    {
      where: `ResourceID = '${row?.ResourceID}'`,
      select: 'ResourceID,ToolchainType,TargetID',
      include: 'TargetID',
      rawData: true,
    },
    { skip: !row?.ResourceID },
  );
  // Prefer a body the row already carries, so a view fetched with bodies shows
  // one without waiting.
  return {
    body: row?.ResourceBody ?? decodeRawData(data?.[0]?.RawData),
    toolchainType: data?.[0]?.Resource?.ToolchainType ?? row?.UnitToolchainType,
    targetSlug: data?.[0]?.Target?.Slug ?? row?.TargetSlug,
    isFetching,
    isError,
  };
}

/**
 * A Resource row's body, as the resource explorer's Overview or as YAML.
 */
function ResourceContent({
  row,
  resourceBody,
  view,
}: {
  row: ResourceViewRow;
  resourceBody: ResourceBody;
  view: 'overview' | 'yaml';
}) {
  const { body, toolchainType, isFetching, isError } = resourceBody;

  if (isFetching && !body) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', pt: 6 }}>
        <CircularProgress size={24} />
      </Box>
    );
  }
  if (!body) {
    return (
      <Box sx={{ p: 2 }}>
        <Typography variant='body2' color='text.disabled'>
          {isError ? 'Failed to load this resource.' : 'No body available for this resource.'}
        </Typography>
      </Box>
    );
  }
  if (view === 'overview') {
    return <ResourceOverview yaml={body} resourceType={row.ResourceType} />;
  }
  return (
    <Box sx={{ height: '100%', minHeight: 0, p: 1 }}>
      <CodeEditor
        value={body}
        toolchainType={toolchainType ?? 'Kubernetes/YAML'}
        readonly
        // CodeEditor's internal fallback height assumes a full-viewport
        // container. This drawer's paper is offset below the top nav by the
        // theme's MuiDrawer override, so pass the same arithmetic minus the
        // nav to avoid overflowing the shortened paper.
        height={`calc(100vh - ${TOP_NAV_HEIGHT + 220}px)`}
      />
    </Box>
  );
}

/**
 * Renders all view-defined columns as label/value pairs. Mirrors what the user
 * already sees in the row but vertically and without the grid's truncation.
 */
function DetailsTab({
  row,
  view,
  details,
  href,
}: {
  row: GroupNavRow;
  view: ExtendedViewRead | null;
  details?: readonly DetailLine[];
  href?: string;
}) {
  // Include grouped columns here too — they're hidden from the grid but still
  // relevant when inspecting a single row.
  const columns: Column[] = useMemo(() => view?.View?.Columns ?? [], [view?.View?.Columns]);
  const groupByColumns = getGroupByColumns(view?.View);
  const groupBySet = new Set(groupByColumns);

  // Sort: grouped columns first (since they're "where this entity lives"),
  // then the rest in their declared order.
  const ordered: readonly DetailLine[] =
    details ??
    [
      ...columns.filter((c) => groupBySet.has(c.Name)),
      ...columns.filter((c) => !groupBySet.has(c.Name)),
    ].map((c) => ({
      label: c.Name,
      value: getCellValue(row, c.Name),
      mono: true,
    }));

  return (
    <Box sx={{ p: 2 }}>
      <Stack spacing={1.25}>
        {ordered.map(({ label, value, mono }) => (
          <Box
            key={label}
            sx={{
              display: 'grid',
              gridTemplateColumns: '140px minmax(0, 1fr)',
              columnGap: 2,
              alignItems: 'baseline',
            }}
          >
            <Typography variant='body2' color='text.secondary'>
              {label}
            </Typography>
            <Typography
              variant='body1'
              sx={{
                fontFamily: mono ? 'var(--font-mono)' : undefined,
                fontSize: mono ? '0.82rem' : undefined,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}
            >
              {value || (
                <Box component='span' sx={{ color: 'text.disabled' }}>
                  —
                </Box>
              )}
            </Typography>
          </Box>
        ))}
      </Stack>
      {href && (
        <Box sx={{ mt: 2, pt: 2, borderTop: 1, borderColor: 'divider' }}>
          <Link
            href={href}
            target='_blank'
            rel='noopener noreferrer'
            underline='hover'
            sx={{ fontSize: '0.82rem' }}
          >
            Open full detail page ↗
          </Link>
        </Box>
      )}
    </Box>
  );
}

/**
 * The Resources tab lists a Unit's resources by its space + unit IDs.
 * Space-typed rows never reach this path (adapter.supportsResources gates the
 * tab), so we can safely assume Unit row shape here.
 */
function extractUnitIDs(row: GroupNavRow): { spaceID?: string; unitID?: string } {
  // ExtendedUnitRead is the only row shape that exposes a Unit field. Casting
  // is safe because the Resources tab is hidden for non-Unit adapters.
  const unit = (row as { Unit?: { SpaceID?: string; UnitID?: string } }).Unit;
  return { spaceID: unit?.SpaceID, unitID: unit?.UnitID };
}
