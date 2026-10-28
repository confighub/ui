// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { useMemo } from 'react';

import { useListAllInvocationsQuery } from '@confighub/rtk-query';

import { type DraftSavedInvocation, savedInvocationOf } from './draftKinds';
import { useRetry } from './useRetry';

export interface DraftInvocationsRead {
  /** Every saved Invocation the reader can see; `undefined` while it is read, or when it is not needed. */
  invocations: DraftSavedInvocation[] | undefined;
  /** Whether the list is read at all. */
  needed: boolean;
  isError: boolean;
  retry: () => void;
}

/**
 * The org's saved Invocations, read only for an Invoke draft: what it can run. Another kind of
 * draft never waits for them, nor fails with them.
 *
 * `extra` are Invocations this page saved itself, held until the list has them too.
 */
export function useDraftInvocations(needed: boolean, extra: readonly DraftSavedInvocation[]): DraftInvocationsRead {
  const read = useListAllInvocationsQuery({}, { skip: !needed });
  const invocations = useMemo(() => {
    if (!needed || read.currentData === undefined) return undefined;
    const listed = read.currentData.flatMap((entry) => {
      const invocation = savedInvocationOf(entry.Invocation);
      return invocation === undefined ? [] : [invocation];
    });
    const known = new Set(listed.map((invocation) => invocation.invocationId));
    return [...listed, ...extra.filter((invocation) => !known.has(invocation.invocationId))];
  }, [needed, read.currentData, extra]);
  const retry = useRetry([read]);
  return { invocations, needed, isError: needed && read.isError, retry };
}
