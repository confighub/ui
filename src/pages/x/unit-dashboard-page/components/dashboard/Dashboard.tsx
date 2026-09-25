// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { useState } from 'react';

import { type GroupByOption } from '@/components/group-by-selector/GroupBySelector';
import { useUnitSelectionActions } from '@/hooks/useUnitSelectionActions';
import { type ExtendedUnitRead } from '@confighub/rtk-query';
import Box from '@mui/material/Box';

import { OverviewDashboard } from './OverviewDashboard';
import { UnitCompareView } from './UnitCompareView';
import { UnitSelectionActions } from './UnitSelectionActions';
import { UnitDashboard } from './unit-dashboard/UnitDashboard';

// ============================================================================
// TYPES
// ============================================================================

export interface IDashboardProps {
  /** Currently selected units (filtered from allUnits by selectedUnitIds) */
  units: ExtendedUnitRead[];
  /** Every unit in the list — used for the all-units overview stats */
  allUnits: ExtendedUnitRead[];
  isLoading?: boolean;
  groupBy: GroupByOption;
  selectedUnitIds: Array<string>;
  onSelectUnits: (ids: string[]) => void;
  /** Applies a URL filter so only the given unit IDs are shown in the list */
  onFilterByIds: (ids: string[]) => void;
}

// ============================================================================
// COMPONENT
// ============================================================================

export const Dashboard = ({
  units,
  allUnits,
  isLoading = false,
  groupBy,
  selectedUnitIds,
  onSelectUnits,
  onFilterByIds,
}: IDashboardProps) => {
  const {
    diffView,
    canDiff,
    canCompareUpstream,
    isFetchingUpstream,
    handleDiffUnits,
    handleCompareUpstream,
    closeDiffView,
  } = useUnitSelectionActions(units, groupBy);

  const [activeCardLabel, setActiveCardLabel] = useState<string | null>(null);

  // ── Compare view: replaces the normal content when a diff is active ──────
  if (diffView.isOpen) {
    return (
      <Box sx={{ height: '100%', width: '100%' }}>
        <UnitCompareView
          fromData={diffView.fromData}
          toData={diffView.toData}
          fromLabel={diffView.fromLabel}
          toLabel={diffView.toLabel}
          onClose={closeDiffView}
        />
      </Box>
    );
  }

  // ── Normal views: determined by how many units are selected ──────────────
  return (
    <Box
      sx={{
        height: '100%',
        width: '100%',
        overflow: 'auto',
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: (theme) => theme.palette.background.default,
      }}
    >
      {/* No selection: show overview stats for all units in the list */}
      {units.length === 0 && (
        <OverviewDashboard
          units={allUnits}
          isLoading={isLoading}
          selectedUnitIds={selectedUnitIds}
          groupBy={groupBy}
          isMultiSelect={false}
          selectedUnitId={undefined}
          activeCardLabel={activeCardLabel}
          onActiveCardChange={setActiveCardLabel}
          onSelectUnits={onSelectUnits}
          onFilterByIds={onFilterByIds}
        />
      )}

      {/* Single unit selected: show the unit's detail dashboard */}
      {units.length === 1 && (
        <Box sx={{ flexShrink: 0 }}>
          <UnitDashboard unit={units[0]} groupBy={groupBy} />
        </Box>
      )}

      {/* Multiple units selected: show aggregate overview for the selection */}
      {units.length > 1 && (
        <OverviewDashboard
          units={units}
          selectedUnitIds={selectedUnitIds}
          groupBy={groupBy}
          isMultiSelect={true}
          selectedUnitId={undefined}
          activeCardLabel={activeCardLabel}
          onActiveCardChange={setActiveCardLabel}
          onSelectUnits={onSelectUnits}
          onFilterByIds={onFilterByIds}
        />
      )}

      {/* Floating action bar — visible whenever units are selected */}
      {units.length > 0 && (
        <UnitSelectionActions
          selectedUnits={units}
          canDiff={canDiff}
          canCompareUpstream={canCompareUpstream}
          isFetchingUpstream={isFetchingUpstream}
          onDiffUnits={handleDiffUnits}
          onCompareUpstream={handleCompareUpstream}
        />
      )}
    </Box>
  );
};
