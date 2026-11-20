// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
//
// The upstream Unit's "space/unit" label, for the withheld change's revision peek (contract D4,
// section 4 fd-peek-revision: "rev, source Unit, value"). From the Unit read's expanded upstream
// when it has it; else the upstream Space and Unit are read by id (shared RTK cache entries).
import { type GetUnitApiResponse, useGetSpaceQuery, useGetUnitQuery } from '@confighub/rtk-query';

export function useUpstreamLabel(unitRead: GetUnitApiResponse | undefined): string | undefined {
  const spaceId = unitRead?.Unit?.UpstreamSpaceID ?? '';
  const unitId = unitRead?.Unit?.UpstreamUnitID ?? '';
  const expanded =
    unitRead?.UpstreamSpace?.Slug && unitRead.UpstreamUnit?.Slug ? `${unitRead.UpstreamSpace.Slug}/${unitRead.UpstreamUnit.Slug}` : undefined;
  const skip = Boolean(expanded) || !spaceId || !unitId;
  const space = useGetSpaceQuery({ spaceId }, { skip }).currentData?.Space?.Slug;
  const unit = useGetUnitQuery({ spaceId, unitId }, { skip }).currentData?.Unit?.Slug;
  if (expanded) return expanded;
  return space && unit ? `${space}/${unit}` : undefined;
}
