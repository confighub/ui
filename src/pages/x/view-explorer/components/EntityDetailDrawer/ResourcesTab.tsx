// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { type KeyboardEvent, Suspense, lazy, useMemo, useRef, useState } from 'react';

import { isKubernetesToolchain } from '@/components/code-editor/language';
import { ResourceOverview } from '@/components/resource-overview/ResourceOverview';
import type { ResourceView } from '@/components/unit-resources/UnitResourceBrowser';
import {
  compareResources,
  resourceKind,
  resourceLabel,
} from '@/components/unit-resources/resourceRows';
import type { UnitResourceRow } from '@/hooks/useUnitResources';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import SearchIcon from '@mui/icons-material/Search';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import ButtonBase from '@mui/material/ButtonBase';
import CircularProgress from '@mui/material/CircularProgress';
import IconButton from '@mui/material/IconButton';
import InputAdornment from '@mui/material/InputAdornment';
import ListSubheader from '@mui/material/ListSubheader';
import MenuItem from '@mui/material/MenuItem';
import MenuList from '@mui/material/MenuList';
import Popover from '@mui/material/Popover';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';

// Monaco is the heaviest part of the panel; it is fetched the first time YAML is shown.
const CodeEditor = lazy(() =>
  import('@/components/code-editor/CodeEditor').then((m) => ({ default: m.CodeEditor })),
);

/**
 * The Resources tab of the row panel: one compact bar names the resource on
 * show ("‹ ui · Deployment   1 of 4 ▾ ›") and steps through the others, and
 * the resource itself gets the rest of the panel, as its only scroll area.
 * The full list is a dropdown from the bar, grouped by kind.
 */

/** Past this many resources the dropdown gets a box to narrow it by name or kind. */
const SEARCH_THRESHOLD = 8;

export interface ResourcesTabProps {
  rows: readonly UnitResourceRow[];
  isLoading: boolean;
  error: string | null;
  /** The ResourceID shown; one the Unit does not have, or empty, shows its first resource. */
  selectedId: string;
  onSelect: (resourceId: string) => void;
  view: ResourceView;
  onViewChange: (view: ResourceView) => void;
  /** The Unit's name: what a resource without a name of its own (non-Kubernetes data) is called. */
  unitName: string;
}

interface ResourceWords {
  name: string;
  namespace: string;
  /** The kind, or for non-Kubernetes data the format ("Properties"). */
  kind: string;
  /** The apiVersion ("apps/v1"), or for non-Kubernetes data the toolchain. */
  version: string;
}

/**
 * How a resource is named on the bar and in the dropdown. Non-Kubernetes data
 * (an AppConfig Unit, say) has one resource that the server calls NoName of
 * type NoSchema; it is shown as the Unit, in its format, instead.
 */
function describeResource(row: UnitResourceRow, unitName: string): ResourceWords {
  if (!isKubernetesToolchain(row.ToolchainType)) {
    const toolchain = row.ToolchainType || 'Configuration';
    const own = row.ResourceName && row.ResourceName !== 'NoName' ? resourceLabel(row) : '';
    return {
      name: own || unitName,
      namespace: '',
      kind: toolchain.split('/').pop() || toolchain,
      version: toolchain,
    };
  }
  const label = resourceLabel(row);
  const slash = label.lastIndexOf('/');
  const kind = resourceKind(row.ResourceType);
  const version = row.ResourceType.slice(
    0,
    Math.max(0, row.ResourceType.length - kind.length - 1),
  );
  return slash > 0
    ? { name: label.slice(slash + 1), namespace: label.slice(0, slash), kind, version }
    : { name: label, namespace: '', kind, version };
}

interface KindGroup {
  kind: string;
  rows: UnitResourceRow[];
}

function groupByKind(rows: readonly UnitResourceRow[], unitName: string): KindGroup[] {
  const groups: KindGroup[] = [];
  for (const r of rows) {
    const { kind } = describeResource(r, unitName);
    const last = groups[groups.length - 1];
    if (last?.kind === kind) last.rows.push(r);
    else groups.push({ kind, rows: [r] });
  }
  return groups;
}

/** The resource's name, its kind (left out under a kind heading), and quietly its namespace. */
function ResourceName({
  row,
  unitName,
  withKind = true,
}: {
  row: UnitResourceRow;
  unitName: string;
  withKind?: boolean;
}) {
  const { name, namespace, kind } = describeResource(row, unitName);
  return (
    <Box
      component='span'
      sx={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
    >
      <Box
        component='span'
        sx={{ fontWeight: 700, color: 'text.primary' }}
        data-testid='unit-resource-name'
      >
        {name}
      </Box>
      {withKind && (
        <Box component='span' sx={{ color: 'text.secondary' }}>
          {' · '}
          {kind}
        </Box>
      )}
      {namespace && (
        <Box component='span' sx={{ color: 'text.disabled' }}>
          {' in '}
          {namespace}
        </Box>
      )}
    </Box>
  );
}

interface PickerProps {
  anchor: HTMLElement;
  rows: readonly UnitResourceRow[];
  selected: UnitResourceRow;
  unitName: string;
  onPick: (id: string) => void;
  onClose: () => void;
}

/** The dropdown of every resource, grouped by kind, with a search box for long lists. */
function ResourcePicker({ anchor, rows, selected, unitName, onPick, onClose }: PickerProps) {
  const [query, setQuery] = useState('');
  const listRef = useRef<HTMLUListElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const searchable = rows.length > SEARCH_THRESHOLD;
  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const shown = q
      ? rows.filter(
          (r) =>
            resourceLabel(r).toLowerCase().includes(q) ||
            r.ResourceType.toLowerCase().includes(q),
        )
      : rows;
    return groupByKind(shown, unitName);
  }, [rows, query, unitName]);
  const firstItem = () => listRef.current?.querySelector<HTMLElement>('[role="menuitem"]');

  return (
    <Popover
      open
      anchorEl={anchor}
      onClose={onClose}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
      slotProps={{
        paper: {
          sx: {
            width: Math.max(anchor.offsetWidth, 300),
            maxHeight: 'min(420px, 60vh)',
            display: 'flex',
            flexDirection: 'column',
          },
        },
      }}
      data-testid='vx-resource-menu'
      // Keys typed here are the dropdown's. React passes them on through the portal to the
      // panel, whose ↑/↓ step table rows and whose Esc closes it; they stop at this root,
      // after the Popover has had them (so its Esc still closes it).
      onKeyDown={(e: KeyboardEvent<HTMLElement>) => e.stopPropagation()}
    >
      {searchable && (
        <Box sx={{ p: 1, borderBottom: 1, borderColor: 'divider' }}>
          <TextField
            size='small'
            fullWidth
            autoFocus
            placeholder={`Find in ${rows.length} resources`}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                firstItem()?.focus();
              }
              if (e.key === 'Enter') {
                const first = groups[0]?.rows[0];
                if (first) onPick(first.id);
              }
            }}
            inputRef={searchRef}
            slotProps={{
              htmlInput: { 'aria-label': 'Find a resource' },
              input: {
                startAdornment: (
                  <InputAdornment position='start'>
                    <SearchIcon fontSize='small' />
                  </InputAdornment>
                ),
              },
            }}
          />
        </Box>
      )}
      <MenuList
        ref={listRef}
        dense
        autoFocusItem={!searchable}
        aria-label='Resources'
        onKeyDown={(e) => {
          // ↑ from the first item goes back up to the search box.
          if (e.key === 'ArrowUp' && searchable && e.target === firstItem()) {
            e.preventDefault();
            searchRef.current?.focus();
          }
        }}
        sx={{ flex: 1, minHeight: 0, overflow: 'auto', py: 0.5 }}
      >
        {groups.length === 0 && (
          <Typography variant='body2' color='text.secondary' sx={{ px: 2, py: 1.5 }}>
            No resources match.
          </Typography>
        )}
        {groups.flatMap((g) => [
          <ListSubheader
            key={`kind-${g.kind}`}
            sx={{
              lineHeight: '28px',
              px: 1.5,
              fontSize: 12,
              fontWeight: 700,
              color: 'text.secondary',
              bgcolor: 'background.paper',
            }}
          >
            {g.kind}{' '}
            <Box component='span' sx={{ color: 'text.disabled', fontWeight: 500 }}>
              {g.rows.length}
            </Box>
          </ListSubheader>,
          ...g.rows.map((r) => (
            <MenuItem
              key={r.id}
              selected={r.id === selected.id}
              autoFocus={!searchable && r.id === selected.id}
              onClick={() => onPick(r.id)}
              data-resource-id={r.id}
              sx={{ pl: 3 }}
            >
              <ResourceName row={r} unitName={unitName} withKind={false} />
            </MenuItem>
          )),
        ])}
      </MenuList>
    </Popover>
  );
}

export function ResourcesTab({
  rows,
  isLoading,
  error,
  selectedId,
  onSelect,
  view,
  onViewChange,
  unitName,
}: ResourcesTabProps) {
  const sorted = useMemo(() => [...rows].sort(compareResources), [rows]);
  const [pickerAnchor, setPickerAnchor] = useState<HTMLElement | null>(null);

  if (isLoading && rows.length === 0) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', pt: 6 }}>
        <CircularProgress size={24} />
      </Box>
    );
  }
  if (error)
    return (
      <Alert severity='error' sx={{ m: 2 }}>
        {error}
      </Alert>
    );

  const index = Math.max(
    0,
    sorted.findIndex((r) => r.id === selectedId),
  );
  const selected = sorted[index];
  if (!selected) {
    return (
      <Box sx={{ p: 3 }} data-testid='vx-resources-empty'>
        <Typography variant='body1' color='text.primary'>
          No resources
        </Typography>
        <Typography variant='body2' color='text.secondary' sx={{ mt: 0.5 }}>
          This Unit's configuration has nothing that becomes a resource.
        </Typography>
      </Box>
    );
  }

  const many = sorted.length > 1;
  const step = (delta: number) => {
    const next = sorted[(index + delta + sorted.length) % sorted.length];
    if (next) onSelect(next.id);
  };
  const onBarKey = (e: KeyboardEvent<HTMLElement>) => {
    if (!many || e.altKey || e.metaKey || e.ctrlKey) return;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();
      step(e.key === 'ArrowLeft' ? -1 : 1);
    }
  };

  // The friendly views are of Kubernetes resources; other configuration is shown as written.
  const hasOverview = isKubernetesToolchain(selected.ToolchainType);
  const shown: ResourceView = hasOverview ? view : 'yaml';
  const body = selected.ResourceBody;

  return (
    <Stack sx={{ height: '100%', minHeight: 0 }} data-testid='unit-resources'>
      <Box
        role='group'
        aria-label='Resource'
        tabIndex={-1}
        onKeyDown={onBarKey}
        data-testid='vx-resource-bar'
        sx={{ px: 1, pt: 1, pb: 0.75, borderBottom: 1, borderColor: 'divider', flexShrink: 0 }}
      >
        <Stack direction='row' alignItems='center' spacing={0.5} sx={{ minWidth: 0 }}>
          {many && (
            <Tooltip
              title='Previous resource (←)'
              placement='top'
              disableInteractive
              enterDelay={400}
            >
              <IconButton
                size='small'
                aria-label='Previous resource'
                data-testid='vx-resource-prev'
                onClick={() => step(-1)}
              >
                <ChevronLeftIcon fontSize='small' />
              </IconButton>
            </Tooltip>
          )}
          <ButtonBase
            disabled={!many}
            onClick={(e) => setPickerAnchor(e.currentTarget)}
            aria-haspopup={many ? 'menu' : undefined}
            aria-expanded={!!pickerAnchor}
            aria-label={
              many
                ? `Resource ${index + 1} of ${sorted.length}: ${resourceLabel(selected)}. Choose another`
                : undefined
            }
            data-testid='vx-resource-picker'
            sx={{
              flex: 1,
              minWidth: 0,
              justifyContent: 'space-between',
              gap: 1,
              height: 32,
              px: 1,
              borderRadius: 1,
              fontSize: 13.5,
              textAlign: 'left',
              '&:hover': { bgcolor: many ? 'action.hover' : 'transparent' },
              '&.Mui-disabled': { color: 'inherit' },
              '&.Mui-focusVisible': { outline: 2, outlineColor: 'primary.main' },
            }}
          >
            <ResourceName row={selected} unitName={unitName} />
            {many && (
              <Box
                component='span'
                sx={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 0.25,
                  flexShrink: 0,
                  color: 'text.secondary',
                  fontSize: 12.5,
                  fontVariantNumeric: 'tabular-nums',
                }}
                data-testid='vx-resource-position'
              >
                {index + 1} of {sorted.length}
                <ExpandMoreIcon sx={{ fontSize: 16 }} />
              </Box>
            )}
          </ButtonBase>
          {many && (
            <Tooltip
              title='Next resource (→)'
              placement='top'
              disableInteractive
              enterDelay={400}
            >
              <IconButton
                size='small'
                aria-label='Next resource'
                data-testid='vx-resource-next'
                onClick={() => step(1)}
              >
                <ChevronRightIcon fontSize='small' />
              </IconButton>
            </Tooltip>
          )}
        </Stack>
        <Stack
          direction='row'
          alignItems='center'
          justifyContent='space-between'
          spacing={1}
          sx={{ pl: many ? 5 : 1, pr: 0.5, pt: 0.5, minWidth: 0 }}
        >
          <Typography
            variant='body2'
            color='text.disabled'
            noWrap
            sx={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}
            title={selected.ResourceType}
            data-testid='vx-resource-version'
          >
            {describeResource(selected, unitName).version}
          </Typography>
          {hasOverview && (
            <ToggleButtonGroup
              size='small'
              exclusive
              value={shown}
              onChange={(_, v: ResourceView | null) => v && onViewChange(v)}
              aria-label='Resource view'
            >
              <ToggleButton value='overview' sx={{ py: 0.25, px: 1.25, fontSize: 12.5 }}>
                Overview
              </ToggleButton>
              <ToggleButton value='yaml' sx={{ py: 0.25, px: 1.25, fontSize: 12.5 }}>
                YAML
              </ToggleButton>
            </ToggleButtonGroup>
          )}
        </Stack>
      </Box>
      {pickerAnchor && (
        <ResourcePicker
          anchor={pickerAnchor}
          rows={sorted}
          selected={selected}
          unitName={unitName}
          onPick={(id) => {
            setPickerAnchor(null);
            onSelect(id);
          }}
          onClose={() => setPickerAnchor(null)}
        />
      )}
      <Box
        data-testid='vx-resource-detail'
        sx={{
          flex: 1,
          minHeight: 0,
          overflow: shown === 'overview' ? 'auto' : 'hidden',
          // The shared overview, set in this panel's type: sentence-case labels and the page
          // font for values; the code font stays for YAML.
          '& .MuiTypography-overline': {
            textTransform: 'none',
            letterSpacing: 0,
            fontSize: 13,
            fontWeight: 700,
            color: 'text.primary',
            lineHeight: 2.2,
          },
          '& .MuiTypography-caption': {
            textTransform: 'none',
            letterSpacing: 0,
            fontSize: 12.5,
            fontWeight: 400,
          },
          '& span.MuiTypography-body2': { fontFamily: 'inherit', fontSize: 13 },
          '& .MuiChip-root': { fontFamily: 'inherit' },
        }}
      >
        {body === undefined && isLoading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', pt: 4 }}>
            <CircularProgress size={20} />
          </Box>
        ) : body === undefined ? (
          <Alert severity='warning' sx={{ m: 2 }}>
            The configuration of this resource could not be read.
          </Alert>
        ) : shown === 'overview' ? (
          <Box sx={{ p: 2 }}>
            <ResourceOverview yaml={body} resourceType={selected.ResourceType} />
          </Box>
        ) : (
          <Suspense
            fallback={
              <Typography sx={{ p: 2 }} variant='body2' color='text.secondary'>
                Loading editor…
              </Typography>
            }
          >
            <CodeEditor
              key={selected.id}
              value={body}
              toolchainType={selected.ToolchainType || undefined}
              readonly
              height='100%'
            />
          </Suspense>
        )}
      </Box>
    </Stack>
  );
}
