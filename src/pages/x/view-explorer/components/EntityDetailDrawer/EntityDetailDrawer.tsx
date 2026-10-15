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
import { decodeRawData } from '../../hooks/useResourceViewRows';
import { getGroupByColumns } from '../../types';
import { ResourcesTab } from './ResourcesTab';

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
}: {
  row: GroupNavRow;
  view: ExtendedViewRead;
  adapter: EntityAdapter;
  onClose: () => void;
}) {
  const isResource = isResourceViewRow(row);
  // Resource rows open straight on the resource itself, as an Overview, since
  // that's the primary thing the user clicked through to see; they have no
  // Details tab, as their columns are the row itself and the resource. Unit +
  // Space rows show metadata first.
  const [activeTab, setActiveTab] = useState<ActiveTab>(isResource ? 'overview' : 'details');
  const href = adapter.getRowHref(row);
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
            variant='caption'
            color='text.secondary'
            noWrap
            component='div'
            // Kinds are case-sensitive; the caption variant would capitalize them.
            sx={isResource ? { textTransform: 'none', fontFamily: 'monospace' } : undefined}
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
        onChange={(_, v: ActiveTab) => setActiveTab(v)}
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
            label='Resources'
            value='resources'
            sx={{ minHeight: 36, textTransform: 'none', fontSize: '0.78rem' }}
          />
        )}
      </Tabs>

      <Box sx={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
        {shownTab === 'details' && <DetailsTab row={row} view={view} adapter={adapter} />}
        {shownTab === 'resources' && supportsResources && (
          <ResourcesTab spaceID={spaceID} unitID={unitID} />
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
          {isError
            ? 'Failed to load this resource.'
            : 'No body available for this resource.'}
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
  adapter,
}: {
  row: GroupNavRow;
  view: ExtendedViewRead;
  adapter: EntityAdapter;
}) {
  // Include grouped columns here too — they're hidden from the grid but still
  // relevant when inspecting a single row.
  const columns: Column[] = useMemo(() => view.View?.Columns ?? [], [view.View?.Columns]);
  const groupByColumns = getGroupByColumns(view.View);
  const groupBySet = new Set(groupByColumns);

  // Sort: grouped columns first (since they're "where this entity lives"),
  // then the rest in their declared order.
  const ordered = [
    ...columns.filter((c) => groupBySet.has(c.Name)),
    ...columns.filter((c) => !groupBySet.has(c.Name)),
  ];

  return (
    <Box sx={{ p: 2 }}>
      <Stack spacing={1.25}>
        {ordered.map((col) => {
          const value = getCellValue(row, col.Name);
          return (
            <Box key={col.Name}>
              <Typography
                variant='caption'
                color='text.secondary'
                sx={{
                  display: 'block',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  fontSize: '0.68rem',
                }}
              >
                {col.Name}
              </Typography>
              <Typography
                variant='body2'
                sx={{
                  fontFamily: 'monospace',
                  fontSize: '0.82rem',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                }}
              >
                {value || <Box component='span' sx={{ color: 'text.disabled' }}>—</Box>}
              </Typography>
            </Box>
          );
        })}
      </Stack>
      {adapter.getRowHref(row) && (
        <Box sx={{ mt: 2, pt: 2, borderTop: 1, borderColor: 'divider' }}>
          <Link
            href={adapter.getRowHref(row)}
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
