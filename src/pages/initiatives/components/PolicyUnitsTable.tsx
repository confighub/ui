// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { Fragment, useId, useMemo, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';

import { plural } from '@/pages/change-orders/changeOrderHistory';
import { NameList } from '@/pages/change-orders/components/SpaceListing';
import type { ComponentRead, ValidationResultList } from '@confighub/rtk-query';
import ChevronRight from '@mui/icons-material/ChevronRight';
import ExpandMore from '@mui/icons-material/ExpandMore';
import OpenInNew from '@mui/icons-material/OpenInNew';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import Chip from '@mui/material/Chip';
import IconButton from '@mui/material/IconButton';
import Link from '@mui/material/Link';
import MenuItem from '@mui/material/MenuItem';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import TextField from '@mui/material/TextField';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';

import { componentLink, spaceLink, targetLink, unitLink } from '../validationLinks';
import {
  NOT_EVALUATED_TEXT,
  type OutcomeCounts,
  type PolicyUnit,
  type ScopeSpace,
  type ScopeTarget,
  type UnitOutcome,
  type ValidationPolicy,
  emptyCounts,
  failedResources,
  failingOf,
  failureMessages,
} from '../validationModel';

export type UnitFilter = 'Failing' | 'Passed' | 'NotEvaluated' | 'All';
type GroupBy = 'ComponentSpace' | 'Space' | 'None';

const OUTCOME_CHIP: Record<UnitOutcome, { label: string; bg: string; color: string }> = {
  Error: { label: 'Error', bg: '#fde7e7', color: '#b71c1c' },
  Warning: { label: 'Warning', bg: '#fff3e0', color: '#b45309' },
  Passed: { label: 'Passed', bg: '#e8f5e9', color: '#1b5e20' },
  NotEvaluated: { label: 'Not evaluated', bg: '#f5f5f5', color: '#757575' },
};

const OUTCOME_ORDER: Record<UnitOutcome, number> = {
  Error: 0,
  Warning: 1,
  NotEvaluated: 2,
  Passed: 3,
};

const matches = (filter: UnitFilter, outcome: UnitOutcome): boolean =>
  filter === 'All' ||
  (filter === 'Failing' && (outcome === 'Error' || outcome === 'Warning')) ||
  filter === outcome;

/** A group's key, the name shown, and where the name links. */
type GroupKey = [string, string, string | undefined];

const COLUMNS = 7;

interface Group {
  key: string;
  name: string;
  href?: string;
  /** Second-level groups, when grouping by Component and Space. */
  children?: Group[];
  units: PolicyUnit[];
  counts: OutcomeCounts;
}

const countsOf = (units: PolicyUnit[]): OutcomeCounts => {
  const c = emptyCounts();
  for (const u of units) {
    c.total++;
    if (u.outcome === 'Passed') c.passed++;
    else if (u.outcome === 'Warning') c.warning++;
    else if (u.outcome === 'Error') c.error++;
    else c.notEvaluated++;
  }
  return c;
};

/** Failing groups first, then by name. */
const compareGroups = (a: Group, b: Group) =>
  failingOf(b.counts) - failingOf(a.counts) || a.name.localeCompare(b.name);

const groupUnits = (units: PolicyUnit[], keyOf: (u: PolicyUnit) => GroupKey): Group[] => {
  const byKey = new Map<string, { name: string; href?: string; units: PolicyUnit[] }>();
  for (const u of units) {
    const [key, name, href] = keyOf(u);
    const g = byKey.get(key) ?? { name, href, units: [] };
    g.units.push(u);
    byKey.set(key, g);
  }
  return [...byKey.entries()]
    .map(([key, g]) => ({
      key,
      name: g.name,
      href: g.href,
      units: g.units,
      counts: countsOf(g.units),
    }))
    .sort(compareGroups);
};

const countsText = (c: OutcomeCounts): string => {
  const parts = [];
  if (c.error > 0) parts.push(plural(c.error, 'error'));
  if (c.warning > 0) parts.push(plural(c.warning, 'warning'));
  if (c.passed > 0) parts.push(`${c.passed} passed`);
  if (c.notEvaluated > 0) parts.push(`${c.notEvaluated} not evaluated`);
  return parts.join(' · ');
};

interface PolicyUnitsTableProps {
  policy: ValidationPolicy;
  spaceById: Map<string, ScopeSpace>;
  targetById: Map<string, ScopeTarget>;
  componentById: Map<string, ComponentRead>;
  /** The Trigger's results on each failing Unit, by UnitID, once loaded. */
  resultsByUnit: Map<string, ValidationResultList>;
  /** The results could not be read, so a failing Unit's resources are not known. */
  resultsUnavailable?: boolean;
  filter: UnitFilter;
  onFilterChange: (filter: UnitFilter) => void;
  /** The Units checked, for the function invoker and for Evaluate. */
  selectedIds: ReadonlySet<string>;
  onSelectionChange: (unitIds: string[]) => void;
  /** Opens the exception dialog for a failing Unit; absent when the Trigger names no exception. */
  onExcept?: (unit: PolicyUnit) => void;
}

/**
 * The Units a validating Trigger applies to, grouped by Component and Space, with how each fared
 * and, for a failing one, the resources it failed on. The details of a failure are on the Unit's
 * own page, which each row opens in a new tab.
 */
export const PolicyUnitsTable = ({
  policy,
  spaceById,
  targetById,
  componentById,
  resultsByUnit,
  resultsUnavailable = false,
  filter,
  onFilterChange,
  selectedIds,
  onSelectionChange,
  onExcept,
}: PolicyUnitsTableProps) => {
  const [groupBy, setGroupBy] = useState<GroupBy>('ComponentSpace');
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const tableId = useId();

  const counts = policy.unitCounts;
  const filterCounts: Record<UnitFilter, number> = {
    Failing: failingOf(counts),
    Passed: counts.passed,
    NotEvaluated: counts.notEvaluated,
    All: counts.total,
  };

  const shown = useMemo(
    () =>
      policy.units
        .filter((u) => matches(filter, u.outcome))
        .sort(
          (a, b) =>
            OUTCOME_ORDER[a.outcome] - OUTCOME_ORDER[b.outcome] ||
            a.unit.slug.localeCompare(b.unit.slug),
        ),
    [policy.units, filter],
  );

  const spaceKey = (u: PolicyUnit): GroupKey => {
    const s = spaceById.get(u.unit.spaceId);
    return [u.unit.spaceId, s?.slug ?? 'Unknown Space', spaceLink(u.unit.spaceId)];
  };
  const componentKey = (u: PolicyUnit): GroupKey => {
    const id = spaceById.get(u.unit.spaceId)?.componentId;
    const c = id ? componentById.get(id) : undefined;
    return id
      ? [
          id,
          c?.DisplayName || c?.Slug || 'Unknown Component',
          c?.Slug ? componentLink(c.Slug) : undefined,
        ]
      : ['', 'No Component', undefined];
  };

  const shownIds = shown.map((u) => u.unit.id);
  const allShownSelected = shownIds.length > 0 && shownIds.every((id) => selectedIds.has(id));
  const someShownSelected = shownIds.some((id) => selectedIds.has(id));
  const toggleUnit = (id: string) =>
    onSelectionChange(
      selectedIds.has(id) ? [...selectedIds].filter((x) => x !== id) : [...selectedIds, id],
    );
  const toggleAllShown = () =>
    onSelectionChange(
      allShownSelected
        ? [...selectedIds].filter((id) => !shownIds.includes(id))
        : [...new Set([...selectedIds, ...shownIds])],
    );

  const groups: Group[] | undefined = useMemo(() => {
    if (groupBy === 'None') return undefined;
    if (groupBy === 'Space') return groupUnits(shown, spaceKey);
    return groupUnits(shown, componentKey).map((g) => ({
      ...g,
      children: groupUnits(g.units, spaceKey).map((c) => ({ ...c, key: `${g.key}/${c.key}` })),
    }));
    // spaceKey and componentKey read only the maps listed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupBy, shown, spaceById, componentById]);

  const toggleGroup = (key: string) =>
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const unitRow = (u: PolicyUnit) => {
    const space = spaceById.get(u.unit.spaceId);
    const target = u.unit.targetId ? targetById.get(u.unit.targetId) : undefined;
    const results = resultsByUnit.get(u.unit.id);
    const resources = failedResources(results);
    const messages = failureMessages(results);
    const chip = OUTCOME_CHIP[u.outcome];
    const failing = u.outcome === 'Error' || u.outcome === 'Warning';
    return (
      <TableRow
        key={u.unit.id}
        hover
        selected={selectedIds.has(u.unit.id)}
        data-testid='validation-unit-row'
      >
        <TableCell padding='checkbox'>
          <Checkbox
            size='small'
            checked={selectedIds.has(u.unit.id)}
            onChange={() => toggleUnit(u.unit.id)}
            inputProps={{ 'aria-label': `Select ${space?.slug ?? ''}/${u.unit.slug}` }}
          />
        </TableCell>
        <TableCell sx={{ pl: groupBy === 'ComponentSpace' ? 5 : groupBy === 'Space' ? 3 : 1 }}>
          <Link
            component={RouterLink}
            to={unitLink(u.unit.spaceId, u.unit.id)}
            target='_blank'
            rel='noopener'
            underline='hover'
            sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, fontWeight: 500 }}
          >
            {u.unit.slug}
            <OpenInNew sx={{ fontSize: 13, opacity: 0.6 }} aria-label='opens in a new tab' />
          </Link>
        </TableCell>
        <TableCell>
          <EntityLink to={spaceLink(u.unit.spaceId)} text={space?.slug ?? ''} />
        </TableCell>
        <TableCell>
          {target && <EntityLink to={targetLink(target.id)} text={target.slug} />}
        </TableCell>
        <TableCell>
          <Chip
            label={chip.label}
            size='small'
            sx={{
              height: 20,
              fontSize: '0.7rem',
              fontWeight: 600,
              bgcolor: chip.bg,
              color: chip.color,
            }}
          />
        </TableCell>
        <TableCell sx={{ maxWidth: 420 }}>
          {failing && (
            <ResourcesCell
              resources={resources.map((r) => r.name)}
              messages={messages}
              loaded={!!results}
              unavailable={resultsUnavailable}
            />
          )}
          {u.reason && (
            <Typography
              variant='body2'
              fontSize='0.75rem'
              color='text.secondary'
              data-testid='not-evaluated-reason'
            >
              {NOT_EVALUATED_TEXT[u.reason]}
              {u.unit.headRevisionNum !== undefined && u.reason !== 'TriggerDisabled' && (
                <>
                  {' '}
                  Head Revision {u.unit.headRevisionNum}
                  {u.unit.lastChangeDescription ? `: ${u.unit.lastChangeDescription}` : ''}.
                </>
              )}
            </Typography>
          )}
        </TableCell>
        <TableCell align='right'>
          {failing && onExcept && (
            <Button
              size='small'
              onClick={() => onExcept(u)}
              sx={{ textTransform: 'none', whiteSpace: 'nowrap' }}
            >
              Except…
            </Button>
          )}
        </TableCell>
      </TableRow>
    );
  };

  const groupRow = (g: Group, depth: number) => {
    const open = !collapsedGroups.has(g.key);
    const bodyId = `${tableId}-${g.key}`;
    return (
      <TableRow
        key={`group-${g.key}`}
        sx={{ bgcolor: depth === 0 ? 'grey.50' : 'transparent' }}
      >
        <TableCell colSpan={COLUMNS} sx={{ py: 0.75, pl: 1 + depth * 2.5 }}>
          <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75 }}>
            <IconButton
              size='small'
              onClick={() => toggleGroup(g.key)}
              aria-expanded={open}
              aria-controls={bodyId}
              aria-label={`${open ? 'Collapse' : 'Expand'} ${g.name}`}
              sx={{ p: 0.25 }}
            >
              {open ? <ExpandMore fontSize='small' /> : <ChevronRight fontSize='small' />}
            </IconButton>
            {g.href ? (
              <Link
                component={RouterLink}
                to={g.href}
                underline='hover'
                variant='body2'
                fontWeight={600}
              >
                {g.name}
              </Link>
            ) : (
              <Typography variant='body2' fontWeight={600}>
                {g.name}
              </Typography>
            )}
            <Typography variant='body2' fontSize='0.75rem' color='text.secondary'>
              {plural(g.units.length, 'Unit')} · {countsText(g.counts)}
            </Typography>
          </Box>
        </TableCell>
      </TableRow>
    );
  };

  const renderGroup = (g: Group, depth: number): React.ReactNode => (
    <Fragment key={g.key}>
      {groupRow(g, depth)}
      {!collapsedGroups.has(g.key) &&
        (g.children ? g.children.map((c) => renderGroup(c, depth + 1)) : g.units.map(unitRow))}
    </Fragment>
  );

  return (
    <Box data-testid='validation-units'>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 1.5, flexWrap: 'wrap' }}>
        <ToggleButtonGroup
          size='small'
          exclusive
          value={filter}
          onChange={(_, v: UnitFilter | null) => v && onFilterChange(v)}
          aria-label='Which Units to show'
          sx={{ '& .MuiToggleButton-root': { textTransform: 'none', px: 1.5, py: 0.25 } }}
        >
          <ToggleButton value='Failing'>Failing ({filterCounts.Failing})</ToggleButton>
          <ToggleButton value='Passed'>Passed ({filterCounts.Passed})</ToggleButton>
          <ToggleButton value='NotEvaluated'>
            Not evaluated ({filterCounts.NotEvaluated})
          </ToggleButton>
          <ToggleButton value='All'>All ({filterCounts.All})</ToggleButton>
        </ToggleButtonGroup>
        <TextField
          select
          size='small'
          label='Group by'
          value={groupBy}
          onChange={(e) => setGroupBy(e.target.value as GroupBy)}
          sx={{ minWidth: 190 }}
        >
          <MenuItem value='ComponentSpace'>Component, then Space</MenuItem>
          <MenuItem value='Space'>Space</MenuItem>
          <MenuItem value='None'>None</MenuItem>
        </TextField>
      </Box>
      <TableContainer
        sx={{
          maxHeight: 640,
          // Its border inside its width, so it fits the page rather than scrolling it sideways.
          boxSizing: 'border-box',
          border: '1px solid',
          borderColor: 'divider',
          borderRadius: 1,
          bgcolor: 'background.paper',
        }}
      >
        <Table size='small' stickyHeader>
          <TableHead>
            <TableRow>
              <TableCell padding='checkbox'>
                <Checkbox
                  size='small'
                  checked={allShownSelected}
                  indeterminate={someShownSelected && !allShownSelected}
                  onChange={toggleAllShown}
                  inputProps={{ 'aria-label': 'Select the Units shown' }}
                />
              </TableCell>
              <TableCell>Unit</TableCell>
              <TableCell>Space</TableCell>
              <TableCell>Target</TableCell>
              <TableCell>Result</TableCell>
              <TableCell>Details</TableCell>
              <TableCell />
            </TableRow>
          </TableHead>
          <TableBody>
            {shown.length === 0 ? (
              <TableRow>
                <TableCell colSpan={COLUMNS}>
                  <Typography
                    variant='body2'
                    color='text.secondary'
                    sx={{ py: 2, textAlign: 'center' }}
                  >
                    {filter === 'Failing' ? 'No Unit fails this Trigger.' : 'No Units.'}
                  </Typography>
                </TableCell>
              </TableRow>
            ) : groups ? (
              groups.map((g) => renderGroup(g, 0))
            ) : (
              shown.map(unitRow)
            )}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
};

/** A failing Unit's resources, the first few by name and the rest behind "+N more", with why. */
const ResourcesCell = ({
  resources,
  messages,
  loaded,
  unavailable,
}: {
  resources: string[];
  messages: string[];
  loaded: boolean;
  unavailable: boolean;
}) => {
  if (!loaded) {
    return (
      <Typography variant='body2' fontSize='0.75rem' color='text.disabled'>
        {unavailable ? 'Could not read the results; open the Unit for them.' : 'Loading…'}
      </Typography>
    );
  }
  if (resources.length === 0) {
    return (
      <Typography variant='body2' fontSize='0.75rem' color='text.secondary'>
        {messages[0] ?? 'Failed as a whole'}
      </Typography>
    );
  }
  const tooltip = messages.join('\n');
  return (
    <Tooltip
      title={tooltip ? <Box sx={{ whiteSpace: 'pre-line' }}>{tooltip}</Box> : ''}
      placement='top-start'
    >
      <Box component='span' sx={{ fontSize: '0.75rem' }}>
        <NameList names={resources} noun='resource' />
      </Box>
    </Tooltip>
  );
};

/** The name of another entity, linked to its page. */
const EntityLink = ({ to, text }: { to: string; text: string }) => (
  <Link component={RouterLink} to={to} underline='hover' variant='body2'>
    {text}
  </Link>
);
