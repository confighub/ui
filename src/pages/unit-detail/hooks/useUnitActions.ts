// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { type ReactNode, useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import {
  type GuardedChange,
  guardedChanges,
  withheldSummary,
} from '@/components/guarded-write/guardedWrite';
import {
  type GuardedWriteResult,
  useGuardedWrite,
} from '@/components/guarded-write/useGuardedWrite';
import { chunkInClause } from '@/hooks/inClauseChunks';
import { useAppDispatch } from '@/hooks/useApp';
import { setAlert } from '@/state/slices/alert';
import { unitHasGuards } from '@/utility/clearance-functions';
import { getApiErrorMessage } from '@/utility/error-functions';
import {
  DeleteUnitApiArg,
  ExtendedUnitRead,
  FunctionInvocationsRequest,
  FunctionInvocationsResponse,
  FunctionSignature,
  Unit,
  UnitCreateOrUpdateResponseRead,
  UnitRead,
  useBulkPatchUnitsMutation,
  useDeleteUnitMutation,
  useInvokeFunctionsMutation,
  useInvokeFunctionsOnOrgMutation,
  useLazyGetUnitQuery,
  useLazyListAllUnitsQuery,
  useUpdateUnitMutation,
} from '@confighub/rtk-query';
import type { SerializedError } from '@reduxjs/toolkit';
import type { FetchBaseQueryError } from '@reduxjs/toolkit/query';

type Errortype = FetchBaseQueryError | SerializedError | undefined;

interface UseUnitActionsProps {
  unitId: string;
  spaceId: string;
  currentUnit: UnitRead | null;
  onRefresh: () => void;
  selectedFunction: FunctionSignature | null;
  /** Function being edited in the modal (used for invocation, doesn't affect view until complete) */
  modalFunction?: FunctionSignature | null;
  setPreUpgradeRevisionNum: (value: React.SetStateAction<number | null>) => void;
  setPostUpgradeRevisionNum: (value: React.SetStateAction<number | null>) => void;
  setIsUpgradeModalOpen: (value: React.SetStateAction<boolean>) => void;
  setUnitsUpgraded: (value: React.SetStateAction<boolean>) => void;
  setSelectedFunction: (value: React.SetStateAction<FunctionSignature | null>) => void;
  setIsEditInvocationCancelled: React.Dispatch<React.SetStateAction<boolean>>
}

interface UseUnitActionsReturn {
  // API Mutations
  invokeFunctions: ReturnType<typeof useInvokeFunctionsMutation>[0];
  deleteUnit: ReturnType<typeof useDeleteUnitMutation>[0];
  updateUnit: ReturnType<typeof useUpdateUnitMutation>[0];
  bulkPatchUnits: ReturnType<typeof useBulkPatchUnitsMutation>[0];

  // API States
  apiStates: {
    invoke: { error: Errortype; isSuccess: boolean };
    delete: { error: Errortype; isSuccess: boolean };
    update: { error: Errortype; isSuccess: boolean };
    upgrade: { error: Errortype; isSuccess: boolean };
  };

  // Action Handlers
  onUnitDeleted: () => Promise<void>;
  onUnitUpgrade: () => Promise<void>;
  onBulkUnitUpgrade: () => Promise<void>;
  onFunctionInvoked: (data: Record<string, string>) => Promise<void>;
  handleFunctionInvocation: (
    data: FunctionInvocationsResponse[],
    apiError?: string,
    preInvocationUnits?: ExtendedUnitRead[],
    func?: FunctionSignature,
  ) => Promise<void>;

  // ValidationErrors monitoring
  awaitTriggersRemoval: (
    currentUnit: UnitRead,
    timeoutMs?: number,
    onProgress?: (hasAwaitingTriggers: boolean) => void,
  ) => Promise<{ success: boolean; error?: string; finalUnit?: UnitRead }>;

  usePollingForValidationErrors: (
    unit: ExtendedUnitRead | null,
    enabled?: boolean,
    pollInterval?: number,
  ) => { unit: ExtendedUnitRead | null; lastPollTimestamp: number };

  // State
  functionInvocationError: string;
  setFunctionInvocationError: (error: string) => void;

  /** Asks about an upgrade guards would partly withhold; has to be rendered. */
  upgradeGuardDialog: ReactNode;
  /** What guards withheld from this Unit's last upgrade, which landed without it. */
  upgradeWithheld: GuardedChange[];
  setUpgradeWithheld: (withheld: GuardedChange[]) => void;
}

export const useUnitActions = ({
  unitId,
  spaceId,
  currentUnit,
  onRefresh,
  selectedFunction,
  modalFunction,
  setPreUpgradeRevisionNum,
  setPostUpgradeRevisionNum,
  setIsUpgradeModalOpen,
  setUnitsUpgraded,
  setSelectedFunction,
  setIsEditInvocationCancelled
}: UseUnitActionsProps): UseUnitActionsReturn => {
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const [functionInvocationError, setFunctionInvocationError] = useState<string>('');

  // API Mutations
  // Only the Space endpoint invokes on a Revision, so a Revision goes through its Unit's
  // Space. A Unit goes through the organization's endpoint, which selects by where alone.
  const [invokeFunctions, { error: invokeRevisionError, isSuccess: isInvokeRevisionSuccess }] =
    useInvokeFunctionsMutation();
  const [invokeFunctionsOnOrg, { error: invokeUnitError, isSuccess: isInvokeUnitSuccess }] =
    useInvokeFunctionsOnOrgMutation();
  const invokeError = invokeUnitError ?? invokeRevisionError;
  const isInvokeSuccess = isInvokeUnitSuccess || isInvokeRevisionSuccess;
  const [deleteUnit, { error: deleteError, isSuccess: isDeleteSuccess }] =
    useDeleteUnitMutation();
  const [updateUnit, { error: updateError, isSuccess: isUpdateSuccess }] =
    useUpdateUnitMutation();
  const [bulkPatchUnits, { error: bulkPatchError, isSuccess: isBulkPatchSuccess }] =
    useBulkPatchUnitsMutation();
  const [getUnit] = useLazyGetUnitQuery();
  const [listUnits] = useLazyListAllUnitsQuery();
  // Dry runs have their own instances, so a failed one is not reported as a failed upgrade.
  const [previewUpdateUnit] = useUpdateUnitMutation();
  const [previewBulkPatchUnits] = useBulkPatchUnitsMutation();
  const guardedUpgrade = useGuardedWrite('Upgrade');
  const [upgradeWithheld, setUpgradeWithheld] = useState<GuardedChange[]>([]);

  const reportFailedDryRun = (error: unknown) =>
    dispatch(
      setAlert({
        message: getApiErrorMessage(error, 'Failed to check the guards'),
        type: 'error',
        isOpen: true,
      }),
    );

  // Action Handlers
  const onUnitDeleted = async (): Promise<void> => {
    const input: DeleteUnitApiArg = {
      spaceId,
      unitId,
    };

    const result = await deleteUnit(input);
    if (result.data) {
      navigate(`/units`);
    }
  };

  const onUnitUpgrade = async () => {
    if (!currentUnit) return;
    // The confirmation is answered; what guards would withhold is asked about on its own.
    setIsUpgradeModalOpen(false);
    setUpgradeWithheld([]);
    const preUpgradeRevisionNum = currentUnit.HeadRevisionNum ?? null;
    let dryRunFailed = false;
    try {
      const result = await guardedUpgrade.start({
        guarded: unitHasGuards(currentUnit.PathAnnotations),
        run: async ({ dryRun, clearance }) => {
          dryRunFailed = dryRun;
          const response = await (dryRun ? previewUpdateUnit : updateUnit)({
            unit: currentUnit as Unit,
            spaceId,
            unitId,
            upgrade: true,
            dryRun: dryRun || undefined,
            clearance: clearance ? JSON.stringify(clearance) : undefined,
          }).unwrap();
          dryRunFailed = false;
          if (!dryRun) {
            setPreUpgradeRevisionNum(preUpgradeRevisionNum);
            setPostUpgradeRevisionNum(response.Unit?.HeadRevisionNum ?? null);
          }
          return guardedChanges(response.Conflicts, currentUnit.Slug ?? '', {
            spaceId,
            unitId,
          });
        },
      });
      if (result.status === 'written') {
        setUpgradeWithheld(result.withheld);
        onRefresh();
      }
    } catch (error) {
      // A failed upgrade is reported through apiStates.update; a failed dry run is not.
      if (dryRunFailed) reportFailedDryRun(error);
    }
  };

  const onBulkUnitUpgrade = async () => {
    const needsUpgrade = `Unit.UpstreamUnitID='${unitId}' AND Unit.UpstreamRevisionNum < UpstreamUnit.HeadRevisionNum`;
    const upgrade = (where: string, options: { dryRun: boolean; clearance?: string }) =>
      (options.dryRun ? previewBulkPatchUnits : bulkPatchUnits)({
        upgrade: true,
        include: 'UpstreamUnitID',
        where,
        dryRun: options.dryRun || undefined,
        clearance: options.clearance,
        // @ts-expect-error https://stackoverflow.com/questions/68283492/rtk-query-merge-patchjson-content-type-ruins-request-body
        body: JSON.stringify({}),
      }).unwrap();

    let dryRunFailed = false;
    let responses: UnitCreateOrUpdateResponseRead[] = [];
    let result: GuardedWriteResult;
    try {
      // Which downstream Units have guards: only those are run as a dry run first. Each is named
      // with its Space, since they can be in other Spaces than this one.
      dryRunFailed = true;
      const downstream = await listUnits({
        where: `UpstreamUnitID = '${unitId}'`,
        include: 'SpaceID',
        select: 'UnitID,Slug,SpaceID,PathAnnotations',
      }).unwrap();
      dryRunFailed = false;
      const labelByUnitId = new Map(
        downstream.map((item) => [
          item.Unit?.UnitID ?? '',
          item.Space?.Slug ? `${item.Space.Slug}/${item.Unit?.Slug}` : (item.Unit?.Slug ?? ''),
        ]),
      );
      const guarded = downstream
        .filter((item) => unitHasGuards(item.Unit?.PathAnnotations))
        .map((item) => item.Unit?.UnitID);
      const withheldIn = (items: UnitCreateOrUpdateResponseRead[]) =>
        items.flatMap((item) =>
          guardedChanges(
            item.Conflicts,
            labelByUnitId.get(item.Unit?.UnitID ?? '') ?? item.Unit?.Slug ?? '',
            item.Unit?.SpaceID && item.Unit?.UnitID
              ? { spaceId: item.Unit.SpaceID, unitId: item.Unit.UnitID }
              : undefined,
          ),
        );

      result = await guardedUpgrade.start({
        guarded: guarded.length > 0,
        run: async ({ dryRun, clearance }) => {
          const cleared = clearance ? JSON.stringify(clearance) : undefined;
          if (dryRun) {
            dryRunFailed = true;
            const pages = await Promise.all(
              chunkInClause('Unit.UnitID', guarded).map((ids) =>
                upgrade(`${needsUpgrade} AND ${ids}`, { dryRun: true }),
              ),
            );
            dryRunFailed = false;
            return withheldIn(pages.flat());
          }
          responses = await upgrade(needsUpgrade, { dryRun: false, clearance: cleared });
          return withheldIn(responses);
        },
      });
    } catch (error) {
      // A failed upgrade is reported through apiStates.upgrade; a failed dry run is not.
      if (dryRunFailed) reportFailedDryRun(error);
      return;
    }
    if (result.status === 'cancelled') return;

    const upgradedUnits = responses.map((response) => response.Unit).filter(Boolean);
    const errorUnits = responses.map((response) => response.Error).filter(Boolean);

    if (upgradedUnits.length > 0) {
      // Upgraded without what guards withheld, which stays on each Unit as a conflict.
      const withheldFrom = [...new Set(result.withheld.map((change) => change.unitLabel))];
      dispatch(
        setAlert({
          message:
            result.withheld.length > 0
              ? `Downstream units upgraded. ${withheldSummary(result.withheld)} in ${withheldFrom.join(', ')}; apply them from the Blame tab of each.`
              : 'Downstream units upgraded successfully.',
          type: result.withheld.length > 0 ? 'warning' : 'success',
          isOpen: true,
        }),
      );

      onRefresh();
      setUnitsUpgraded(true);
    }

    if (errorUnits.length > 0) {
      const errorMessage = errorUnits.map((err) => err?.Details).join(', ');
      dispatch(
        setAlert({
          message: `Error upgrading downstream units: ${errorMessage}`,
          type: 'error',
          isOpen: true,
        }),
      );
    }
  };

  const onFunctionInvoked = async (data: Record<string, string>) => {
    // revisionNum is intentionally excluded here so it is not sent as a function argument below
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { revisionId, revisionNum, dryRun, changeSetId, ...restData } = data;

    // Use modalFunction if available (editing invocation), otherwise selectedFunction
    const functionToInvoke = modalFunction ?? selectedFunction;

    const inputReq: FunctionInvocationsRequest = {
      FunctionInvocations: [
        {
          FunctionName: functionToInvoke?.FunctionName || '',
          Arguments: Object.entries(restData)
            .filter(([, value]) => value != null)
            .map(([key, value]) => ({
              ParameterName: key,
              Value: value,
            })),
        },
      ],
    };

    const common = {
      functionInvocationsRequest: inputReq,
      ...(dryRun && { dryRun }), // Add dryRun parameter if present
      ...(changeSetId && { changeSetId }), // Add changeSetId parameter if present
    };
    const response = revisionId
      ? await invokeFunctions({
          ...common,
          spaceId,
          unitId: currentUnit?.UnitID || unitId,
          revisionId,
        })
      : await invokeFunctionsOnOrg({
          ...common,
          executorSpace: spaceId,
          where: `UnitID='${currentUnit?.UnitID || unitId}'`,
        });

    // Pass the function to handleFunctionInvocation so it can update selectedFunction after success
    handleFunctionInvocation([response.data] as FunctionInvocationsResponse[], undefined, undefined, functionToInvoke || undefined);
  };

  const handleFunctionInvocation = async (
    data: FunctionInvocationsResponse[],
    apiError?: string,
    _preInvocationUnits?: ExtendedUnitRead[],
    func?: FunctionSignature,
  ): Promise<void> => {

    setIsEditInvocationCancelled(false);
    // If func is provided (from saved invocation), set it as the selected function
    if (func) {
      setSelectedFunction(func);
    }

    const unit = data?.[0];
    const error = unit?.Error;
    if (error || apiError) {
      // RTK Query errors for function invocations
      // are handled automatically by useApiErrorMessage hook
      // Handle other function invocation errors manually
      let functionError = apiError || error?.Message || 'Function invocation failed';
      if (error?.Details?.length) {
        functionError += ': ' + error.Details.join('; ');
      }
      setFunctionInvocationError(`Error invoking function: ${functionError}`);
    } else {
      // Only clear the error if there's no error
      setFunctionInvocationError('');
    }

    // Call onRefresh AFTER all state updates to avoid race conditions
    onRefresh();
  };

  // Hook for continuous polling of ValidationErrors changes
  const [polledUnit, setPolledUnit] = useState<ExtendedUnitRead | null>(null);
  const [pollingEnabled, setPollingEnabled] = useState(false);
  const [pollingInterval, setPollingInterval] = useState(3000);
  const [lastPollTimestamp, setLastPollTimestamp] = useState<number>(Date.now());

  // Effect to handle polling when enabled
  useEffect(() => {
    if (!pollingEnabled || !currentUnit) {
      return;
    }
    let mounted = true;

    const pollForChanges = async () => {
      if (!mounted) return;

      try {
        // Update poll timestamp on every poll (for timestamp refresh)
        setLastPollTimestamp(Date.now());

        const response = await getUnit({
          unitId: currentUnit.UnitID || unitId,
          spaceId: currentUnit.SpaceID || spaceId,
        });

        if (response.data && mounted) {
          // Only update if ValidationErrors have changed
          const newValidationErrors = response.data.Unit?.ValidationErrors;
          const oldValidationErrors = polledUnit?.Unit?.ValidationErrors;

          if (JSON.stringify(newValidationErrors) !== JSON.stringify(oldValidationErrors)) {
            setPolledUnit(response?.data ?? null);
            onRefresh(); // Trigger parent refresh to update UI
          }
        }
      } catch (error) {
        console.error('Error polling ValidationErrors:', error);
      }
    };

    // Initial poll
    pollForChanges();

    // Set up interval
    const intervalId = setInterval(pollForChanges, pollingInterval);

    return () => {
      mounted = false;
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pollingEnabled, currentUnit, pollingInterval]);

  const usePollingForValidationErrors = useCallback(
    (
      unit: ExtendedUnitRead | null,
      enabled: boolean = false,
      pollInterval: number = 3000,
    ): { unit: ExtendedUnitRead | null; lastPollTimestamp: number } => {
      // Update polling state when called
      if (enabled !== pollingEnabled) {
        setPollingEnabled(enabled);
      }
      if (pollInterval !== pollingInterval) {
        setPollingInterval(pollInterval);
      }

      // Return the polled unit if available, otherwise return the original unit
      // Also return lastPollTimestamp for components that need to track polling
      return {
        unit: polledUnit || unit,
        lastPollTimestamp,
      };
    },
    [pollingEnabled, pollingInterval, polledUnit, lastPollTimestamp],
  );

  // Similar to awaitTriggersRemoval in unit_update.go
  const awaitTriggersRemoval = useCallback(
    async (
      unit: UnitRead,
      timeoutMs: number = 25000, // 25 seconds default
      onProgress?: (hasAwaitingTriggers: boolean) => void,
    ): Promise<{ success: boolean; error?: string; finalUnit?: UnitRead }> => {
      const startTime = Date.now();
      let tries = 0;
      const maxTries = 100;
      let sleepMs = 25;
      const maxSleepMs = 250;
      let done = false;
      let latestUnit = unit;

      while (tries < maxTries && Date.now() - startTime < timeoutMs) {
        // Check if ValidationErrors is null or doesn't have awaiting/triggers
        if (!latestUnit.ValidationErrors) {
          done = true;
          break;
        }

        const hasAwaitingTriggers = latestUnit.ValidationErrors['awaiting/triggers'] === true;

        // Call progress callback
        if (onProgress) {
          onProgress(hasAwaitingTriggers);
        }

        if (!hasAwaitingTriggers) {
          done = true;
          break;
        }

        // Sleep with exponential backoff
        await new Promise((resolve) => setTimeout(resolve, sleepMs));
        sleepMs = Math.min(sleepMs * 2, maxSleepMs);
        tries++;

        // Fetch updated unit
        try {
          const response = await getUnit({
            unitId: unit.UnitID || unitId,
            spaceId: unit.SpaceID || spaceId,
          });

          if (response.data && response.data.Unit) {
            latestUnit = response.data.Unit;
          }
        } catch (error) {
          // Continue polling even if there's an error
          console.error('Error fetching unit during awaitTriggersRemoval:', error);
        }
      }

      if (!done) {
        return {
          success: false,
          error: `Triggers did not clear within ${timeoutMs / 1000} seconds`,
        };
      }

      return {
        success: true,
        finalUnit: latestUnit,
      };
    },
    [unitId, spaceId, getUnit],
  );

  return {
    // API Mutations
    invokeFunctions,
    deleteUnit,
    updateUnit,
    bulkPatchUnits,

    // API States
    apiStates: {
      invoke: { error: invokeError, isSuccess: isInvokeSuccess },
      delete: { error: deleteError, isSuccess: isDeleteSuccess },
      update: { error: updateError, isSuccess: isUpdateSuccess },
      upgrade: { error: bulkPatchError, isSuccess: isBulkPatchSuccess },
    },

    // Action Handlers
    onUnitDeleted,
    onUnitUpgrade,
    onBulkUnitUpgrade,
    onFunctionInvoked,
    handleFunctionInvocation,

    // State
    functionInvocationError,
    setFunctionInvocationError,

    // ValidationErrors monitoring
    awaitTriggersRemoval,
    usePollingForValidationErrors,

    upgradeGuardDialog: guardedUpgrade.dialog,
    upgradeWithheld,
    setUpgradeWithheld,
  };
};