// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import { type GroupByOption } from '@/components/group-by-selector/GroupBySelector';
import { useAppDispatch, useAppSelector } from '@/hooks/useApp';
import {
  type ExtendedUnitRead,
  useListAllUnitsQuery,
} from '@confighub/rtk-query';
import {
  selectUnitDashboardGroupBy,
  setSelectedUnits,
  setUnitDashboardGroupBy,
} from '@/state/slices/selectedUnits';
import { FILTER_URL_PARAMS } from '@/utility/constants/url-params';
import { filterUnitIds } from '@/utility/tree-selection-utils';
import Box from '@mui/material/Box';
import { styled } from '@mui/material/styles';

import { TreeNav } from './components/TreeNav';
import { Dashboard } from './components/dashboard/Dashboard';

const PageContainer = styled(Box)({
  display: 'flex',
  height: '100%',
  width: '100%',
});

const HierarchyPanel = styled(Box)({
  width: 400,
  flexShrink: 0,
  minHeight: 0,
  alignSelf: 'stretch',
  overflow: 'hidden',
});

const DetailPanel = styled(Box)(({ theme }) => ({
  flex: 1,
  minHeight: 0,
  backgroundColor: theme.palette.background.default,
  overflow: 'auto',
}));

export const UnitDashboardPage = () => {
  const [selectedUnitIds, setSelectedUnitIds] = useState<string[]>([]);
  const [searchParams, setSearchParams] = useSearchParams();

  const dispatch = useAppDispatch();
  const groupBy = useAppSelector(selectUnitDashboardGroupBy);

  // Read filter params from URL
  const where = searchParams.get(FILTER_URL_PARAMS.WHERE) || '';
  const whereData = searchParams.get(FILTER_URL_PARAMS.WHERE_DATA) || '';

  // Fetch units with current filters — poll every 30s so the heatmap and
  // status cards (In Progress, Synced) stay current without manual refresh.
  const { data: units = [], isLoading } = useListAllUnitsQuery(
    {
      where,
      whereData,
      include:
        'SpaceID,TargetID,UpstreamUnitID,UnitEventID,HeadRevisionNum,LastReleasedRevisionNum',
    },
    { pollingInterval: 5_000, refetchOnFocus: true },
  );

  // Build a map for resolving unit IDs to ExtendedUnitRead objects
  const unitMap = useMemo(() => {
    const map = new Map<string, ExtendedUnitRead>();
    units.forEach((unit) => {
      const id = unit.Unit?.UnitID;
      if (id) map.set(id, unit);
    });
    return map;
  }, [units]);

  // Handle group by change
  const handleGroupByChange = (option: GroupByOption) => {
    dispatch(setUnitDashboardGroupBy(option));
  };

  const handleFilterByIds = (ids: string[]) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (ids.length === 0) {
        next.delete(FILTER_URL_PARAMS.WHERE);
      } else {
        next.set(
          FILTER_URL_PARAMS.WHERE,
          `UnitID IN (${ids.map((id) => `'${id}'`).join(',')})`,
        );
      }
      return next;
    });
  };

  // Handle multi-select changes - ids may include group node IDs for tree checkbox sync
  const handleMultiSelectChange = (ids: string[]) => {
    setSelectedUnitIds(ids);
    // Only resolve actual unit IDs (not group nodes) to ExtendedUnitRead objects
    const unitOnlyIds = filterUnitIds(ids);
    const resolvedUnits = unitOnlyIds
      .map((id) => unitMap.get(id))
      .filter((u): u is ExtendedUnitRead => u !== undefined);
    dispatch(setSelectedUnits({ units: resolvedUnits }));
  };

  return (
    <PageContainer>
      <HierarchyPanel>
        <TreeNav
          units={units}
          isLoading={isLoading}
          groupBy={groupBy}
          onGroupByChange={handleGroupByChange}
          selectedUnitIds={selectedUnitIds}
          onMultiSelectChange={handleMultiSelectChange}
        />
      </HierarchyPanel>
      <DetailPanel>
        <Dashboard
          units={units.filter((unit) => selectedUnitIds.includes(unit?.Unit?.UnitID || ''))}
          allUnits={units}
          isLoading={isLoading}
          groupBy={groupBy}
          selectedUnitIds={selectedUnitIds}
          onSelectUnits={handleMultiSelectChange}
          onFilterByIds={handleFilterByIds}
        />
      </DetailPanel>
    </PageContainer>
  );
};

export default UnitDashboardPage;
