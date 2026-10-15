// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { Suspense, lazy, useMemo, useState } from 'react';

import { isKubernetesToolchain } from '@/components/code-editor/language';
import { ResourceOverview } from '@/components/resource-overview/ResourceOverview';
import { UnitResourceRow, useUnitResources } from '@/hooks/useUnitResources';
import { resourceDisplayName } from '@/utility/resource-type-functions';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import List from '@mui/material/List';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemText from '@mui/material/ListItemText';
import Stack from '@mui/material/Stack';
import { SxProps, Theme } from '@mui/material/styles';
import TextField from '@mui/material/TextField';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Typography from '@mui/material/Typography';

// Monaco is the heaviest dependency of the pages that show this; it is fetched the first time
// something shows the YAML.
const CodeEditor = lazy(() =>
  import('@/components/code-editor/CodeEditor').then((m) => ({ default: m.CodeEditor })),
);

/** How the selected resource is shown. */
export type ResourceView = 'overview' | 'yaml';

/** Past this many resources the list gets a box to narrow it by name or type. */
const FILTER_THRESHOLD = 10;

export interface UnitResourceBrowserProps {
  spaceID: string | undefined;
  unitID: string | undefined;
  /** Fetches the resources again when this changes, such as the Unit's head revision number. */
  refreshKey?: unknown;
  /** The ResourceID shown; one the Unit does not have, or empty, shows its first resource. */
  selectedId: string;
  onSelect: (resourceId: string) => void;
  view: ResourceView;
  onViewChange: (view: ResourceView) => void;
  /**
   * `horizontal` puts the list beside the resource, for a page; `vertical` puts it above,
   * for a drawer too narrow for both side by side.
   */
  orientation: 'horizontal' | 'vertical';
  /** Styles for the list and resource together, once there is a resource to show. */
  sx?: SxProps<Theme>;
}

/**
 * Browses the resources in a Unit's configuration: a list of them, and the selected one as an
 * Overview, the friendly view of the resource explorer, or as YAML. The list is left out when
 * the Unit has a single resource. The caller holds the selection and the view, so a page can
 * keep them in its URL.
 */
export function UnitResourceBrowser({
  spaceID,
  unitID,
  refreshKey,
  selectedId,
  onSelect,
  view,
  onViewChange,
  orientation,
  sx,
}: UnitResourceBrowserProps) {
  const [filterText, setFilterText] = useState('');

  const { rows, isLoading, error } = useUnitResources({
    spaceID,
    unitID,
    withBody: true,
    refreshKey,
  });

  const sortedRows = useMemo(() => [...rows].sort(compareResources), [rows]);
  const visibleRows = useMemo(() => {
    const needle = filterText.trim().toLowerCase();
    if (needle === '') return sortedRows;
    return sortedRows.filter(
      (r) =>
        r.ResourceName.toLowerCase().includes(needle) ||
        r.ResourceType.toLowerCase().includes(needle),
    );
  }, [sortedRows, filterText]);

  // A selection the Unit no longer has, such as one deleted by an edit, falls back to the
  // first resource rather than to nothing.
  const selected = sortedRows.find((r) => r.id === selectedId) ?? sortedRows[0];

  // The first load shows a spinner; a refetch after an edit keeps showing what was there.
  if (isLoading && rows.length === 0) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', pt: 6 }}>
        <CircularProgress size={24} />
      </Box>
    );
  }

  if (error) {
    return <Alert severity='error'>{error}</Alert>;
  }

  if (!selected) {
    return (
      <Typography variant='body2' color='text.secondary' sx={{ p: 2 }}>
        This unit's configuration contains no resources.
      </Typography>
    );
  }

  const horizontal = orientation === 'horizontal';

  return (
    <Stack
      direction={horizontal ? 'row' : 'column'}
      data-testid='unit-resources'
      sx={[{ height: '100%', minHeight: 0 }, ...(Array.isArray(sx) ? sx : [sx])]}
    >
      {sortedRows.length > 1 && (
        <Stack
          sx={
            horizontal
              ? { width: 320, flexShrink: 0, minHeight: 0, borderRight: 1, borderColor: 'divider' }
              : { maxHeight: 240, flexShrink: 0, borderBottom: 1, borderColor: 'divider' }
          }
        >
          {sortedRows.length > FILTER_THRESHOLD && (
            <Box sx={{ p: 1, borderBottom: 1, borderColor: 'divider' }}>
              <TextField
                size='small'
                fullWidth
                placeholder={`Filter ${sortedRows.length} resources`}
                value={filterText}
                onChange={(e) => setFilterText(e.target.value)}
                slotProps={{ htmlInput: { 'aria-label': 'Filter resources' } }}
              />
            </Box>
          )}
          <List
            dense
            disablePadding
            aria-label='Resources'
            sx={{ flex: 1, minHeight: 0, overflowY: 'auto' }}
          >
            {visibleRows.map((r) => (
              <ResourceListItem
                key={r.id}
                row={r}
                selected={r.id === selected.id}
                onClick={() => onSelect(r.id)}
              />
            ))}
            {visibleRows.length === 0 && (
              <Typography variant='body2' color='text.secondary' sx={{ p: 2 }}>
                No resources match.
              </Typography>
            )}
          </List>
        </Stack>
      )}
      <ResourceDetail row={selected} view={view} onViewChange={onViewChange} />
    </Stack>
  );
}

function ResourceDetail({
  row,
  view,
  onViewChange,
}: {
  row: UnitResourceRow;
  view: ResourceView;
  onViewChange: (view: ResourceView) => void;
}) {
  // The friendly views are of Kubernetes resources; other configuration is shown as written.
  const hasOverview = isKubernetesToolchain(row.ToolchainType);
  const shown: ResourceView = hasOverview ? view : 'yaml';
  const body = row.ResourceBody;

  return (
    <Stack sx={{ flex: 1, minWidth: 0, minHeight: 0 }}>
      <Stack
        direction='row'
        alignItems='center'
        justifyContent='space-between'
        spacing={2}
        sx={{ px: 2, py: 1, borderBottom: 1, borderColor: 'divider' }}
      >
        <Box sx={{ minWidth: 0 }}>
          <Typography
            variant='subtitle1'
            fontWeight={600}
            noWrap
            data-testid='unit-resource-name'
          >
            {resourceLabel(row)}
          </Typography>
          <Typography
            variant='caption'
            color='text.secondary'
            noWrap
            component='div'
            sx={{ textTransform: 'none', fontFamily: 'monospace' }}
          >
            {row.ResourceType}
          </Typography>
        </Box>
        {hasOverview && (
          <ToggleButtonGroup
            size='small'
            exclusive
            value={shown}
            onChange={(_, v: ResourceView | null) => v && onViewChange(v)}
            aria-label='Resource view'
          >
            <ToggleButton value='overview'>Overview</ToggleButton>
            <ToggleButton value='yaml'>YAML</ToggleButton>
          </ToggleButtonGroup>
        )}
      </Stack>
      <Box sx={{ flex: 1, minHeight: 0, overflow: shown === 'overview' ? 'auto' : 'hidden' }}>
        {body === undefined ? (
          <Alert severity='warning' sx={{ m: 2 }}>
            The configuration of this resource could not be read.
          </Alert>
        ) : shown === 'overview' ? (
          <ResourceOverview yaml={body} resourceType={row.ResourceType} />
        ) : (
          <Suspense
            fallback={
              <Typography sx={{ p: 2 }} variant='body2' color='text.secondary'>
                Loading editor…
              </Typography>
            }
          >
            <CodeEditor
              // A new editor per resource, so one resource's scroll position and folding do
              // not carry over to the next.
              key={row.id}
              value={body}
              toolchainType={row.ToolchainType || undefined}
              readonly
              height='100%'
            />
          </Suspense>
        )}
      </Box>
    </Stack>
  );
}

function ResourceListItem({
  row,
  selected,
  onClick,
}: {
  row: UnitResourceRow;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <ListItemButton selected={selected} onClick={onClick} dense sx={{ py: 0.5 }}>
      <ListItemText
        primary={resourceLabel(row)}
        secondary={resourceKind(row.ResourceType)}
        primaryTypographyProps={{
          variant: 'body2',
          noWrap: true,
          title: resourceLabel(row),
          sx: { fontFamily: 'monospace', fontSize: '0.82rem' },
        }}
        secondaryTypographyProps={{
          variant: 'caption',
          noWrap: true,
          title: row.ResourceType,
          // Kinds are case-sensitive; the caption variant would capitalize them.
          sx: { textTransform: 'none' },
        }}
      />
    </ListItemButton>
  );
}

/** The resource's name, with its index when other resources of the Unit share the name. */
function resourceLabel(row: UnitResourceRow): string {
  const name = resourceDisplayName(row.ResourceName, row.ToolchainType);
  return row.ResourceIndex > 0 ? `${name} [${row.ResourceIndex}]` : name;
}

/** The last segment of a ResourceType: the kind of a Kubernetes resource. */
function resourceKind(resourceType: string): string {
  return resourceType.split('/').pop() || resourceType;
}

/** By kind, as kubectl groups its output, then by name. */
function compareResources(a: UnitResourceRow, b: UnitResourceRow): number {
  return (
    resourceKind(a.ResourceType).localeCompare(resourceKind(b.ResourceType)) ||
    a.ResourceType.localeCompare(b.ResourceType) ||
    a.ResourceName.localeCompare(b.ResourceName) ||
    a.ResourceIndex - b.ResourceIndex
  );
}
