// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { useAppDispatch } from '@/hooks/useApp';
import {
  BulkPatchUnitsApiArg,
  DeleteUnitApiArg,
  ExtendedUnitRead,
  FunctionInvocationsRequest,
  FunctionInvocationsResponse,
  FunctionSignature,
  InvokeFunctionsApiArg,
  Unit,
  UnitRead,
  UpdateUnitApiArg,
  useBulkPatchUnitsMutation,
  useDeleteUnitMutation,
  useInvokeFunctionsMutation,
  useLazyGetUnitQuery,
  useUpdateUnitMutation,
} from '@confighub/rtk-query';
import { setAlert } from '@/state/slices/alert';
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
  const [invokeFunctions, { error: invokeError, isSuccess: isInvokeSuccess }] =
    useInvokeFunctionsMutation();
  const [deleteUnit, { error: deleteError, isSuccess: isDeleteSuccess }] =
    useDeleteUnitMutation();
  const [updateUnit, { error: updateError, isSuccess: isUpdateSuccess }] =
    useUpdateUnitMutation();
  const [bulkPatchUnits, { error: bulkPatchError, isSuccess: isBulkPatchSuccess }] =
    useBulkPatchUnitsMutation();
  const [getUnit] = useLazyGetUnitQuery();

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
    try {
      // Store pre-upgrade state
      setPreUpgradeRevisionNum(currentUnit?.HeadRevisionNum ?? null);

      // Trigger upgrade
      const input: UpdateUnitApiArg = {
        unit: currentUnit as Unit,
        spaceId: spaceId,
        unitId: unitId,
        upgrade: true,
      };

      const response = await updateUnit(input);

      if (response?.data?.Unit) {
        // Get new revision number
        setPostUpgradeRevisionNum(response.data.Unit.HeadRevisionNum ?? null);

        onRefresh();
      }
    } finally {
      // TODO: Investigate what is wrong with closing the modals.
      // Passing callbacks in `onClose` to the modal does not work.
      setIsUpgradeModalOpen(false);
    }
  };

  const onBulkUnitUpgrade = async () => {
    const input: BulkPatchUnitsApiArg = {
      upgrade: true,
      include: 'UpstreamUnitID',
      where: `Unit.UpstreamUnitID='${unitId}' AND Unit.UpstreamRevisionNum < UpstreamUnit.HeadRevisionNum`,
      // @ts-expect-error https://stackoverflow.com/questions/68283492/rtk-query-merge-patchjson-content-type-ruins-request-body
      body: JSON.stringify({}),
    };

    const response = await bulkPatchUnits(input);

    if (response && Array.isArray(response.data)) {
      const upgradedUnits = response.data
        .map((response) => response.Unit)
        .flat()
        .filter(Boolean);

      const errorUnits = response.data
        .map((response) => response.Error)
        .flat()
        .filter(Boolean);

      if (upgradedUnits.length > 0) {
        const successMessage = 'Downstream units upgraded successfully.';
        dispatch(
          setAlert({
            message: successMessage,
            type: 'success',
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

    // If revisionId exists the input param should contain unitId and revisionId
    const input: InvokeFunctionsApiArg = {
      spaceId: spaceId,
      functionInvocationsRequest: inputReq,
      ...(dryRun && { dryRun }), // Add dryRun parameter if present
      ...(changeSetId && { changeSetId }), // Add changeSetId parameter if present
      ...(revisionId
        ? {
            unitId: currentUnit?.UnitID || unitId,
            revisionId,
          }
        : {
            where: `UnitID='${currentUnit?.UnitID || unitId}'`,
          }),
    };

    const response = await invokeFunctions(input);

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
  };
};