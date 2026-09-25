// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { useMemo } from 'react';

import {
  ListAllUnitsApiResponse,
  ListFunctionsApiResponse,
  UnitRead,
} from '@confighub/rtk-query';
import { type RevisionRow } from '@/types';

interface UseUnitComputedDataProps {
  currentUnit: UnitRead | null;
  upstreamUnit: UnitRead | null;
  revisions: Array<RevisionRow>;
  downstreamUnits: ListAllUnitsApiResponse;
  unitsUpgraded: boolean;
  preUpgradeRevisionNum: number | null;
  postUpgradeRevisionNum: number | null;
  functions: ListFunctionsApiResponse;
}

export const useUnitComputedData = ({
  currentUnit,
  upstreamUnit,
  revisions,
  downstreamUnits,
  unitsUpgraded,
  preUpgradeRevisionNum,
  postUpgradeRevisionNum,
  functions,
}: UseUnitComputedDataProps) => {
  const canUpgradeUnit = useMemo(() => {
    return (upstreamUnit?.HeadRevisionNum ?? 0) > (currentUnit?.UpstreamRevisionNum ?? 0);
  }, [upstreamUnit?.HeadRevisionNum, currentUnit?.UpstreamRevisionNum]);

  const currentHeadRevision = useMemo(() => {
    return revisions.find((revision) => revision.RevisionNum === currentUnit?.HeadRevisionNum)
      ?.Revision;
  }, [revisions, currentUnit?.HeadRevisionNum]);

  const downStreamPushUnavailable = useMemo(() => {
    return (downstreamUnits?.length ?? 0) === 0 || unitsUpgraded;
  }, [downstreamUnits?.length, unitsUpgraded]);

  const preUpgradeRevision = useMemo(() => {
    return revisions.find((r) => r.RevisionNum === preUpgradeRevisionNum);
  }, [revisions, preUpgradeRevisionNum]);

  const postUpgradeRevision = useMemo(() => {
    return revisions.find((r) => r.RevisionNum === postUpgradeRevisionNum);
  }, [revisions, postUpgradeRevisionNum]);

  const functionOptions = Object.entries(functions).flatMap(([category, funcs]) =>
    Object?.values(funcs).map((func) => ({
      category,
      ...func,
    })),
  );

  return {
    canUpgradeUnit,
    currentHeadRevision,
    downStreamPushUnavailable,
    preUpgradeRevision,
    postUpgradeRevision,
    functionOptions,
  };
};
