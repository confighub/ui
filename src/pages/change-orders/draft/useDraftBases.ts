// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { useCallback, useMemo } from 'react';

import { useListComponentsQuery, useListSpacesQuery } from '@confighub/rtk-query';

import {
  type DraftBase,
  type PickerBaseUnit,
  type PickerComponent,
  type PickerRow,
  type PickerSpace,
  type PickerVariantUnit,
  draftBases,
  groupBySpace,
  lastBaseChangeOrderBySpace,
  lastChangeOrderBySpace,
  upstreamOfSpace,
  waitingOf,
} from './newChangeOrderModel';
import {
  useListPickerBaseUnitsQuery,
  useListPickerChangeOrdersQuery,
  useListPickerVariantUnitsQuery,
} from './pickerReadsApi';

export type DraftBasesStatus = 'loading' | 'failed' | 'resolved';

export interface DraftBases {
  bases: DraftBase[];
  status: DraftBasesStatus;
  retry: () => void;
}

/**
 * Every Component's base a draft can be made in: two reads, the Spaces in a Component and the
 * Components, however many there are.
 */
export function useDraftBases(): DraftBases {
  const spacesRead = useListSpacesQuery({
    where: 'ComponentID IS NOT NULL',
    select: 'SpaceID,Slug,ComponentID,UpstreamSpaceID,Annotations',
  });
  const componentsRead = useListComponentsQuery({ select: 'ComponentID,Slug,DisplayName' });

  const bases = useMemo(() => {
    const spaces: PickerSpace[] = (spacesRead.currentData ?? []).flatMap((entry) => {
      const space = entry.Space;
      if (space?.SpaceID === undefined || !space.ComponentID) return [];
      return [
        {
          spaceId: space.SpaceID,
          slug: space.Slug,
          componentId: space.ComponentID,
          upstreamSpaceId: upstreamOfSpace(space),
        },
      ];
    });
    const components: PickerComponent[] = (componentsRead.currentData ?? []).flatMap(
      (entry) => {
        const component = entry.Component;
        if (component?.ComponentID === undefined) return [];
        return [
          {
            componentId: component.ComponentID,
            slug: component.Slug,
            name: component.DisplayName ?? '',
          },
        ];
      },
    );
    return draftBases(spaces, components);
  }, [spacesRead.currentData, componentsRead.currentData]);

  const { refetch: refetchSpaces } = spacesRead;
  const { refetch: refetchComponents } = componentsRead;
  const spacesFailed = spacesRead.isError;
  const componentsFailed = componentsRead.isError;
  const retry = useCallback(() => {
    if (spacesFailed) void refetchSpaces();
    if (componentsFailed) void refetchComponents();
  }, [spacesFailed, componentsFailed, refetchSpaces, refetchComponents]);

  let status: DraftBasesStatus = 'resolved';
  if (spacesFailed || componentsFailed) status = 'failed';
  else if (spacesRead.currentData === undefined || componentsRead.currentData === undefined)
    status = 'loading';
  return { bases, status, retry };
}

export interface PickerRows {
  rows: PickerRow[];
  /** The ChangeOrders, which every row needs: failed is the picker's failure. */
  status: DraftBasesStatus;
  /** The Units, which only the grouping needs: failed leaves the rows ungrouped. */
  unitsFailed: boolean;
  retry: () => void;
}

/**
 * What the picker says of each base: its last ChangeOrder, and whether changes are waiting.
 * Three more reads, made once the picker opens: the bases' ChangeOrders, the bases' Units and
 * the variants' Units, each in requests of a bounded size (`pickerReadsApi.ts`). When the
 * Units cannot be read, the rows say nothing of waiting rather than guess.
 */
export function usePickerRows(bases: readonly DraftBase[], open: boolean): PickerRows {
  const baseIds = useMemo(
    () => [...new Set(bases.map((base) => base.spaceId))].sort(),
    [bases],
  );
  const variantIds = useMemo(
    () => [...new Set(bases.flatMap((base) => base.variantSpaceIds))].sort(),
    [bases],
  );
  const skip = !open || baseIds.length === 0;
  const ordersRead = useListPickerChangeOrdersQuery({ spaceIds: baseIds }, { skip });
  const baseUnitsRead = useListPickerBaseUnitsQuery({ spaceIds: baseIds }, { skip });
  const variantUnitsRead = useListPickerVariantUnitsQuery({ spaceIds: variantIds }, { skip });

  const rows = useMemo(() => {
    const orders = (ordersRead.currentData ?? []).flatMap((entry) =>
      entry.ChangeOrder === undefined ? [] : [entry.ChangeOrder],
    );
    const last = lastChangeOrderBySpace(orders);
    const lastBase = lastBaseChangeOrderBySpace(orders);
    const baseUnits: PickerBaseUnit[] | undefined = baseUnitsRead.currentData?.flatMap(
      (entry) => {
        const unit = entry.Unit;
        if (unit?.UnitID === undefined || unit.SpaceID === undefined) return [];
        return [
          {
            unitId: unit.UnitID,
            spaceId: unit.SpaceID,
            headRevisionNum: unit.HeadRevisionNum ?? 0,
          },
        ];
      },
    );
    const variantUnits: PickerVariantUnit[] | undefined =
      variantUnitsRead.currentData?.flatMap((entry) => {
        const unit = entry.Unit;
        if (unit?.SpaceID === undefined) return [];
        return [
          {
            spaceId: unit.SpaceID,
            upstreamSpaceId: unit.UpstreamSpaceID || undefined,
            upstreamUnitId: unit.UpstreamUnitID || undefined,
            upstreamRevisionNum: unit.UpstreamRevisionNum,
          },
        ];
      });
    const baseUnitsBySpace = baseUnits === undefined ? undefined : groupBySpace(baseUnits);
    const variantUnitsBySpace =
      variantUnits === undefined ? undefined : groupBySpace(variantUnits);
    return bases.map((base): PickerRow => {
      const lastOrder = last.get(base.spaceId);
      return {
        base,
        last: lastOrder,
        waiting:
          baseUnitsBySpace === undefined || variantUnitsBySpace === undefined
            ? undefined
            : waitingOf(base, lastBase.get(base.spaceId), baseUnitsBySpace, variantUnitsBySpace),
      };
    });
  }, [bases, ordersRead.currentData, baseUnitsRead.currentData, variantUnitsRead.currentData]);

  const { refetch: refetchOrders } = ordersRead;
  const { refetch: refetchBaseUnits } = baseUnitsRead;
  const { refetch: refetchVariantUnits } = variantUnitsRead;
  const ordersFailed = ordersRead.isError;
  const baseUnitsFailed = baseUnitsRead.isError;
  const variantUnitsFailed = variantUnitsRead.isError;
  const retry = useCallback(() => {
    if (ordersFailed) void refetchOrders();
    if (baseUnitsFailed) void refetchBaseUnits();
    if (variantUnitsFailed) void refetchVariantUnits();
  }, [
    ordersFailed,
    baseUnitsFailed,
    variantUnitsFailed,
    refetchOrders,
    refetchBaseUnits,
    refetchVariantUnits,
  ]);

  let status: DraftBasesStatus = 'resolved';
  if (ordersFailed) status = 'failed';
  else if (
    baseIds.length > 0 &&
    (isPending(ordersRead) || isPending(baseUnitsRead) || isPending(variantUnitsRead))
  )
    status = 'loading';
  return { rows, status, unitsFailed: baseUnitsFailed || variantUnitsFailed, retry };
}

/** A read still on its way: no answer and no failure yet. */
function isPending(read: { currentData?: unknown; isError: boolean }): boolean {
  return read.currentData === undefined && !read.isError;
}
