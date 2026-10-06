// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { useCallback, useMemo, useState } from 'react';

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
import Typography from '@mui/material/Typography';
import { alpha, useTheme } from '@mui/material/styles';

import { ComponentActivityFeed } from './ComponentActivityFeed';
import { type SelectedApp } from './appTypes';
import { buildOverviewData, type ComponentKpiRow } from './componentOverview';
import { useOutstandingRolloutBaseSpaceIds } from './rollout/useOutstandingRolloutsBulk';

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
  | 'upgrades'
  | 'outstandingRollout';

type SortKey =
  | 'health'
  | 'componentName'
  | 'unapplied'
  | 'gatesPending'
  | 'upgrades'
  | 'outstandingRollout';

type ColKey =
  | 'unapplied'
  | 'gatesPending'
  | 'upgrades';

interface ColDef {
  key: ColKey;
  sortKey: SortKey | null;
  label: string;
  subLabel: string;
  sevColor: 'error.main' | 'warning.main' | 'info.main' | 'success.main';
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

const COL_DEFS: ColDef[] = [
  { key: 'gatesPending', sortKey: 'gatesPending', label: 'Blocking Gates',     subLabel: 'blocked',   sevColor: 'error.main'   },
  { key: 'unapplied',    sortKey: 'unapplied',    label: 'Unreleased Changes', subLabel: 'pending',   sevColor: 'warning.main' },
  { key: 'upgrades',     sortKey: 'upgrades',     label: 'Upgrades Available', subLabel: 'available', sevColor: 'info.main'    },
];

const FILTER_LABELS: Record<FilterKey, string> = {
  unapplied:          'Unreleased Changes',
  gatesPending:       'Blocking Gates',
  upgrades:           'Upgrades Available',
  outstandingRollout: 'Outstanding Rollouts',
};

const KPI_SORT_FIELDS: Partial<Record<SortKey, keyof ComponentKpiRow>> = {
  unapplied:          'unapplied',
  gatesPending:       'gatesPending',
  upgrades:           'upgrades',
  outstandingRollout: 'hasOutstandingRollout',
};

function getKpiValue(row: ComponentKpiRow, key: NumericKpiKey): number {
  return row[key];
}

/**
 * Whether a KPI "counts" for filter/dimming purposes — true for a nonzero
 * numeric KPI, or for `hasOutstandingRollout` directly. Kept separate from
 * `getKpiValue` (numeric-display only, feeds the heat-mapped columns) since
 * `hasOutstandingRollout` is a boolean with its own column, not one more
 * numeric column.
 */
function isKpiFlagged(row: ComponentKpiRow, key: FilterKey): boolean {
  if (key === 'outstandingRollout') return row.hasOutstandingRollout;
  return getKpiValue(row, key) > 0;
}

// ============================================================================
// HELPERS
// ============================================================================

function getHealthRank(row: ComponentKpiRow): { rank: number; cls: 'err' | 'warn' | 'info' | 'ok' } {
  if (row.gatesPending > 0) return { rank: 3, cls: 'err' };
  if (row.unapplied > 0) return { rank: 2, cls: 'warn' };
  if (row.upgrades > 0) return { rank: 1, cls: 'info' };
  return { rank: 0, cls: 'ok' };
}

function getHeatSx(
  colKey: ColKey,
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

  const outstandingRolloutBaseSpaceIds = useOutstandingRolloutBaseSpaceIds();
  const { componentById } = useComponentSlugs();
  const { rows, org } = useMemo(
    () => buildOverviewData(spaces, componentById, outstandingRolloutBaseSpaceIds),
    [spaces, componentById, outstandingRolloutBaseSpaceIds],
  );


  // Estate summary derived values
  const unitsNeedAttention = org.gatesPending + org.unapplied;
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
        const aAttn = a.gatesPending + a.unapplied;
        const bAttn = b.gatesPending + b.unapplied;
        return aAttn !== bAttn ? bAttn - aAttn : a.componentName.localeCompare(b.componentName);
      }
      if (sortBy === 'componentName') {
        const cmp = a.componentName.localeCompare(b.componentName);
        return sortDir === 'asc' ? cmp : -cmp;
      }
      const field = KPI_SORT_FIELDS[sortBy];
      if (!field) return 0;
      const aVal = a[field] as number;
      const bVal = b[field] as number;
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

  const isColFocus = (colKey: ColKey): boolean =>
    activeFilter !== null && (colKey as string) === (activeFilter as string);

  const filterCount = useMemo(() => {
    if (!activeFilter) return 0;
    const field = KPI_SORT_FIELDS[activeFilter];
    return rows.filter((r) => field && (r[field] as number) > 0).length;
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
        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', mb: '10px' }}>
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
            label='Upgrades Available'
            value={org.upgrades}
            unit='units'
            description='Updates from upstream'
            severity='info'
            isActive={activeFilter === 'upgrades'}
            onClick={() => handleFilterToggle('upgrades')}
          />
          <KpiTile
            label='Outstanding Rollouts'
            value={org.outstandingRollouts}
            unit='components'
            description='Has a ChangeOrder in progress'
            severity='info'
            isActive={activeFilter === 'outstandingRollout'}
            onClick={() => handleFilterToggle('outstandingRollout')}
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
                        bgcolor: isColFocus(col.key) ? alpha(theme.palette.warning.main, 0.05) : 'background.default',
                        borderBottom: `1px solid ${theme.palette.divider}`,
                        p: 0,
                        position: 'sticky',
                        top: 0,
                        zIndex: 3,
                      }}
                    >
                      <Box
                        component={col.sortKey ? 'button' : 'div'}
                        onClick={col.sortKey ? () => handleSort(col.sortKey!) : undefined}
                        sx={{
                          width: '100%', border: 0, background: 'transparent',
                          cursor: col.sortKey ? 'pointer' : 'default',
                          p: '11px 10px', fontFamily: 'inherit', color: 'text.secondary',
                          fontWeight: 600, fontSize: 11, lineHeight: 1.2,
                          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '5px',
                          '&:hover': col.sortKey ? { color: 'text.primary', bgcolor: alpha(theme.palette.action.hover, 0.06) } : {},
                        }}
                      >
                        {/* Top line: dot + label + sort arrow */}
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                          <Box component='span' sx={{ width: 7, height: 7, borderRadius: '50%', bgcolor: col.sevColor, flexShrink: 0 }} />
                          <Typography component='span' sx={{ fontWeight: sortBy === col.sortKey ? 700 : 600, fontSize: 11, color: sortBy === col.sortKey ? 'text.primary' : 'inherit' }}>
                            {col.label}
                          </Typography>
                          {col.sortKey && (
                            <Typography component='span' sx={{ fontSize: 9, color: sortBy === col.sortKey ? 'error.main' : 'text.disabled' }}>
                              {sortArrow(col.sortKey)}
                            </Typography>
                          )}
                        </Box>
                        {/* Sub-label */}
                        <Typography component='span' sx={{ fontSize: 9.5, fontWeight: 500, color: 'text.disabled', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                          {col.subLabel}
                        </Typography>
                      </Box>
                    </TableCell>
                  ))}

                  {/* Outstanding-rollout column header — a boolean per-row
                      dot, not one more heat-mapped numeric column, so it
                      lives outside COL_DEFS; still wired into the same
                      sort/filter state for consistency with the others. */}
                  <TableCell
                    align='center'
                    sx={{
                      bgcolor: activeFilter === 'outstandingRollout' ? alpha(theme.palette.warning.main, 0.05) : 'background.default',
                      borderBottom: `1px solid ${theme.palette.divider}`,
                      p: 0,
                      position: 'sticky',
                      top: 0,
                      zIndex: 3,
                    }}
                  >
                    <Box
                      component='button'
                      onClick={() => handleSort('outstandingRollout')}
                      sx={{
                        width: '100%', border: 0, background: 'transparent', cursor: 'pointer',
                        p: '11px 10px', fontFamily: 'inherit', color: 'text.secondary',
                        fontWeight: 600, fontSize: 11, lineHeight: 1.2,
                        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '5px',
                        '&:hover': { color: 'text.primary', bgcolor: alpha(theme.palette.action.hover, 0.06) },
                      }}
                    >
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                        <Box component='span' sx={{ width: 7, height: 7, borderRadius: '50%', bgcolor: 'info.main', flexShrink: 0 }} />
                        <Typography component='span' sx={{ fontWeight: sortBy === 'outstandingRollout' ? 700 : 600, fontSize: 11, color: sortBy === 'outstandingRollout' ? 'text.primary' : 'inherit' }}>
                          Outstanding Rollouts
                        </Typography>
                        <Typography component='span' sx={{ fontSize: 9, color: sortBy === 'outstandingRollout' ? 'error.main' : 'text.disabled' }}>
                          {sortArrow('outstandingRollout')}
                        </Typography>
                      </Box>
                      <Typography component='span' sx={{ fontSize: 9.5, fontWeight: 500, color: 'text.disabled', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                        has one
                      </Typography>
                    </Box>
                  </TableCell>
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
                        const colFocus = isColFocus(col.key);

                        const value = getKpiValue(row, col.key);
                        const heatStyle = getHeatSx(col.key, value, row.totalSpaces, theme.palette);

                        return (
                          <TableCell
                            key={col.key}
                            align='center'
                            sx={{
                              p: 0, height: 50,
                              bgcolor: colFocus
                                ? alpha(theme.palette.warning.main, 0.05)
                                : heatStyle.bgcolor ?? 'transparent',
                              borderBottom: `1px solid ${theme.palette.divider}`,
                              transition: 'background 0.12s ease',
                            }}
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
                      })}

                      {/* Outstanding-rollout dot — same visual language as
                          the AppComponentView toggle's notifier dot. */}
                      <TableCell
                        align='center'
                        sx={{
                          p: 0, height: 50,
                          bgcolor: activeFilter === 'outstandingRollout' ? alpha(theme.palette.warning.main, 0.05) : 'transparent',
                          borderBottom: `1px solid ${theme.palette.divider}`,
                          transition: 'background 0.12s ease',
                        }}
                      >
                        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
                          {row.hasOutstandingRollout ? (
                            <Box
                              data-testid='outstanding-rollout-dot'
                              sx={{
                                width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
                                bgcolor: theme.palette.warning.dark,
                              }}
                            />
                          ) : (
                            <Typography sx={{ fontFamily: MONO_FONT, fontSize: 13, color: 'text.disabled' }}>·</Typography>
                          )}
                        </Box>
                      </TableCell>
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
                  {COL_DEFS.map((col) => {
                    const colFocus = isColFocus(col.key);
                    const orgVal =
                        col.key === 'unapplied'    ? org.unapplied
                      : col.key === 'gatesPending' ? org.gatesPending
                      : col.key === 'upgrades'     ? org.upgrades
                      : null;
                    return (
                      <TableCell
                        key={col.key}
                        align='center'
                        sx={{
                          borderTop: `2px solid ${theme.palette.divider}`,
                          height: 42,
                          bgcolor: colFocus ? alpha(theme.palette.warning.main, 0.05) : 'background.default',
                          fontFamily: MONO_FONT,
                          fontSize: 13, fontWeight: 600, color: 'text.secondary',
                        }}
                      >
                        {orgVal}
                      </TableCell>
                    );
                  })}
                  <TableCell
                    align='center'
                    sx={{
                      borderTop: `2px solid ${theme.palette.divider}`,
                      height: 42,
                      bgcolor: activeFilter === 'outstandingRollout' ? alpha(theme.palette.warning.main, 0.05) : 'background.default',
                      fontFamily: MONO_FONT,
                      fontSize: 13, fontWeight: 600, color: 'text.secondary',
                    }}
                  >
                    {org.outstandingRollouts}
                  </TableCell>
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
