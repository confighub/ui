// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { useMemo } from 'react';

import { type ListAllResourcesApiArg, useListAllResourcesQuery } from '@confighub/rtk-query';

import { DELIVERY_RESOURCE_WHERE, type DeliveryResource } from './deliveryGraph';

/** Every resource that can deliver a Space, with the configuration its source is read from. */
export const DELIVERY_RESOURCE_QUERY: Pick<ListAllResourcesApiArg, 'where' | 'select'> = {
  where: DELIVERY_RESOURCE_WHERE,
  select: 'ResourceID,SpaceID,UnitID,UnitSlug,ResourceType,ResourceName,Data',
};

/**
 * The resources that can deliver a Space, across the organization. `resources`
 * is undefined until they have been read, which is not the same as there being
 * none. Every caller makes the same request, so they share one read.
 */
export function useDeliveryResources({ skip = false }: { skip?: boolean } = {}) {
  const { data, error, isLoading, refetch } = useListAllResourcesQuery(DELIVERY_RESOURCE_QUERY, { skip });
  const resources = useMemo<DeliveryResource[] | undefined>(
    () =>
      data?.flatMap((row) => {
        const r = row.Resource;
        if (!r?.ResourceID || !r.SpaceID || !r.UnitID || !r.ResourceType || !r.ResourceName) return [];
        return [
          {
            resourceId: r.ResourceID,
            spaceId: r.SpaceID,
            unitId: r.UnitID,
            unitSlug: r.UnitSlug,
            resourceType: r.ResourceType,
            resourceName: r.ResourceName,
            data: r.Data,
          },
        ];
      }),
    [data],
  );
  return { resources, error, isLoading, refetch };
}
