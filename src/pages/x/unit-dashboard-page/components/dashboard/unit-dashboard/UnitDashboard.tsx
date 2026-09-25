// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { useCallback, useState } from 'react';

import { type GroupByOption } from '@/components/group-by-selector/GroupBySelector';
import { UnitStatusCards } from '@/components/unit-status-cards/UnitStatusCards';
import { type ExtendedUnitRead, UnitRead } from '@confighub/rtk-query';

import { ActivityCard } from './ActivityCard';
import { ConfigEditor } from './ConfigEditor';
import { DashboardHeader } from './DashboardHeader';
import { DetailCard } from './DetailCard';

export interface IUnitDetailDashboardProps {
  unit: ExtendedUnitRead;
  groupBy: GroupByOption;
}

export const UnitDashboard = ({ unit, groupBy }: IUnitDetailDashboardProps) => {
  const [isEditMode, setIsEditMode] = useState(false);

  const handleEditConfig = useCallback(() => {
    setIsEditMode(true);
  }, []);

  const handleCloseEditor = useCallback(() => {
    setIsEditMode(false);
  }, []);

  return isEditMode ? (
    <ConfigEditor unit={unit} onClose={handleCloseEditor} />
  ) : (
    <>
      <DashboardHeader unit={unit} groupBy={groupBy} onEditConfig={handleEditConfig} />
      <UnitStatusCards unit={unit} />
      <DetailCard unit={unit} />
      <ActivityCard unit={unit.Unit || ({} as UnitRead)} />
    </>
  );
};
