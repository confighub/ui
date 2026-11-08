// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { type InvocationRead, useListAllInvocationsQuery } from '@confighub/rtk-query';

/**
 * The Invocation an Invoke ChangeOrder runs, as stored. Read with the arguments
 * `useInvocationSource` reads it with, so the two share one request; an update of the Invocation
 * invalidates it, and the page reads the new Clearance, Guards and Version.
 */
export function useChangeOrderInvocation(invocationId: string | undefined, skip: boolean): InvocationRead | undefined {
  const { data } = useListAllInvocationsQuery(
    { where: `InvocationID = '${invocationId ?? ''}'`, include: 'SpaceID' },
    { skip: skip || invocationId === undefined },
  );
  return skip ? undefined : data?.[0]?.Invocation;
}
