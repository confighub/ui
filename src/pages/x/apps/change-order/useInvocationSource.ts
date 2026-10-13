// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * What an Invoke ChangeOrder runs: its Invocation, the values the ChangeOrder gives the
 * Invocation's parameters, and which Units of each Space it runs on.
 *
 * An Invoke ChangeOrder changes nothing until it is promoted, when the Invocation runs in
 * each Space of the stage. So its source is not a change already made somewhere but this
 * definition of one — what "At the source" shows for it.
 *
 * The ChangeOrder names the Invocation by id only, and an Invocation lives in a Space, so it
 * is read with a where clause across Spaces rather than by its Space and id.
 */

import { useMemo } from 'react';

import {
  useListAllFiltersQuery,
  useListAllInvocationsQuery,
  type FunctionInvocation,
} from '@confighub/rtk-query';

export interface InvocationSource {
  /** `loading` until the Invocation has been read; `failed` when it could not be. */
  status: 'loading' | 'resolved' | 'failed';
  invocationId: string;
  slug?: string;
  spaceId?: string;
  spaceSlug?: string;
  toolchainType?: string;
  functionInvocations: FunctionInvocation[];
  /** `ChangeOrder.Parameters`: the values the Invocation's parameters take. */
  parameters: Record<string, unknown>;
  /** `ChangeOrder.WhereUnit`. */
  whereUnit?: string;
  /** `ChangeOrder.UnitFilterID`, and the slug of the Filter it names once read. */
  unitFilterId?: string;
  unitFilterSlug?: string;
}

export function useInvocationSource(args: {
  invocationId: string | undefined;
  parameters: Record<string, unknown> | undefined;
  whereUnit: string | undefined;
  unitFilterId: string | undefined;
  skip: boolean;
}): InvocationSource | undefined {
  const { invocationId, parameters, whereUnit, unitFilterId, skip } = args;

  const { data: invocations, isError } = useListAllInvocationsQuery(
    { where: `InvocationID = '${invocationId ?? ''}'`, include: 'SpaceID' },
    { skip: skip || invocationId === undefined },
  );
  const { data: filters } = useListAllFiltersQuery(
    { where: `FilterID = '${unitFilterId ?? ''}'` },
    { skip: skip || unitFilterId === undefined },
  );

  return useMemo((): InvocationSource | undefined => {
    if (skip || invocationId === undefined) return undefined;
    const base = {
      invocationId,
      functionInvocations: [],
      parameters: parameters ?? {},
      whereUnit: whereUnit || undefined,
      unitFilterId,
      unitFilterSlug: filters?.[0]?.Filter?.Slug,
    };
    if (isError) return { ...base, status: 'failed' };
    if (invocations === undefined) return { ...base, status: 'loading' };
    const entry = invocations[0];
    const invocation = entry?.Invocation;
    if (invocation === undefined) return { ...base, status: 'failed' };
    return {
      ...base,
      status: 'resolved',
      slug: invocation.Slug,
      spaceId: invocation.SpaceID,
      spaceSlug: entry?.Space?.Slug ?? invocation.SpaceSlug,
      toolchainType: invocation.ToolchainType,
      functionInvocations: invocation.FunctionInvocations ?? [],
    };
  }, [skip, invocationId, parameters, whereUnit, unitFilterId, filters, invocations, isError]);
}
