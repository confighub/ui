// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * Checking one gate of a Unit again: the Unit page's request (its gate card's
 * "Run"), from the View explorer's row panel.
 *
 * It runs the gate's Trigger on the Unit's current config and returns what the
 * gate says. It does not set `UpdateValidationResults`, so nothing is stored:
 * the check is for display only. The generated `invokeFunctionsOnOrg` sends
 * the same request, but invalidates Unit, Revision, Mutation, UnitEvent and
 * Resource (`FUNCTION_INVOKE` in `invalidationMap.ts`). Through it, each check
 * would refetch every Unit of the explorer's rows, although it wrote nothing.
 * This endpoint sends the same request and invalidates nothing.
 */
import {
  type FunctionInvocationsRequest,
  type InvokeFunctionsOnOrgApiResponse,
  confighubApi,
} from '@confighub/rtk-query';

export interface CheckUnitGateArg {
  spaceId: string;
  unitId: string;
  toolchainType: string;
  /** The Trigger that produced the gate (the Unit's `ValidationTriggerIDs`). */
  triggerId: string;
}

/** The request body, as the Unit page sends it: the one Trigger, every function run, nothing stored. */
export function gateCheckBody(arg: Pick<CheckUnitGateArg, 'toolchainType' | 'triggerId'>): FunctionInvocationsRequest {
  return { ToolchainType: arg.toolchainType, Triggers: [arg.triggerId], StopOnError: false, FunctionInvocations: null };
}

const gateCheckApi = confighubApi.injectEndpoints({
  endpoints: (build) => ({
    checkUnitGate: build.mutation<InvokeFunctionsOnOrgApiResponse, CheckUnitGateArg>({
      query: (arg) => ({
        url: '/function/invoke',
        method: 'POST',
        body: gateCheckBody(arg),
        params: { executor_space: arg.spaceId, where: `UnitID = '${arg.unitId}'` },
      }),
    }),
  }),
});

export const { useCheckUnitGateMutation } = gateCheckApi;
