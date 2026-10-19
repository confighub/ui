// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { useCallback, useMemo, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';

import { useComponentSlugs } from '@/hooks/useComponentSlugs';
import type { ExtendedSpaceRead } from '@confighub/rtk-query';
import CloseIcon from '@mui/icons-material/Close';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import Paper from '@mui/material/Paper';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableFooter from '@mui/material/TableFooter';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { alpha, useTheme } from '@mui/material/styles';

import { ComponentActivityFeed } from './ComponentActivityFeed';
import { type SelectedApp } from './appTypes';
import { buildOverviewData, type ComponentKpiRow, type OrgKpiSummary } from './componentOverview';
import { useOutstandingChangeOrderBaseSpaceIds } from './change-order/useOutstandingChangeOrdersBulk';
import { useOpenChangeSets } from './useOpenChangeSets';
import { useRunningReleases } from './useRunningReleases';
import { changeSetPath } from '../../change-sets/changeSetAddress';

// ============================================================================
// TYPES
// ============================================================================

interface ComponentOverviewMatrixProps {
  spaces: ExtendedSpaceRead[];
  onComponentSelect: (app: SelectedApp) => void;
}

type FilterKey =
  | 'unapplied'
  | 'gatesPending'
  | 'liveProblems'
  | 'upgrades'
  | 'outstandingChangeOrder'
  | 'openChangeSet';

type SortKey = 'health' | 'componentName' | FilterKey;

interface ColDef {
  key: FilterKey;
  /** Two words, one to a line, so the column stays narrow. */
  label: string;
  subLabel: string;
  sevColor: 'error.main' | 'warning.main' | 'info.main' | 'success.main';
  /** The column's figure in the org roll-up. */
  orgField: keyof OrgKpiSummary;
}

interface HeatStyle {
  bgcolor?: string;
  color?: string;
  fontWeight?: number;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const MONO_FONT = '"JetBrains Mono", ui-monospace, monospace';

type NumericKpiKey = 'unapplied' | 'gatesPending' | 'upgrades';

/** Width of each KPI column, which leaves the rest of the row to the Component column. */
const KPI_COL_WIDTH = 112;

/**
 * How often the running Releases are re-read: a reporter writes a Release's live
 * status at its own pace, and nothing in this application is told when.
 */
const RUNNING_RELEASE_POLL_MS = 30_000;

/** The KPI columns, left to right. */
const COL_DEFS: ColDef[] = [
  { key: 'gatesPending',           label: 'Blocking Gates',           subLabel: 'blocked',       sevColor: 'error.main',   orgField: 'gatesPending'            },
  { key: 'unapplied',              label: 'Unreleased Changes',       subLabel: 'pending',       sevColor: 'warning.main', orgField: 'unapplied'               },
  { key: 'liveProblems',           label: 'Release Problems',         subLabel: 'sync / health', sevColor: 'error.main',   orgField: 'liveProblems'            },
  { key: 'upgrades',               label: 'Upgrades Available',       subLabel: 'available',     sevColor: 'info.main',    orgField: 'upgrades'                },
  { key: 'outstandingChangeOrder', label: 'Outstanding ChangeOrders', subLabel: 'has one',       sevColor: 'info.main',    orgField: 'outstandingChangeOrders' },
  { key: 'openChangeSet',          label: 'Open ChangeSets',          subLabel: 'open',          sevColor: 'info.main',    orgField: 'openChangeSetComponents' },
];

const FILTER_LABELS: Record<FilterKey, string> = {
  unapplied:          'Unreleased Changes',
  gatesPending:       'Blocking Gates',
  liveProblems:       'Release Problems',
  upgrades:           'Upgrades Available',
  outstandingChangeOrder: 'Outstanding ChangeOrders',
  openChangeSet:      'Open ChangeSets',
};

const KPI_SORT_FIELDS: Partial<Record<SortKey, keyof ComponentKpiRow>> = {
  unapplied:          'unapplied',
  gatesPending:       'gatesPending',
  upgrades:           'upgrades',
  outstandingChangeOrder: 'hasOutstandingChangeOrder',
};

function getKpiValue(row: ComponentKpiRow, key: NumericKpiKey): number {
  return row[key];
}

/** The number a row sorts by for a KPI: its count, or 1/0 for the ChangeOrder flag. */
function getSortValue(row: ComponentKpiRow, key: SortKey): number {
  if (key === 'openChangeSet') return row.openChangeSets.length;
  if (key === 'liveProblems') return row.liveProblems.length;
  const field = KPI_SORT_FIELDS[key];
  return field ? Number(row[field]) : 0;
}

/**
 * Whether a KPI "counts" for filter/dimming purposes — true for a nonzero
 * numeric KPI, or for `hasOutstandingChangeOrder` directly. Kept separate from
 * `getKpiValue` (numeric-display only, feeds the heat-mapped columns) since
 * `hasOutstandingChangeOrder` is a boolean with its own column, not one more
 * numeric column.
 */
function isKpiFlagged(row: ComponentKpiRow, key: FilterKey): boolean {
  if (key === 'outstandingChangeOrder') return row.hasOutstandingChangeOrder;
  if (key === 'openChangeSet') return row.openChangeSets.length > 0;
  if (key === 'liveProblems') return row.liveProblems.length > 0;
  return getKpiValue(row, key) > 0;
}

// ============================================================================
// HELPERS
// ============================================================================

function getHealthRank(row: ComponentKpiRow): { rank: number; cls: 'err' | 'warn' | 'info' | 'ok' } {
  // liveProblems is worst first, so its first entry says whether any is failing.
  const liveTone = row.liveProblems[0]?.tone;
  if (row.gatesPending > 0 || liveTone === 'danger') return { rank: 3, cls: 'err' };
  if (row.unapplied > 0 || liveTone === 'attention') return { rank: 2, cls: 'warn' };
  if (row.upgrades > 0) return { rank: 1, cls: 'info' };
  return { rank: 0, cls: 'ok' };
}

function getHeatSx(
  colKey: NumericKpiKey,
  value: number,
  totalSpaces: number,
  palette: {
    error: { main: string };
    warning: { main: string };
    info: { main: string };
    success: { main: string };
  },
): HeatStyle {
  if (value === 0) return {};
  const share = totalSpaces > 0 ? value / totalSpaces : 0;
  switch (colKey) {
    case 'gatesPending': {
      const hot = value >= 2;
      return { bgcolor: alpha(palette.error.main, hot ? 0.16 : 0.08), color: palette.error.main, fontWeight: hot ? 700 : 600 };
    }
    case 'unapplied': {
      const hot = share >= 0.4;
      return { bgcolor: alpha(palette.warning.main, hot ? 0.16 : 0.08), color: palette.warning.main, fontWeight: hot ? 700 : 600 };
    }
    case 'upgrades': {
      return { bgcolor: alpha(palette.info.main, 0.08), color: palette.info.main, fontWeight: 600 };
    }
    default:
      return {};
  }
}

// ============================================================================
// KPI TILE SUB-COMPONENT
// ============================================================================

interface KpiTileProps {
  label: string;
  value: number;
  unit: string;
  description: string;
  severity: 'error' | 'warning' | 'info' | 'success';
  isActive: boolean;
  onClick: () => void;
}

const KpiTile = ({
  label,
  value,
  unit,
  description,
  severity,
  isActive,
  onClick,
}: KpiTileProps) => {
  const theme = useTheme();
  const isZero = value === 0;
  const sev = theme.palette[severity];

  const borderColor = isActive
    ? sev.main
    : isZero
    ? theme.palette.divider
    : severity === 'error' || severity === 'warning'
    ? alpha(sev.main, 0.16)
    : alpha(sev.main, 0.18);

  const bgColor = isZero ? theme.palette.background.paper : alpha(sev.main, 0.08);
  const countColor = isZero ? theme.palette.text.disabled : sev.main;

  return (
    <Box
      component='button'
      onClick={onClick}
      sx={{
        position: 'relative',
        textAlign: 'left',
        border: `1px solid ${borderColor}`,
        bgcolor: bgColor,
        borderRadius: '9px',
        p: '14px 14px 13px',
        boxShadow: isActive
          ? `0 0 0 2px ${alpha(sev.main, 0.18)}, 0 4px 12px rgba(0,0,0,0.07), 0 1px 3px rgba(0,0,0,0.04)`
          : '0 1px 3px rgba(0,0,0,0.06), 0 0 0 1px rgba(0,0,0,0.04)',
        transition: 'transform 0.14s cubic-bezier(.16,1,.3,1), box-shadow 0.14s ease, border-color 0.14s ease',
        fontFamily: 'inherit',
        width: '100%',
        cursor: 'pointer',
        '&:hover': {
          transform: 'translateY(-2px)',
          boxShadow: '0 4px 12px rgba(0,0,0,0.07), 0 1px 3px rgba(0,0,0,0.04)',
        },
        '&:active': { transform: 'scale(0.995)' },
      }}
    >
      {/* Top row: label + dot/pin */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: '10px' }}>
        <Typography component='span' sx={{ fontSize: 12, fontWeight: 600, color: 'text.secondary', letterSpacing: '0.01em' }}>
          {label}
        </Typography>
        {isActive ? (
          <Typography component='span' sx={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: sev.main }}>
            Filtering ✓
          </Typography>
        ) : (
          <Box
            component='span'
            sx={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              bgcolor: isZero ? 'text.disabled' : `${severity}.main`,
              display: 'inline-block',
              flexShrink: 0,
            }}
          />
        )}
      </Box>

      {/* Count */}
      <Box sx={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
        <Typography
          component='span'
          sx={{
            fontFamily: MONO_FONT,
            fontSize: 30,
            fontWeight: 600,
            lineHeight: 0.95,
            letterSpacing: '-0.03em',
            color: countColor,
          }}
        >
          {value}
        </Typography>
        <Typography component='span' sx={{ fontSize: 11, fontWeight: 500, color: 'text.secondary' }}>
          {unit}
        </Typography>
      </Box>

      {/* Footer */}
      <Box sx={{ mt: '9px' }}>
        <Typography component='span' sx={{ fontSize: 11.5, color: 'text.secondary' }}>
          {description}
        </Typography>
      </Box>
    </Box>
  );
};

// ============================================================================
// SECTION LABEL SUB-COMPONENT
// ============================================================================

interface SectionLabelProps {
  title: string;
  hint?: string;
  mt?: number | string;
}

const SectionLabel = ({ title, hint, mt = 0 }: SectionLabelProps) => (
  <Box sx={{ display: 'flex', alignItems: 'center', gap: '10px', mb: '11px', mt }}>
    <Typography sx={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'text.disabled', flexShrink: 0 }}>
      {title}
    </Typography>
    <Box sx={{ flex: 1, height: 1, bgcolor: 'divider' }} />
    {hint && (
      <Typography sx={{ fontSize: 12, color: 'text.secondary', fontWeight: 500, flexShrink: 0 }}>
        {hint}
      </Typography>
    )}
  </Box>
);

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export const ComponentOverviewMatrix = ({ spaces, onComponentSelect }: ComponentOverviewMatrixProps) => {
  const theme = useTheme();
  const [activeFilter, setActiveFilter] = useState<FilterKey | null>(null);
  const [sortBy, setSortBy] = useState<SortKey>('health');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const outstandingChangeOrderBaseSpaceIds = useOutstandingChangeOrderBaseSpaceIds();
  const openChangeSets = useOpenChangeSets();
  const releaseSpaces = useMemo(
    () =>
      spaces.flatMap((s) =>
        s.Space?.SpaceID ? [{ spaceId: s.Space.SpaceID, releaseTargetId: s.Space.ReleaseTargetID }] : [],
      ),
    [spaces],
  );
  const { bySpaceId: runningReleaseBySpaceId } = useRunningReleases(releaseSpaces, {
    pollIntervalMs: RUNNING_RELEASE_POLL_MS,
  });
  const { componentById } = useComponentSlugs();
  const { rows, org } = useMemo(
    () =>
      buildOverviewData(
        spaces,
        componentById,
        outstandingChangeOrderBaseSpaceIds,
        openChangeSets,
        runningReleaseBySpaceId,
      ),
    [spaces, componentById, outstandingChangeOrderBaseSpaceIds, openChangeSets, runningReleaseBySpaceId],
  );


  // Estate summary derived values
  const unitsNeedAttention = org.gatesPending + org.unapplied;
  // Red when any running Release is failing, amber when they are only out of sync.
  const releaseProblemColor = rows.some((r) => r.liveProblems[0]?.tone === 'danger')
    ? 'error.main'
    : org.liveProblems > 0
    ? 'warning.main'
    : 'success.main';
  const healthyComponents = useMemo(
    () => rows.filter((r) => getHealthRank(r).rank === 0).length,
    [rows],
  );

  const sortedRows = useMemo(() => {
    return [...rows].sort((a, b) => {
      if (sortBy === 'health') {
        const ra = getHealthRank(a);
        const rb = getHealthRank(b);
        if (ra.rank !== rb.rank) return rb.rank - ra.rank;
        const aAttn = a.gatesPending + a.unapplied + a.liveProblems.length;
        const bAttn = b.gatesPending + b.unapplied + b.liveProblems.length;
        return aAttn !== bAttn ? bAttn - aAttn : a.componentName.localeCompare(b.componentName);
      }
      if (sortBy === 'componentName') {
        const cmp = a.componentName.localeCompare(b.componentName);
        return sortDir === 'asc' ? cmp : -cmp;
      }
      const aVal = getSortValue(a, sortBy);
      const bVal = getSortValue(b, sortBy);
      return sortDir === 'desc' ? bVal - aVal : aVal - bVal;
    });
  }, [rows, sortBy, sortDir]);

  const handleSort = useCallback(
    (key: SortKey) => {
      if (sortBy === key) {
        setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
      } else {
        setSortBy(key);
        setSortDir(key === 'componentName' ? 'asc' : 'desc');
      }
    },
    [sortBy],
  );

  const handleFilterToggle = useCallback(
    (key: FilterKey) => {
      if (activeFilter === key) {
        setActiveFilter(null);
        setSortBy('health');
        setSortDir('desc');
      } else {
        setActiveFilter(key);
        setSortBy(key);
        setSortDir('desc');
      }
    },
    [activeFilter],
  );

  const filterCount = useMemo(() => {
    if (!activeFilter) return 0;
    return rows.filter((r) => isKpiFlagged(r, activeFilter)).length;
  }, [rows, activeFilter]);

  const sortArrow = (key: SortKey) => {
    if (sortBy !== key) return '▲▼';
    return sortDir === 'desc' ? '▼' : '▲';
  };

  const healthDotColor = (cls: 'err' | 'warn' | 'info' | 'ok') => {
    switch (cls) {
      case 'err':  return theme.palette.error.main;
      case 'warn': return theme.palette.warning.main;
      case 'info': return theme.palette.info.main;
      case 'ok':   return theme.palette.success.main;
    }
  };

  return (
    <Box
      data-testid='component-overview-matrix'
      sx={{ p: '22px 28px 60px', overflow: 'auto', flex: 1, bgcolor: 'background.default' }}
    >
      <Box sx={{ maxWidth: 1240, mx: 'auto' }}>

        {/* ── Page header ── */}
        <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 2, mb: '18px' }}>
          <Box>
            <Typography variant='h1'>Components Overview</Typography>
          </Box>

          {/* Estate summary widget */}
          <Box
            sx={{
              display: 'flex', alignItems: 'center', gap: '14px', flexShrink: 0,
              border: `1px solid ${theme.palette.divider}`, bgcolor: 'background.paper',
              borderRadius: '9px', p: '10px 16px',
              boxShadow: '0 1px 3px rgba(0,0,0,0.06), 0 0 0 1px rgba(0,0,0,0.04)',
            }}
          >
            <Box>
              <Typography
                sx={{
                  fontFamily: MONO_FONT,
                  fontSize: 22, fontWeight: 600, lineHeight: 1, letterSpacing: '-0.02em',
                  color: unitsNeedAttention > 0 ? 'error.main' : 'success.main',
                }}
              >
                {unitsNeedAttention}
              </Typography>
              <Typography sx={{ fontSize: 11, color: 'text.secondary', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>
                Units need attention
              </Typography>
            </Box>
            <Box sx={{ width: '1px', height: 30, bgcolor: 'divider' }} />
            <Box>
              <Typography
                data-testid='estate-release-problems'
                sx={{
                  fontFamily: MONO_FONT,
                  fontSize: 22, fontWeight: 600, lineHeight: 1, letterSpacing: '-0.02em',
                  color: releaseProblemColor,
                }}
              >
                {org.liveProblems}
              </Typography>
              <Typography sx={{ fontSize: 11, color: 'text.secondary', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>
                Spaces with release problems
              </Typography>
            </Box>
            <Box sx={{ width: '1px', height: 30, bgcolor: 'divider' }} />
            <Box>
              <Box sx={{ display: 'flex', alignItems: 'baseline', gap: '4px', lineHeight: 1 }}>
                <Typography sx={{ fontFamily: MONO_FONT, fontSize: 22, fontWeight: 600, letterSpacing: '-0.02em', color: 'text.secondary' }}>
                  {healthyComponents}
                </Typography>
                <Typography sx={{ fontSize: 13, color: 'text.disabled', fontWeight: 500 }}>
                  / {org.totalComponents}
                </Typography>
              </Box>
              <Typography sx={{ fontSize: 11, color: 'text.secondary', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>
                Healthy components
              </Typography>
            </Box>
          </Box>
        </Box>

        {/* ── KPI tiles ── */}
        <SectionLabel title='Status' hint='Click a tile to scope the matrix below' />
        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '12px', mb: '10px' }}>
          <KpiTile
            label='Blocking Gates'
            value={org.gatesPending}
            unit='units blocked'
            description='Deploy blocked by pre-release checks'
            severity='error'
            isActive={activeFilter === 'gatesPending'}
            onClick={() => handleFilterToggle('gatesPending')}
          />
          <KpiTile
            label='Unreleased Changes'
            value={org.unapplied}
            unit='units pending'
            description='Pending deployment'
            severity='warning'
            isActive={activeFilter === 'unapplied'}
            onClick={() => handleFilterToggle('unapplied')}
          />
          <KpiTile
            label='Release Problems'
            value={org.liveProblems}
            unit='spaces'
            description='Latest Release out of sync, degraded or failed'
            severity='error'
            isActive={activeFilter === 'liveProblems'}
            onClick={() => handleFilterToggle('liveProblems')}
          />
          <KpiTile
            label='Upgrades Available'
            value={org.upgrades}
            unit='units'
            description='Updates from upstream'
            severity='info'
            isActive={activeFilter === 'upgrades'}
            onClick={() => handleFilterToggle('upgrades')}
          />
          <KpiTile
            label='Outstanding ChangeOrders'
            value={org.outstandingChangeOrders}
            unit='components'
            description='Has a ChangeOrder in progress'
            severity='info'
            isActive={activeFilter === 'outstandingChangeOrder'}
            onClick={() => handleFilterToggle('outstandingChangeOrder')}
          />
          <KpiTile
            label='Open ChangeSets'
            value={org.openChangeSetComponents}
            unit='components'
            description='Has a ChangeSet open on its units'
            severity='info'
            isActive={activeFilter === 'openChangeSet'}
            onClick={() => handleFilterToggle('openChangeSet')}
          />
        </Box>

        {/* ── Filter bar ── */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: '10px', my: '16px', minHeight: 24 }}>
              {activeFilter !== null && (
                <Chip
                  label={`Scoped to ${FILTER_LABELS[activeFilter]}`}
                  onDelete={() => { setActiveFilter(null); setSortBy('health'); setSortDir('desc'); }}
                  deleteIcon={<CloseIcon />}
                  size='small'
                  color='primary'
                />
              )}
              <Typography sx={{ fontSize: 12.5, color: 'text.secondary' }}>
                {activeFilter !== null ? (
                  <>Showing <strong>{filterCount} component{filterCount === 1 ? '' : 's'}</strong> with {FILTER_LABELS[activeFilter]}</>
                ) : (
                  <>Showing <strong>all {rows.length} components</strong> · sorted by health (most critical first)</>
                )}
              </Typography>
            </Box>

        {/* ── Matrix table ── */}
        <Paper
          elevation={0}
          sx={{
            border: `1px solid ${theme.palette.divider}`,
            borderRadius: '9px',
            overflow: 'hidden',
            boxShadow: '0 1px 3px rgba(0,0,0,0.06), 0 0 0 1px rgba(0,0,0,0.04)',
          }}
        >
          <TableContainer>
            <Table size='small' stickyHeader>

              {/* ── Header ── */}
              <TableHead>
                <TableRow>
                  {/* Component column header */}
                  <TableCell
                    sx={{
                      bgcolor: 'background.default',
                      borderBottom: `1px solid ${theme.palette.divider}`,
                      p: 0,
                      position: 'sticky',
                      top: 0,
                      zIndex: 3,
                    }}
                  >
                    <Box
                      component='button'
                      onClick={() => handleSort('componentName')}
                      sx={{
                        width: '100%', border: 0, background: 'transparent', cursor: 'pointer',
                        p: '11px 10px 11px 18px', fontFamily: 'inherit', color: 'text.secondary',
                        fontWeight: 600, fontSize: 11, textAlign: 'left',
                        display: 'flex', alignItems: 'center', gap: '7px',
                        '&:hover': { color: 'text.primary', bgcolor: alpha(theme.palette.action.hover, 0.06) },
                      }}
                    >
                      <Typography component='span' sx={{ fontWeight: sortBy === 'componentName' ? 700 : 600, fontSize: 11, color: sortBy === 'componentName' ? 'text.primary' : 'text.secondary' }}>
                        Component
                      </Typography>
                      <Typography component='span' sx={{ fontSize: 9, color: sortBy === 'componentName' ? 'error.main' : 'text.disabled' }}>
                        {sortArrow('componentName')}
                      </Typography>
                    </Box>
                  </TableCell>

                  {/* KPI column headers */}
                  {COL_DEFS.map((col) => (
                    <TableCell
                      key={col.key}
                      align='center'
                      sx={{
                        width: KPI_COL_WIDTH,
                        bgcolor: activeFilter === col.key ? alpha(theme.palette.warning.main, 0.05) : 'background.default',
                        borderBottom: `1px solid ${theme.palette.divider}`,
                        p: 0,
                        position: 'sticky',
                        top: 0,
                        zIndex: 3,
                      }}
                    >
                      <Box
                        component='button'
                        onClick={() => handleSort(col.key)}
                        sx={{
                          width: '100%', border: 0, background: 'transparent', cursor: 'pointer',
                          p: '11px 8px', fontFamily: 'inherit', color: 'text.secondary',
                          fontWeight: 600, fontSize: 11, lineHeight: 1.2,
                          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '5px',
                          '&:hover': { color: 'text.primary', bgcolor: alpha(theme.palette.action.hover, 0.06) },
                        }}
                      >
                        {/* Top: dot + label, a word to a line + sort arrow */}
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                          <Box component='span' sx={{ width: 7, height: 7, borderRadius: '50%', bgcolor: col.sevColor, flexShrink: 0 }} />
                          <Typography
                            component='span'
                            sx={{
                              fontWeight: sortBy === col.key ? 700 : 600, fontSize: 11, lineHeight: 1.2,
                              color: sortBy === col.key ? 'text.primary' : 'inherit',
                              whiteSpace: 'pre-line',
                            }}
                          >
                            {col.label.replace(' ', '\n')}
                          </Typography>
                          <Typography component='span' sx={{ fontSize: 9, color: sortBy === col.key ? 'error.main' : 'text.disabled' }}>
                            {sortArrow(col.key)}
                          </Typography>
                        </Box>
                        {/* Sub-label */}
                        <Typography component='span' sx={{ fontSize: 9.5, fontWeight: 500, color: 'text.disabled', textTransform: 'uppercase', letterSpacing: '0.04em', whiteSpace: 'nowrap' }}>
                          {col.subLabel}
                        </Typography>
                      </Box>
                    </TableCell>
                  ))}
                </TableRow>
              </TableHead>

              {/* ── Body ── */}
              <TableBody>
                {sortedRows.map((row) => {
                  const health = getHealthRank(row);
                  const dotColor = healthDotColor(health.cls);
                  const isDimmed = activeFilter !== null && !isKpiFlagged(row, activeFilter);

                  return (
                    <TableRow
                      key={row.componentName}
                      hover
                      onClick={() => onComponentSelect({ name: row.componentName, owner: row.owner })}
                      sx={{
                        cursor: 'pointer',
                        opacity: isDimmed ? 0.32 : 1,
                        filter: isDimmed ? 'grayscale(0.3)' : 'none',
                        '&:last-child td': { border: 0 },
                      }}
                    >
                      {/* Component name cell */}
                      <TableCell sx={{ p: 0, height: 50, borderBottom: `1px solid ${theme.palette.divider}` }}>
                        <Box
                          sx={{
                            display: 'flex', alignItems: 'center', gap: '11px',
                            px: '14px', pl: '18px', height: '100%',
                            '&:hover .comp-name-text': {
                              color: 'error.main',
                              textDecoration: 'underline',
                              textUnderlineOffset: 2,
                            },
                          }}
                        >
                          {/* Health dot with ring */}
                          <Box
                            sx={{
                              width: 9, height: 9, borderRadius: '50%', flexShrink: 0,
                              bgcolor: dotColor,
                              boxShadow: `0 0 0 3px ${alpha(dotColor, 0.15)}`,
                            }}
                          />
                          {/* Text */}
                          <Box sx={{ display: 'flex', flexDirection: 'column', gap: '1px', minWidth: 0 }}>
                            <Typography
                              className='comp-name-text'
                              noWrap
                              sx={{ fontWeight: 600, fontSize: 13.5, color: 'text.primary', letterSpacing: '-0.01em', lineHeight: 1.2 }}
                            >
                              {row.componentName}
                            </Typography>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: 11, color: 'text.secondary' }}>
                              <Box component='span' sx={{ width: 6, height: 6, borderRadius: '2px', bgcolor: 'secondary.main', display: 'inline-block', flexShrink: 0 }} />
                              <Typography component='span' sx={{ fontSize: 11 }}>{row.owner}</Typography>
                              <Typography component='span' sx={{ fontSize: 11, color: 'text.disabled' }}>·</Typography>
                              <Typography component='span' sx={{ fontSize: 11 }}>{row.totalSpaces} spaces</Typography>
                            </Box>
                          </Box>
                        </Box>
                      </TableCell>

                      {/* KPI data cells */}
                      {COL_DEFS.map((col) => {
                        const focusBg = activeFilter === col.key ? alpha(theme.palette.warning.main, 0.05) : undefined;
                        const cellSx = {
                          p: 0, height: 50,
                          borderBottom: `1px solid ${theme.palette.divider}`,
                          transition: 'background 0.12s ease',
                        };
                        const emptyMark = (
                          <Typography sx={{ fontFamily: MONO_FONT, fontSize: 13, color: 'text.disabled', display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>·</Typography>
                        );

                        switch (col.key) {
                          // Outstanding-ChangeOrder dot — same visual language as
                          // the AppComponentView toggle's notifier dot.
                          case 'outstandingChangeOrder':
                            return (
                              <TableCell key={col.key} align='center' sx={{ ...cellSx, bgcolor: focusBg ?? 'transparent' }}>
                                {row.hasOutstandingChangeOrder ? (
                                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
                                    <Box
                                      data-testid='outstanding-change-order-dot'
                                      sx={{
                                        width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
                                        bgcolor: theme.palette.warning.dark,
                                      }}
                                    />
                                  </Box>
                                ) : (
                                  emptyMark
                                )}
                              </TableCell>
                            );

                          // Open-ChangeSet count, the ChangeSets named on hover, each a link to its page.
                          case 'openChangeSet':
                            return (
                              <TableCell
                                key={col.key}
                                align='center'
                                sx={{
                                  ...cellSx,
                                  bgcolor: focusBg ?? (row.openChangeSets.length > 0 ? alpha(theme.palette.info.main, 0.08) : 'transparent'),
                                }}
                              >
                                {row.openChangeSets.length > 0 ? (
                                  <Tooltip
                                    placement='top'
                                    arrow
                                    title={
                                      <Box component='ul' sx={{ m: 0, p: 0, listStyle: 'none' }} data-testid='open-changeset-links'>
                                        {row.openChangeSets.map((cs) => (
                                          <li key={cs.label}>
                                            {cs.spaceSlug ? (
                                              <Box
                                                component={RouterLink}
                                                to={changeSetPath(cs.spaceSlug, cs.slug)}
                                                // The row opens the component; a link in its hover opens the ChangeSet.
                                                onClick={(event: React.MouseEvent) => event.stopPropagation()}
                                                sx={{ color: 'inherit' }}
                                              >
                                                {cs.label}
                                              </Box>
                                            ) : (
                                              cs.label
                                            )}
                                          </li>
                                        ))}
                                      </Box>
                                    }
                                  >
                                    <Typography
                                      data-testid='open-changeset-count'
                                      sx={{
                                        fontFamily: MONO_FONT, fontSize: 15, fontWeight: 600, color: 'info.main',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%',
                                      }}
                                    >
                                      {row.openChangeSets.length}
                                    </Typography>
                                  </Tooltip>
                                ) : (
                                  emptyMark
                                )}
                              </TableCell>
                            );

                          // The Spaces whose running Release is out of sync, degraded or
                          // failed, coloured by the worst of them and named on hover.
                          case 'liveProblems': {
                            const problems = row.liveProblems;
                            const color = problems[0]?.tone === 'danger' ? theme.palette.error.main : theme.palette.warning.main;
                            return (
                              <TableCell
                                key={col.key}
                                align='center'
                                sx={{ ...cellSx, bgcolor: focusBg ?? (problems.length > 0 ? alpha(color, 0.08) : 'transparent') }}
                              >
                                {problems.length > 0 ? (
                                  <Tooltip
                                    placement='top'
                                    arrow
                                    title={
                                      <Box data-testid='release-problem-list'>
                                        <Box component='ul' sx={{ m: 0, p: 0, listStyle: 'none' }}>
                                          {problems.map((problem) => (
                                            <li key={problem.spaceSlug}>
                                              {problem.spaceSlug}: {problem.text}
                                            </li>
                                          ))}
                                        </Box>
                                        <Box
                                          component={RouterLink}
                                          to={`/releases?component=${encodeURIComponent(row.componentName)}`}
                                          onClick={(event: React.MouseEvent) => event.stopPropagation()}
                                          sx={{ display: 'inline-block', mt: 0.5, color: 'inherit' }}
                                        >
                                          Open in Releases
                                        </Box>
                                      </Box>
                                    }
                                  >
                                    <Typography
                                      data-testid='release-problem-count'
                                      sx={{
                                        fontFamily: MONO_FONT, fontSize: 15, fontWeight: 600, color,
                                        display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%',
                                      }}
                                    >
                                      {problems.length}
                                    </Typography>
                                  </Tooltip>
                                ) : (
                                  emptyMark
                                )}
                              </TableCell>
                            );
                          }

                          default: {
                            const value = getKpiValue(row, col.key);
                            const heatStyle = getHeatSx(col.key, value, row.totalSpaces, theme.palette);
                            return (
                              <TableCell
                                key={col.key}
                                align='center'
                                sx={{ ...cellSx, bgcolor: focusBg ?? heatStyle.bgcolor ?? 'transparent' }}
                              >
                                <Typography
                                  sx={{
                                    fontFamily: MONO_FONT,
                                    fontSize: value === 0 ? 13 : 15,
                                    fontWeight: value === 0 ? 400 : (heatStyle.fontWeight ?? 550),
                                    color: value === 0 ? 'text.disabled' : (heatStyle.color ?? 'text.secondary'),
                                    display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%',
                                  }}
                                >
                                  {value === 0 ? '·' : value}
                                </Typography>
                              </TableCell>
                            );
                          }
                        }
                      })}
                    </TableRow>
                  );
                })}
              </TableBody>

              {/* ── Footer (org roll-up) ── */}
              <TableFooter>
                <TableRow>
                  <TableCell
                    sx={{
                      borderTop: `2px solid ${theme.palette.divider}`,
                      height: 42, textAlign: 'left', pl: '18px',
                      bgcolor: 'background.default',
                      fontSize: 12, fontWeight: 700, color: 'text.secondary',
                      textTransform: 'uppercase', letterSpacing: '0.05em',
                    }}
                  >
                    Org roll-up
                  </TableCell>
                  {COL_DEFS.map((col) => (
                    <TableCell
                      key={col.key}
                      align='center'
                      sx={{
                        borderTop: `2px solid ${theme.palette.divider}`,
                        height: 42,
                        bgcolor: activeFilter === col.key ? alpha(theme.palette.warning.main, 0.05) : 'background.default',
                        fontFamily: MONO_FONT,
                        fontSize: 13, fontWeight: 600, color: 'text.secondary',
                      }}
                    >
                      {org[col.orgField]}
                    </TableCell>
                  ))}
                </TableRow>
              </TableFooter>

            </Table>
          </TableContainer>
        </Paper>

        {/* ── Recent Activity ── */}
        <Box sx={{ mt: '24px' }}>
          <ComponentActivityFeed spaces={spaces} />
        </Box>

      </Box>
    </Box>
  );
};
