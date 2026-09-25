// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import { useCallback, useEffect, useMemo } from 'react';

import { type ExtendedUnitRead, useListAllUnitsQuery } from '@confighub/rtk-query';
import type { UnitCheckResult } from '@/types/initiative';
import { INITIATIVE_INCLUDE, INITIATIVE_SELECT } from '../utils/checkResultHelpers';
import { InitiativeUnitsGrid } from './InitiativeUnitsGrid';
import FilterAltOffIcon from '@mui/icons-material/FilterAltOff';
import LayersIcon from '@mui/icons-material/Layers';

import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import Typography from '@mui/material/Typography';
import { useTheme } from '@mui/material/styles';

interface InitiativeResultsPanelProps {
  /** WHERE clause built by the QueryBuilder in the settings panel */
  whereClause: string;
  /** WHERE DATA clause for content-based filtering */
  whereDataClause?: string;
  /** Resource type for content-based filtering */
  resourceTypeClause?: string;
  /** Callback that provides the scope container DOM node for portal rendering */
  onScopeContainerReady?: (node: HTMLElement | null) => void;
  /** Check results from the Kyverno policy test */
  checkResults?: UnitCheckResult[] | null;
  /** Whether a test is currently running */
  isTestRunning?: boolean;
  /** Currently selected unit IDs in the grid (for piping into the Invoker context). */
  selectedUnitIds?: string[];
  /** Selection change handler. Presence of this prop enables checkbox selection. */
  onRowSelectionChange?: (selectedUnits: string[]) => void;
  /** Reports the in-scope units up to the parent so it can mirror selection into Redux. */
  onUnitsLoaded?: (units: ExtendedUnitRead[]) => void;
}

const EmptyState = ({ hasFilter }: { hasFilter: boolean }) => {
  const theme = useTheme();

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        gap: 2,
        color: theme.palette.text.secondary,
        p: 4,
      }}
    >
      {hasFilter ? (
        <>
          <FilterAltOffIcon sx={{ fontSize: 48, opacity: 0.4 }} />
          <Typography variant='body1' fontWeight={500}>
            No units match
          </Typography>
          <Typography variant='body2' textAlign='center' sx={{ maxWidth: 300 }}>
            Try adjusting your scope filters to include more units.
          </Typography>
        </>
      ) : (
        <>
          <LayersIcon sx={{ fontSize: 48, opacity: 0.4 }} />
          <Typography variant='body1' fontWeight={500}>
            No scope defined yet
          </Typography>
          <Typography variant='body2' textAlign='center' sx={{ maxWidth: 300 }}>
            Add filters on the left to define which units are in scope for this initiative.
          </Typography>
        </>
      )}
    </Box>
  );
};

/**
 * Right pane of the initiative creation split-view.
 * Shows a live-updating list of units that match the current scope filters.
 * Defaults to showing only Slug, Space, Target, and Labels columns.
 */
export const InitiativeResultsPanel = ({ whereClause, whereDataClause, resourceTypeClause, onScopeContainerReady, checkResults, isTestRunning, selectedUnitIds, onRowSelectionChange, onUnitsLoaded }: InitiativeResultsPanelProps) => {
  const { data: units = [], isFetching } = useListAllUnitsQuery(
    {
      where: whereClause || undefined,
      whereData: whereDataClause || undefined,
      resourceType: resourceTypeClause || undefined,
      include: INITIATIVE_INCLUDE,
      select: INITIATIVE_SELECT,
    },
    { skip: false },
  );

  // Surface loaded units up to the editor so it can resolve the selected IDs
  // back to full ExtendedUnitRead objects for the global Invoker context.
  useEffect(() => {
    onUnitsLoaded?.(units);
  }, [units, onUnitsLoaded]);

  const unitCount = units.length;
  const hasFilter = whereClause.length > 0;

  const countLabel = useMemo(() => {
    if (isFetching) return 'Loading…';
    return `${unitCount} unit${unitCount !== 1 ? 's' : ''} in scope`;
  }, [unitCount, isFetching]);

  /** Callback ref that provides the portal target node to the parent (for InitiativeSettingsPanel's portal). */
  const portalRef = useCallback(
    (node: HTMLElement | null) => {
      onScopeContainerReady?.(node);
    },
    [onScopeContainerReady],
  );

  /** Portal target rendered inside the grid toolbar via filterElement. */
  const filterElement = useMemo(
    () => (onScopeContainerReady ? <Box ref={portalRef} /> : undefined),
    [onScopeContainerReady, portalRef],
  );

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, maxHeight: '100vh', overflow: 'hidden' }}>
      {/* Summary bar */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1.5,
          px: 3,
          py: 2,
          borderBottom: '1px solid',
          borderColor: 'divider',
          flexShrink: 0,
        }}
      >
        <Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <Typography variant='h6' fontWeight={600}>
              Unit Scope
            </Typography>
            {isFetching || isTestRunning ? (
              <CircularProgress size={16} thickness={4} />
            ) : (
              <Chip
                label={countLabel}
                size='small'
                color={unitCount > 0 ? 'primary' : 'default'}
                variant={unitCount > 0 ? 'filled' : 'outlined'}
              />
            )}
          </Box>
          <Typography variant='body2' color='text.secondary'>
            The compliance policy will only run against units in this scope.
          </Typography>
        </Box>
      </Box>

      {/* Content — grid fills remaining space; rows scroll internally */}
      <Box sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', '& .MuiDataGrid-main': { overflow: 'hidden !important' }, '& .MuiDataGrid-scrollbar--vertical': { display: 'none' } }}>
        <InitiativeUnitsGrid
          autoHeight={false}
          units={units}
          isLoading={isFetching}
          checkResults={checkResults}
          filterElement={filterElement}
          noRowsOverlay={<EmptyState hasFilter={hasFilter} />}
          selectedUnitIds={selectedUnitIds}
          onRowSelectionChange={onRowSelectionChange}
        />
      </Box>
    </Box>
  );
};
