// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { useCallback, useEffect, useRef, useState } from 'react';

import { ProgressRefreshButton } from '@/components/progress-refresh-button/ProgressRefreshButton';
import { HoverCard } from '@/components/styled';
import { findTriggerForGate, useGateTriggers } from '@/hooks/useGateTriggers';
import {
  ExtendedTriggerRead,
  ExtendedUnitRead,
  FunctionInvocationsRequest,
  FunctionInvocationsResponse,
  ListFunctionsApiResponse,
  useInvokeFunctionsMutation,
  useLazyGetSpaceQuery,
  useLazyListAllTargetsQuery,
  useLazyListAllTriggersQuery,
  useLazyListTriggersQuery,
} from '@confighub/rtk-query';
import { getApiErrorMessage } from '@/utility/error-functions';
import { parseGateName } from '@/utility/name-format-functions';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ExpandLess from '@mui/icons-material/ExpandLess';
import ExpandMore from '@mui/icons-material/ExpandMore';
import { Box, Collapse, Stack, Typography } from '@mui/material';
import Alert from '@mui/material/Alert';
import CircularProgress from '@mui/material/CircularProgress';
import { styled } from '@mui/material/styles';

import { ValidationGateCard } from './ValidationGateCard';

export interface IActionSideBarProps {
  unit: ExtendedUnitRead;
  onApplyGateClicked: (gateName: string) => void;
  functions: ListFunctionsApiResponse;
  onRefresh?: () => void;
  isFetchingUnit?: boolean;
  lastPollTimestamp?: number;
}

// Styled components
const Container = styled(Box)(() => ({
  width: '100%',
}));

export interface ValidationResult {
  gateName: string;
  result?: FunctionInvocationsResponse;
  loading: boolean;
  error?: string;
  timestamp?: number;
}

export const ActionSidebar = ({
  unit,
  onApplyGateClicked,
  functions,
  onRefresh,
  isFetchingUnit = false,
  lastPollTimestamp, // Used passively to trigger re-renders - changes every ~5s when polling occurs
}: IActionSideBarProps) => {
  const [invokeFunctions] = useInvokeFunctionsMutation();
  const [listTriggers] = useLazyListTriggersQuery();
  const [listAllTriggers] = useLazyListAllTriggersQuery();
  const [getSpace] = useLazyGetSpaceQuery();
  const [listAllTargets] = useLazyListAllTargetsQuery();
  const [triggers, setTriggers] = useState<ExtendedTriggerRead[]>([]);
  const gateTriggers = useGateTriggers(unit?.Unit);
  const [validationResults, setValidationResults] = useState<ValidationResult[]>([]);
  const [helpExpanded, setHelpExpanded] = useState(false);
  const autoFetchTriggeredRef = useRef<Set<string>>(new Set());

  // Process validation errors
  const validationErrors = Object.entries(unit?.Unit?.ValidationErrors ?? {}).map(
    ([key, value]) => ({
      name: key,
      value,
    }),
  );

  // Process validation warnings
  const validationWarnings = Object.entries(unit?.Unit?.ValidationWarnings ?? {}).map(
    ([key, value]) => ({
      name: key,
      value,
    }),
  );

  const getSelectedFunction = (functionName: string) => {
    const toolchainType = unit?.Unit?.ToolchainType;
    return toolchainType ? functions?.[toolchainType]?.[functionName] : undefined;
  };

  // Invoke function for validating triggers
  const invokeValidatingTrigger = useCallback(
    async (gateName: string, trigger: ExtendedTriggerRead) => {
      if (!unit?.Unit?.SpaceID || !unit?.Unit?.UnitID) return;

      // Set loading state
      setValidationResults((prev) => [
        ...prev.filter((r) => r.gateName !== gateName),
        { gateName, loading: true },
      ]);

      try {
        if (!trigger?.Trigger?.TriggerID) {
          throw new Error(`Could not find trigger for gate: ${gateName}`);
        }

        const request: FunctionInvocationsRequest = {
          ToolchainType: unit.Unit.ToolchainType || 'Kubernetes/YAML',
          Triggers: [trigger.Trigger.TriggerID], // Use the Triggers parameter with actual trigger ID
          StopOnError: false,
          FunctionInvocations: null,
        };

        const result = await invokeFunctions({
          spaceId: unit.Unit.SpaceID,
          where: `UnitID = '` + unit?.Unit?.UnitID + `'`,
          functionInvocationsRequest: request,
        });

        if (result.error) {
          throw new Error(getApiErrorMessage(result.error, 'Unknown error'));
        }

        setValidationResults((prev) => [
          ...prev.filter((r) => r.gateName !== gateName),
          {
            gateName,
            loading: false,
            result: Array.isArray(result.data) ? result.data[0] : undefined,
            timestamp: Date.now(),
          },
        ]);
      } catch (error) {
        setValidationResults((prev) => [
          ...prev.filter((r) => r.gateName !== gateName),
          {
            gateName,
            loading: false,
            error: getApiErrorMessage(error, 'Unknown error'),
            timestamp: Date.now(),
          },
        ]);
      }
    },
    [unit?.Unit?.SpaceID, unit?.Unit?.UnitID, unit?.Unit?.ToolchainType, invokeFunctions],
  );

  const getValidationResult = (gateName: string): ValidationResult | undefined => {
    return validationResults.find((r) => r.gateName === gateName);
  };

  const findTriggerByGateName = (gateName: string): ExtendedTriggerRead | undefined =>
    findTriggerForGate(gateName, unit?.Unit, gateTriggers, triggers);

  // Fetch space/target and then triggers on component mount
  useEffect(() => {
    const fetchTriggersForUnit = async () => {
      if (!unit?.Unit?.SpaceID) return;

      try {
        // First, fetch the space to check if it has a WhereTrigger or TriggerFilterID
        const spaceResult = await getSpace({
          spaceId: unit.Unit.SpaceID,
          select: 'WhereTrigger,TriggerFilterID',
        }).unwrap();

        const spaceData = spaceResult?.Space;
        const hasSpaceFilter = !!(spaceData?.WhereTrigger || spaceData?.TriggerFilterID);

        // Check if the Unit has a Target with trigger filter configuration
        let hasTargetFilter = false;
        let targetData: { WhereTrigger?: string; TriggerFilterID?: string } | undefined;

        if (unit.Unit.TargetID) {
          try {
            // Use listAllTargets because the Target may be in a different Space than the Unit
            const targetResults = await listAllTargets({
              where: `TargetID = '${unit.Unit.TargetID}'`,
              select: 'WhereTrigger,TriggerFilterID',
            }).unwrap();
            targetData = targetResults?.[0]?.Target;
            hasTargetFilter = !!(targetData?.WhereTrigger || targetData?.TriggerFilterID);
          } catch (targetError) {
            console.error('Error fetching target:', targetError);
            // Continue without target triggers if target fetch fails
          }
        }

        // Collect triggers from both Space and Target
        const allTriggers: ExtendedTriggerRead[] = [];
        const seenTriggerIds = new Set<string>();

        // Fetch Space triggers
        if (hasSpaceFilter) {
          // Use ListAllTriggers with where and/or filter parameters from Space
          const spaceTriggers = await listAllTriggers({
            where: spaceData?.WhereTrigger || undefined,
            filter: spaceData?.TriggerFilterID || undefined,
            include: 'InvocationID',
          }).unwrap();
          for (const trigger of spaceTriggers) {
            const triggerId = trigger.Trigger?.TriggerID;
            if (triggerId && !seenTriggerIds.has(triggerId)) {
              seenTriggerIds.add(triggerId);
              allTriggers.push(trigger);
            }
          }
        } else {
          // Use the current space-scoped trigger listing
          const spaceTriggers = await listTriggers({
            spaceId: unit.Unit.SpaceID,
            include: 'InvocationID',
          }).unwrap();
          for (const trigger of spaceTriggers) {
            const triggerId = trigger.Trigger?.TriggerID;
            if (triggerId && !seenTriggerIds.has(triggerId)) {
              seenTriggerIds.add(triggerId);
              allTriggers.push(trigger);
            }
          }
        }

        // Fetch Target triggers if Target has filter configuration
        if (hasTargetFilter && targetData) {
          const targetTriggers = await listAllTriggers({
            where: targetData.WhereTrigger || undefined,
            filter: targetData.TriggerFilterID || undefined,
            include: 'InvocationID',
          }).unwrap();
          for (const trigger of targetTriggers) {
            const triggerId = trigger.Trigger?.TriggerID;
            if (triggerId && !seenTriggerIds.has(triggerId)) {
              seenTriggerIds.add(triggerId);
              allTriggers.push(trigger);
            }
          }
        }

        setTriggers(allTriggers);
      } catch (error) {
        console.error('Error fetching space or triggers:', error);
      }
    };

    fetchTriggersForUnit();
  }, [
    unit?.Unit?.SpaceID,
    unit?.Unit?.TargetID,
    getSpace,
    listAllTargets,
    listTriggers,
    listAllTriggers,
  ]);

  // Auto-fetch validation results for gates and warnings when triggers are loaded
  useEffect(() => {
    if (triggers.length === 0 && gateTriggers.length === 0) return;
    if (!unit?.Unit?.ValidationErrors && !unit?.Unit?.ValidationWarnings) return;

    const gateNames = [
      ...Object.keys(unit?.Unit?.ValidationErrors ?? {}),
      ...Object.keys(unit?.Unit?.ValidationWarnings ?? {}),
    ];

    // Auto-fetch for gates that don't have results yet and haven't been triggered
    gateNames.forEach((gateName) => {
      // Skip the special awaiting/triggers gate
      if (gateName === 'awaiting/triggers') return;

      // Skip if already fetched/fetching
      const existingResult = validationResults.find((r) => r.gateName === gateName);
      if (existingResult) return;

      // Skip if already auto-fetched in this session
      if (autoFetchTriggeredRef.current.has(gateName)) return;

      const trigger = findTriggerByGateName(gateName);
      if (trigger && trigger.Trigger?.Validating) {
        autoFetchTriggeredRef.current.add(gateName);
        invokeValidatingTrigger(gateName, trigger);
      }
    });
  }, [
    unit?.Unit?.ValidationErrors,
    triggers,
    gateTriggers,
    validationResults,
    invokeValidatingTrigger,
  ]);

  const handleGateClick = (gateName: string, trigger: ExtendedTriggerRead) => {
    invokeValidatingTrigger(gateName, trigger);
  };

  const handleRefreshClick = useCallback(() => {
    // Clear validation results and auto-fetch tracking
    setValidationResults([]);
    autoFetchTriggeredRef.current.clear();
    onRefresh?.();
  }, [onRefresh]);

  if (validationErrors.length === 0 && validationWarnings.length === 0) {
    return (
      <Container>
        <Box textAlign='center' py={3}>
          <CheckCircleIcon sx={{ fontSize: 48, color: 'success.main', mb: 1 }} />
          <Typography variant='body2' color='text.secondary'>
            All gates are clear
          </Typography>
        </Box>
      </Container>
    );
  }

  return (
    <Container>
      <Box sx={{ mb: 1 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography variant='body2' sx={{ fontWeight: 600 }}>
            Validation Errors
          </Typography>
          {onRefresh && (
            <ProgressRefreshButton
              onRefresh={handleRefreshClick}
              disabled={isFetchingUnit}
              lastPollTimestamp={lastPollTimestamp}
              pollIntervalMs={5000}
            />
          )}
        </Box>
      </Box>
      <Alert severity='info' sx={{ mb: 2 }}>
        <Box
          sx={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            cursor: 'pointer',
          }}
          onClick={() => setHelpExpanded(!helpExpanded)}
        >
          <Typography variant='body2' sx={{ fontWeight: 600 }}>
            Validation Errors Overview
          </Typography>
          {helpExpanded ? <ExpandLess fontSize='small' /> : <ExpandMore fontSize='small' />}
        </Box>
        <Collapse in={helpExpanded} timeout='auto' unmountOnExit>
          <Typography variant='caption' display='block' sx={{ mt: 0.5 }}>
            Validation errors are checks that did not pass. They must be cleared before a unit
            can be included in a published Release. Clearing one usually means updating the
            configuration it objected to.
          </Typography>
        </Collapse>
      </Alert>
      <Stack spacing={1.5}>
        {validationErrors.map((gate) => {
          const trigger = findTriggerByGateName(gate.name);
          const isValidating = trigger?.Trigger?.Validating;
          const selectedFunction = getSelectedFunction(
            trigger?.Trigger?.FunctionName || parseGateName(gate.name).functionName,
          );
          const validation = getValidationResult(gate.name);
          const isAwaitingTriggers = gate.name === 'awaiting/triggers' && gate.value === true;

          // Special handling for awaiting/triggers gate
          if (isAwaitingTriggers) {
            return (
              <HoverCard variant='outlined' key={gate.name}>
                <Box
                  sx={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 1.5,
                  }}
                >
                  <Stack direction='row' spacing={1} alignItems='center'>
                    <CircularProgress color='primary' size={20} />
                    <Typography variant='body2' sx={{ fontWeight: 600, fontSize: '0.8rem' }}>
                      AWAITING GATE VALIDATION
                    </Typography>
                  </Stack>
                  <Alert severity='info' sx={{ py: 0.5 }}>
                    <Typography variant='caption'>
                      The system is currently waiting for the validating triggers to complete.
                    </Typography>
                  </Alert>
                </Box>
              </HoverCard>
            );
          }

          return (
            <ValidationGateCard
              key={gate.name}
              gateName={gate.name}
              trigger={trigger}
              validation={validation}
              selectedFunction={selectedFunction}
              isValidating={isValidating || false}
              spaceId={unit?.Unit?.SpaceID}
              onRunClick={() => {
                if (isValidating && trigger) {
                  handleGateClick(gate.name || '', trigger);
                } else {
                  onApplyGateClicked(gate.name);
                }
              }}
            />
          );
        })}
      </Stack>

      {validationWarnings.length > 0 && (
        <>
          <Box sx={{ mb: 1, mt: 2 }}>
            <Typography variant='body2' sx={{ fontWeight: 600 }}>
              Validation Warnings
            </Typography>
          </Box>
          <Alert severity='warning' sx={{ mb: 2 }}>
            <Typography variant='caption'>
              Validation warnings are non-blocking results. They indicate potential issues but
              block nothing.
            </Typography>
          </Alert>
          <Stack spacing={1.5}>
            {validationWarnings.map((warning) => {
              const trigger = findTriggerByGateName(warning.name);
              const isValidating = trigger?.Trigger?.Validating;
              const selectedFunction = getSelectedFunction(
                trigger?.Trigger?.FunctionName || parseGateName(warning.name).functionName,
              );
              const validation = getValidationResult(warning.name);

              return (
                <ValidationGateCard
                  key={warning.name}
                  gateName={warning.name}
                  trigger={trigger}
                  validation={validation}
                  selectedFunction={selectedFunction}
                  isValidating={isValidating || false}
                  isWarning
                  spaceId={unit?.Unit?.SpaceID}
                  onRunClick={() => {
                    if (isValidating && trigger) {
                      handleGateClick(warning.name || '', trigger);
                    } else {
                      onApplyGateClicked(warning.name);
                    }
                  }}
                />
              );
            })}
          </Stack>
        </>
      )}
    </Container>
  );
};
