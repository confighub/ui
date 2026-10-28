// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { useMemo } from 'react';

import { useSearchUnitDataChunkedQuery } from '@/hooks/chunkedQueriesApi';
import { type FunctionSignature, useListFunctionsQuery } from '@confighub/rtk-query';

import type { DraftBaseUnit } from './draftChangeCards';
import type { DraftAddress, DraftDecisions } from './draftDecisions';
import { type DraftInvoke, type DraftInvokeLast, resolveInvokeDraft } from './draftInvoke';
import {
  type DraftSavedInvocation,
  containerOptionsOf,
  containerUsesOf,
  resourceOptionOf,
} from './draftKinds';
import type { DraftPastChangeOrder, DraftReadStatus } from './draftTypes';
import type { DraftInvocationsRead } from './useDraftInvocations';
import { useRetry } from './useRetry';

/** The toolchain a base whose Units say none is taken to be in. */
const KUBERNETES = 'Kubernetes/YAML';

/** The toolchain most of the base's Units are in: what its functions and Invocations are listed under. */
function toolchainOf(units: readonly DraftBaseUnit[]): string {
  const counts = new Map<string, number>();
  for (const unit of units) if (unit.toolchainType !== undefined) counts.set(unit.toolchainType, (counts.get(unit.toolchainType) ?? 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] ?? KUBERNETES;
}

const NO_INVOCATIONS: readonly DraftSavedInvocation[] = [];

export interface DraftInvokeRead {
  /** `undefined` for a Base changes draft. */
  invoke: DraftInvoke | undefined;
  /** The function list and the base's configuration. */
  status: DraftReadStatus;
  retry: () => void;
}

export interface UseDraftInvokeArgs {
  address: DraftAddress;
  decisions: DraftDecisions | undefined;
  baseSpace: { spaceId: string; slug: string } | undefined;
  baseUnits: readonly DraftBaseUnit[];
  /** Every saved Invocation the reader can see (`useDraftInvocations`). */
  invocationsRead: DraftInvocationsRead;
  /** This base's ChangeOrders, newest first: which Invocations ran here. */
  pastChangeOrders: readonly DraftPastChangeOrder[];
}

/**
 * An Invoke draft's decisions (`resolveInvokeDraft`), from what they are worked out of: the
 * functions the base's toolchain has (`listFunctions`, the generated, tagged read), and the base's
 * configuration, for its containers and resources (`searchUnitDataChunked`). Nothing is read for
 * a Base changes draft.
 */
export function useDraftInvoke({
  address,
  decisions,
  baseSpace,
  baseUnits,
  invocationsRead,
  pastChangeOrders,
}: UseDraftInvokeArgs): DraftInvokeRead {
  const { invocations } = invocationsRead;
  const kind = decisions?.kind.value;
  const invokes = kind === 'invoke';
  const functionsRead = useListFunctionsQuery({ spaceId: baseSpace?.spaceId ?? '' }, { skip: !invokes || baseSpace === undefined });
  const unitIds = useMemo(() => baseUnits.map((unit) => unit.unitId), [baseUnits]);
  const dataRead = useSearchUnitDataChunkedQuery({ unitIds }, { skip: !invokes || unitIds.length === 0 });

  const toolchainType = useMemo(() => toolchainOf(baseUnits), [baseUnits]);
  const functions = useMemo(() => {
    const listed = functionsRead.currentData?.[toolchainType];
    if (listed === undefined) return functionsRead.currentData === undefined ? undefined : new Map<string, FunctionSignature>();
    return new Map(Object.entries(listed));
  }, [functionsRead.currentData, toolchainType]);

  const dataBySlug = useMemo(() => {
    const slugOf = new Map(baseUnits.map((unit) => [unit.unitId, unit.slug]));
    return new Map((dataRead.currentData ?? []).flatMap((row) => (row.UnitID === undefined ? [] : [[slugOf.get(row.UnitID) ?? '', row.Data ?? ''] as const])));
  }, [dataRead.currentData, baseUnits]);
  const dataResolved = unitIds.length === 0 || dataRead.currentData !== undefined;
  const containers = useMemo(
    () => (dataResolved ? containerOptionsOf(baseUnits.flatMap((unit) => containerUsesOf(unit.slug, dataBySlug.get(unit.slug)))) : undefined),
    [dataResolved, baseUnits, dataBySlug],
  );
  const resources = useMemo(
    () => (dataResolved ? baseUnits.map((unit) => resourceOptionOf(unit.slug, dataBySlug.get(unit.slug))) : undefined),
    [dataResolved, baseUnits, dataBySlug],
  );

  // Last time, where the ChangeOrder re-aimed ran an Invocation: whichever function it was.
  const template = decisions?.template.kind === 'changeOrder' ? decisions.template.changeOrder : undefined;
  const last = useMemo((): DraftInvokeLast | undefined => {
    if (template === undefined || template.updateType !== 'Invoke') return undefined;
    const order = template.changeOrder;
    const invocation = (invocations ?? []).find((candidate) => candidate.invocationId === order.InvocationID);
    return { invocation, parameters: (order.Parameters ?? {}) as Record<string, unknown>, whereUnit: order.WhereUnit ?? '' };
  }, [template, invocations]);

  // The Invocations this base's Invoke ChangeOrders ran, newest run first (the list is newest first).
  const ranHere = useMemo(
    () =>
      pastChangeOrders.flatMap((order) =>
        order.updateType === 'Invoke' && order.changeOrder.InvocationID ? [order.changeOrder.InvocationID] : [],
      ),
    [pastChangeOrders],
  );
  const name = decisions?.name.value ?? '';
  const invoke = useMemo(() => {
    if (!invokes || baseSpace === undefined) return undefined;
    return resolveInvokeDraft({
      address,
      last,
      invocations: invocations ?? NO_INVOCATIONS,
      functions,
      toolchainType,
      containers,
      resources,
      baseSpaceId: baseSpace.spaceId,
      baseSpaceSlug: baseSpace.slug,
      ranHere,
      name,
    });
  }, [invokes, baseSpace, address, last, invocations, functions, toolchainType, containers, resources, ranHere, name]);

  const retry = useRetry([functionsRead, dataRead], invocationsRead.retry);
  const failed = invokes && (functionsRead.isError || dataRead.isError || invocationsRead.isError);
  const loading = invokes && (functions === undefined || !dataResolved || invocations === undefined);
  let status: DraftReadStatus = 'resolved';
  if (failed) status = 'failed';
  else if (loading) status = 'loading';
  return { invoke, status, retry };
}
