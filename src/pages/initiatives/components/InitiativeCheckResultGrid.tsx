// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import { type ReactNode, useCallback, useMemo, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';

import type { FilterCondition } from '@/components/query-builder';
import type { ExtendedUnitRead } from '@confighub/rtk-query';
import type { PolicyViolation, UnitCheckResult } from '@/types/initiative';
import { groupCheckResults } from '../utils/checkResultHelpers';
import { CheckResultGridToolbar } from './CheckResultGridToolbar';
import CancelIcon from '@mui/icons-material/Cancel';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import RemoveCircleOutlineIcon from '@mui/icons-material/RemoveCircleOutline';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import Collapse from '@mui/material/Collapse';
import IconButton from '@mui/material/IconButton';
import MuiLink from '@mui/material/Link';
import Stack from '@mui/material/Stack';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';

const VIOLATION_TOOLTIP_SX = {
  maxWidth: 420,
  p: 0,
  bgcolor: 'background.paper',
  color: 'text.primary',
  border: '1px solid',
  borderColor: 'divider',
  boxShadow: 3,
  '& .MuiTooltip-arrow': {
    color: 'background.paper',
    '&::before': { border: '1px solid', borderColor: 'divider' },
  },
} as const;

function ViolationTooltip({ violations }: { violations: PolicyViolation[] }) {
  return (
    <Box sx={{ p: 1.5, maxHeight: 320, overflowY: 'auto' }}>
      <Typography variant='caption' fontWeight={700} sx={{ mb: 1, display: 'block' }}>
        {violations.length} violation{violations.length !== 1 ? 's' : ''}
      </Typography>
      <Stack spacing={0.75}>
        {violations.map((v, i) => (
          <Box
            key={i}
            sx={{
              px: 1.5,
              py: 1,
              bgcolor: '#fff5f5',
              border: '1px solid',
              borderColor: '#ffcdd2',
              borderRadius: '4px',
            }}
          >
            <Stack direction='row' spacing={0.75} alignItems='center' sx={{ mb: 0.25 }}>
              <Typography variant='caption' fontWeight={700} sx={{ color: '#c62828' }}>
                {v.rule}
              </Typography>
              <Typography variant='caption' color='text.secondary'>
                {v.resourceName}
              </Typography>
              {v.resourceType && (
                <Chip
                  label={v.resourceType}
                  size='small'
                  sx={{ height: 16, fontSize: '0.6rem', fontWeight: 600, bgcolor: 'grey.200' }}
                />
              )}
            </Stack>
            <Typography variant='caption' color='text.secondary' sx={{ display: 'block' }}>
              {v.message}
            </Typography>
            {v.path && (
              <Typography
                variant='caption'
                sx={{
                  display: 'block',
                  mt: 0.25,
                  fontFamily: 'monospace',
                  fontSize: '0.65rem',
                  color: 'text.disabled',
                }}
              >
                {v.path}
              </Typography>
            )}
          </Box>
        ))}
      </Stack>
    </Box>
  );
}

interface InitiativeCheckResultGridProps {
  units: ExtendedUnitRead[];
  checkResults: UnitCheckResult[];
  filterConditions: FilterCondition[];
  setFilters: (filters: FilterCondition[]) => void;
  onClearFilters: () => void;
  filterElement: ReactNode;
}

interface ResultSectionProps {
  title: string;
  color: string;
  units: ExtendedUnitRead[];
  resultMap: Map<string, UnitCheckResult>;
  defaultExpanded: boolean;
  hint?: string;
  /** When true, the hint is shown both when collapsed AND expanded (e.g. sort hint on Failing) */
  showHintWhenExpanded?: boolean;
  pageSize?: number;
}

const ResultSection = ({
  title,
  color,
  units,
  resultMap,
  defaultExpanded,
  hint,
  showHintWhenExpanded = false,
  pageSize,
}: ResultSectionProps) => {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [page, setPage] = useState(0);

  const pageUnits = pageSize ? units.slice(page * pageSize, (page + 1) * pageSize) : units;

  return (
    <Box>
      {/* Section header */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          px: 1.5,
          py: 1,
          cursor: 'pointer',
          borderTop: '1px solid',
          borderColor: 'divider',
          borderLeft: '3px solid',
          borderLeftColor: color,
        }}
        onClick={() => setExpanded(!expanded)}
      >
        <IconButton size='small' tabIndex={-1}>
          <ExpandMoreIcon
            sx={{
              fontSize: 18,
              transform: expanded ? 'rotate(0deg)' : 'rotate(-90deg)',
              transition: 'transform 0.15s',
            }}
          />
        </IconButton>
        <Typography variant='subtitle2' fontWeight={600}>
          {title}
        </Typography>
        <Chip
          size='small'
          label={units.length}
          sx={{ bgcolor: `${color}22`, color: color, fontWeight: 700 }}
        />
        <Box sx={{ flex: 1 }} />
        {hint && (!expanded || showHintWhenExpanded) && (
          <Typography variant='caption' color='text.secondary'>
            {hint}
          </Typography>
        )}
      </Box>

      {/* Section body */}
      <Collapse in={expanded}>
        {units.length === 0 ? (
          <Box>
            <Typography variant='body2' color='text.secondary' sx={{ p: 2 }}>
              No {title === 'N / A' ? 'N/A' : title.toLowerCase()} units
            </Typography>
          </Box>
        ) : (
          <Box>
            <Table size='small'>
              <TableHead>
                <TableRow>
                  <TableCell width='10%'>Result</TableCell>
                  <TableCell width='24%'>Slug</TableCell>
                  <TableCell width='18%'>Space</TableCell>
                  <TableCell width='22%'>Target</TableCell>
                  <TableCell width='12%'>Team</TableCell>
                  <TableCell width='14%'>App</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {pageUnits.map((unit) => {
                  const r = resultMap.get(unit.Unit?.UnitID ?? '');
                  return (
                    <TableRow key={unit.Unit?.UnitID ?? `${unit.Unit?.SpaceID}-${unit.Unit?.Slug}`}>
                      {/* Result — first column */}
                      <TableCell>
                        {(() => {
                          if (!r || r.notApplicable)
                            return (
                              <Box sx={{ display: 'flex', alignItems: 'center', height: '100%' }}>
                                <RemoveCircleOutlineIcon sx={{ fontSize: 16, color: 'text.disabled' }} />
                              </Box>
                            );
                          if (r.success)
                            return (
                              <Tooltip title='Policy check passed' arrow placement='right'>
                                <Stack direction='row' spacing={0.5} alignItems='center'>
                                  <CheckCircleIcon sx={{ fontSize: 16, color: '#2e7d32' }} />
                                  <Typography variant='caption' sx={{ color: '#2e7d32' }}>Pass</Typography>
                                </Stack>
                              </Tooltip>
                            );
                          const violations = r.violations ?? [];
                          const violationCount = violations.length;
                          const label = violationCount > 0
                            ? `${violationCount} violation${violationCount !== 1 ? 's' : ''}`
                            : (r.message ?? 'Failed');
                          const tooltipContent = violationCount > 0
                            ? <ViolationTooltip violations={violations} />
                            : (r.message ?? 'Failed');
                          return (
                            <Tooltip
                              title={tooltipContent}
                              arrow
                              placement='right'
                              slotProps={{
                                tooltip: {
                                  sx: violationCount > 0 ? VIOLATION_TOOLTIP_SX : undefined,
                                },
                              }}
                            >
                              <Box sx={{ display: 'flex', alignItems: 'center', height: '100%' }}>
                                <Chip
                                  icon={<CancelIcon sx={{ fontSize: '14px !important', color: '#c62828 !important' }} />}
                                  label={label}
                                  size='small'
                                  sx={{
                                    height: 22,
                                    fontSize: '0.7rem',
                                    fontWeight: 600,
                                    bgcolor: '#ffebee',
                                    color: '#c62828',
                                    cursor: 'default',
                                    '& .MuiChip-label': { px: 0.75 },
                                  }}
                                />
                              </Box>
                            </Tooltip>
                          );
                        })()}
                      </TableCell>
                      {/* Slug */}
                      <TableCell>
                        <MuiLink
                          component={RouterLink}
                          to={`/units/${unit.Unit?.SpaceID}/${unit.Unit?.UnitID}`}
                          sx={{ fontSize: '0.8125rem' }}
                        >
                          {unit.Unit?.Slug}
                        </MuiLink>
                      </TableCell>
                      {/* Space */}
                      <TableCell>
                        <Typography variant='body2' color='text.secondary'>
                          {unit.Space?.Slug ?? '—'}
                        </Typography>
                      </TableCell>
                      {/* Target */}
                      <TableCell>
                        <Typography variant='body2' color='text.secondary'>
                          {unit.Target?.Slug ?? '—'}
                        </Typography>
                      </TableCell>
                      {/* Team */}
                      <TableCell>
                        {unit.Unit?.Labels?.['Team'] ? (
                          <Chip
                            label={unit.Unit.Labels['Team']}
                            size='small'
                            variant='outlined'
                          />
                        ) : null}
                      </TableCell>
                      {/* App */}
                      <TableCell>
                        {unit.Unit?.Labels?.['App'] ? (
                          <Chip
                            label={unit.Unit.Labels['App']}
                            size='small'
                            variant='outlined'
                          />
                        ) : null}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            {/* Pagination — only render when there is more than one page */}
            {pageSize !== undefined && units.length > pageSize && (
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'flex-end',
                  gap: 1,
                  px: 2,
                  py: 1,
                  borderTop: '1px solid',
                  borderColor: 'divider',
                }}
              >
                <Typography variant='caption' color='text.secondary'>
                  Showing {page * pageSize + 1}–{Math.min((page + 1) * pageSize, units.length)} of{' '}
                  {units.length}
                </Typography>
                <IconButton
                  size='small'
                  onClick={() => setPage((p) => p - 1)}
                  disabled={page === 0}
                >
                  <ChevronLeftIcon sx={{ fontSize: 16 }} />
                </IconButton>
                <IconButton
                  size='small'
                  onClick={() => setPage((p) => p + 1)}
                  disabled={(page + 1) * pageSize >= units.length}
                >
                  <ChevronRightIcon sx={{ fontSize: 16 }} />
                </IconButton>
              </Box>
            )}
          </Box>
        )}
      </Collapse>
    </Box>
  );
};

export const InitiativeCheckResultGrid = ({
  units,
  checkResults,
  filterConditions,
  setFilters,
  onClearFilters,
  filterElement,
}: InitiativeCheckResultGridProps) => {
  const groups = useMemo(() => groupCheckResults(units, checkResults), [units, checkResults]);
  const resultMap = useMemo(
    () => new Map(checkResults.map((r) => [r.unitId, r])),
    [checkResults],
  );

  const handleRemoveFilter = useCallback(
    (id: string) => setFilters(filterConditions.filter((f) => f.id !== id)),
    [filterConditions, setFilters],
  );

  return (
    <Box sx={{ border: '1px solid', borderColor: 'divider', bgcolor: 'background.paper' }}>
      <CheckResultGridToolbar
        filterConditions={filterConditions}
        onRemoveFilter={handleRemoveFilter}
        onClearFilters={onClearFilters}
        filterElement={filterElement}
      />
      <ResultSection
        title='Failing'
        color='#c62828'
        units={groups.failing}
        resultMap={resultMap}
        defaultExpanded={true}
        pageSize={undefined}
      />
      <ResultSection
        title='Passing'
        color='#2e7d32'
        units={groups.passing}
        resultMap={resultMap}
        defaultExpanded={true}
        pageSize={6}
      />
      <ResultSection
        title='N / A'
        color='#757575'
        units={groups.notApplicable}
        resultMap={resultMap}
        defaultExpanded={false}
        hint='No config data to validate · click to expand'
        pageSize={undefined}
      />
    </Box>
  );
};
