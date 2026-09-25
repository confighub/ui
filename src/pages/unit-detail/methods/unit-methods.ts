// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { UnitRead } from '@confighub/rtk-query';
import { formatRelative } from '@/utility/date-format';

export const getUpstreamUnitsList = (currentUnit: UnitRead, units: Array<UnitRead>) => {
  const upstreamUnitID = currentUnit?.UpstreamUnitID ?? '';
  const upstreamUnits = units?.filter((unit) => unit?.UnitID === upstreamUnitID);

  return [currentUnit, ...upstreamUnits]?.map((unit) => ({
    id: unit?.UnitID ?? '',
    name: unit?.DisplayName ?? '',
    updatedAt: formatRelative(unit?.UpdatedAt),
  }));
};
