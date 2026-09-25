// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { v4 as uuidv4 } from 'uuid';
import Box from '@mui/material/Box';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { styled, useTheme } from '@mui/material/styles';
import FunctionsIcon from '@mui/icons-material/Functions';
import CloseIcon from '@mui/icons-material/Close';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import {
  FunctionArgument,
  FunctionInvocationsResponse,
  FunctionSignature,
  Invocation,
  useCreateInvocationMutation,
  useCreateTriggerMutation,
  useDeleteInvocationMutation,
  useInvokeFunctionsMutation,
  useLazySearchUnitDataQuery,
  useListAllUnitsQuery,
  useListAllInvocationsQuery,
  useListOrgFunctionsQuery,
  usePatchInvocationMutation,
} from '@confighub/rtk-query';
import {
  buildInvocationDiffs,
  type InvocationBeforeSnapshot,
} from '@/components/invoker/utils/diff-from-invocation';
import type { UnitDiff } from '@/components/invoker/utils/diff-from-revisions';
import { InvokerContent } from '../invoker/InvokerContent';
import { useAppSelector } from '@/hooks/useApp';
import { selectInvocationInitiativeId } from '@/state/slices/selectedUnits';
import { useInvokeInChangeSet } from '@/components/invoker/hooks/useInvokeInChangeSet';
import { LockedUnitsError } from '@/components/invoker/hooks/useInitiativeChangeSetLifecycle';
import { useForceUnlockUnits } from '@/components/invoker/hooks/useForceUnlockUnits';
import { LockedUnitsDialog } from '@/components/invoker/components/LockedUnitsDialog';
import { useInvocationHistory } from '../invoker/hooks/useInvocationHistory';
import {
  FunctionParameterFormData,
  InvocationHistoryItem,
  InvokerContext,
  SaveInvocationOptions,
} from '../invoker/types/invoker.types';
import { extractApiErrorMessage, extractEmbeddedError } from '../invoker/utils/error-handling.utils';
import { firstInvocationFunction, invocationFunctions } from '@/utility/invocation-functions';

export type ListOrgFunctionsApiResponse = {
  [key: string]: {
    [key: string]: FunctionSignature;
  };
};

export const SIDEBAR_BUTTON_BAR_WIDTH = 48;

interface InvokerSidebarProps {
  selectedUnits?: Array<{ id: string; name: string; toolchainType: string; spaceId?: string; spaceName?: string }>;
  onRemoveUnit?: (unitId: string) => void;
  onAddUnit?: (unit: { id: string; name: string; toolchainType: string; spaceId: string }) => void;
  onRemoveAllUnits?: () => void;
  onRestoreAllUnits?: () => void;
  totalVisibleUnits?: number;
  isOpen: boolean;
  panelWidth: number;
  isResizing: boolean;
  onToggle: () => void;
  onClose: () => void;
  onOpen: () => void;
  onResizeStart: (e: React.MouseEvent) => void;
}

// Styled Components
const SidebarContainer = styled(Box)({
  display: 'flex',
  height: '100%',
  position: 'relative',
  flexShrink: 0,
  alignSelf: 'stretch',
});

const ButtonBar = styled(Box)(({ theme }) => ({
  width: SIDEBAR_BUTTON_BAR_WIDTH,
  overflowY: 'auto',
  backgroundColor: theme.palette.grey[100],
  borderRight: `1px solid ${theme.palette.divider}`,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  paddingTop: theme.spacing(1),
  gap: theme.spacing(1),
  flexShrink: 0,
  zIndex: 10,
  cursor: 'default',
  marginLeft: 2, // Make room for the resize handle
}));

const SidebarPanel = styled(Box, {
  shouldForwardProp: (prop) => prop !== 'isOpen' && prop !== 'panelWidth',
})<{ isOpen: boolean; panelWidth: number }>(({ theme, isOpen, panelWidth }) => ({
  width: isOpen ? panelWidth : 0,
  backgroundColor: theme.palette.background.paper,
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
  transition: theme.transitions.create('width', {
    easing: theme.transitions.easing.sharp,
    duration: theme.transitions.duration.enteringScreen,
  }),
}));

const SidebarHeader = styled(Box)(({ theme }) => ({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: theme.spacing(1.5, 2),
  borderBottom: `1px solid ${theme.palette.divider}`,
  backgroundColor: theme.palette.background.default,
  flexShrink: 0,
}));

const SidebarContent = styled(Box)({
  flex: 1,
  overflow: 'auto',
  display: 'flex',
  flexDirection: 'column',
  maxHeight: '100vh',
});

const ResizeHandle = styled(Box)(({ theme }) => ({
  position: 'absolute',
  left: 0,
  top: 0,
  bottom: 0,
  width: 4,
  cursor: 'col-resize',
  backgroundColor: 'transparent',
  transition: 'background-color 0.2s',
  zIndex: 20,
  '&:hover': {
    backgroundColor: theme.palette.primary.main,
  },
}));

const SidebarButton = styled(IconButton, {
  shouldForwardProp: (prop) => prop !== 'isActive',
})<{ isActive?: boolean }>(({ theme, isActive }) => ({
  width: 'auto',
  height: 'auto',
  padding: theme.spacing(1, 0.5),
  borderRadius: theme.shape.borderRadius,
  border: `1px solid ${theme.palette.divider}`,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: theme.spacing(0.5),
  backgroundColor: isActive ? theme.palette.action.selected : 'transparent',
  '&:hover': {
    backgroundColor: isActive ? theme.palette.action.selected : 'transparent',
    borderColor: theme.palette.text.secondary,
  },
}));

export const InvokerSidebar = ({
  selectedUnits,
  onRemoveUnit,
  onAddUnit,
  onRemoveAllUnits,
  onRestoreAllUnits,
  totalVisibleUnits,
  isOpen,
  panelWidth,
  isResizing,
  onToggle,
  onClose,
  onOpen,
  onResizeStart,
}: InvokerSidebarProps) => {
  const theme = useTheme();
  const location = useLocation();

  // Function invoker state
  const [selectedFunction, setSelectedFunction] = useState<FunctionSignature | null>(null);
  const [prefilledValues, setPrefilledValues] = useState<FunctionParameterFormData | undefined>();
  const [loadedInvocation, setLoadedInvocation] = useState<Invocation | null>(null);
  const [selectionKey, setSelectionKey] = useState<string | null>(null);
  const [toolchainFilter, setToolchainFilter] = useState<string | null>(null);
  const [hasManuallyChangedFilter, setHasManuallyChangedFilter] = useState(false);
  const prevFirstUnitToolchain = useRef<string | undefined>(undefined);
  const [invokeResult, setInvokeResult] = useState<{
    success: boolean;
    message?: string;
    responses?: FunctionInvocationsResponse[];
    diffs?: UnitDiff[];
    /** Slug per UnitID captured at invocation time. Insulates the results
     *  panel from later changes to the selected-units prop, which would
     *  otherwise drop the slug map out from under us. */
    slugByUnitId?: Record<string, string>;
  } | null>(null);
  const [isInvoking, setIsInvoking] = useState(false);
  const [isSavingAttributes, setIsSavingAttributes] = useState(false);

  // Fetch all units when not provided as props
  const { data: allUnitsData } = useListAllUnitsQuery(
    {},
    { skip: !!selectedUnits }
  );

  // State for internally managed units
  const [internalSelectedUnits, setInternalSelectedUnits] = useState<
    Array<{ id: string; name: string; toolchainType: string; spaceId: string; spaceName?: string }>
  >([]);

  // Convert fetched units
  const fetchedUnits = useMemo(() => {
    if (!allUnitsData) return [];
    return allUnitsData
      .filter((item) => item.Unit?.UnitID && item.Unit?.Slug && item.Unit?.ToolchainType && item.Unit?.SpaceID)
      .map((item) => ({
        id: item.Unit!.UnitID!,
        name: item.Unit!.Slug,
        toolchainType: item.Unit!.ToolchainType,
        spaceId: item.Unit!.SpaceID!,
        spaceName: item.Space?.Slug,
      }));
  }, [allUnitsData]);

  const effectiveUnits = selectedUnits ?? internalSelectedUnits;

  // Detect unit detail page
  const unitDetailPageInfo = useMemo(() => {
    const match = location.pathname.match(/^\/units\/([^/]+)\/([^/]+)$/);
    if (match) {
      const [, spaceId, unitId] = match;
      return { spaceId, unitId };
    }
    return null;
  }, [location.pathname]);

  // Auto-add current unit when on unit detail page
  useEffect(() => {
    if (!unitDetailPageInfo || fetchedUnits.length === 0 || !onAddUnit) {
      return;
    }
    if (effectiveUnits.length > 0) {
      return;
    }
    const currentUnit = fetchedUnits.find(u => u.id === unitDetailPageInfo.unitId);
    if (!currentUnit) {
      return;
    }
    onAddUnit(currentUnit);
  }, [unitDetailPageInfo, fetchedUnits, onAddUnit, effectiveUnits.length]);

  // Keyboard shortcut
  useEffect(() => {
    const TEXT_INPUT_TYPES = new Set([
      'text',
      'email',
      'password',
      'search',
      'number',
      'url',
      'tel',
      'date',
      'datetime-local',
      'month',
      'time',
      'week',
    ]);

    const isTextEntryTarget = (target: EventTarget | null): boolean => {
      const element = target as HTMLElement | null;
      if (!element) {
        return false;
      }
      if (element.isContentEditable) {
        return true;
      }
      const tagName = element.tagName;
      if (tagName === 'TEXTAREA') {
        return true;
      }
      if (tagName === 'INPUT') {
        const inputType = (element as HTMLInputElement).type || 'text';
        return TEXT_INPUT_TYPES.has(inputType);
      }
      return false;
    };

    const handleKeyPress = (event: KeyboardEvent) => {
      const hasModifier = event.metaKey || event.ctrlKey || event.altKey;
      if (event.key === 'f' && !hasModifier && !isTextEntryTarget(event.target)) {
        event.preventDefault();
        onToggle();
      }
    };
    document.addEventListener('keydown', handleKeyPress);
    return () => document.removeEventListener('keydown', handleKeyPress);
  }, [onToggle]);

  // Auto-update toolchain filter
  useEffect(() => {
    const firstUnitToolchain = effectiveUnits?.[0]?.toolchainType;
    if (firstUnitToolchain !== prevFirstUnitToolchain.current) {
      if (!hasManuallyChangedFilter) {
        setToolchainFilter(firstUnitToolchain || null);
      }
      prevFirstUnitToolchain.current = firstUnitToolchain;
    }
  }, [effectiveUnits, hasManuallyChangedFilter]);

  // Handle manual filter change
  const handleToolchainFilterChange = useCallback((filter: string | null) => {
    setToolchainFilter(filter);
    setHasManuallyChangedFilter(true);
  }, []);

  // Internal unit handlers
  const handleInternalRemoveUnit = useCallback((unitId: string) => {
    if (onRemoveUnit) {
      onRemoveUnit(unitId);
    } else {
      setInternalSelectedUnits((prev) => prev.filter((u) => u.id !== unitId));
    }
  }, [onRemoveUnit]);

  const handleInternalAddUnit = useCallback((unit: { id: string; name: string; toolchainType: string; spaceId: string }) => {
    if (onAddUnit) {
      onAddUnit(unit);
    } else {
      setInternalSelectedUnits((prev) => {
        if (prev.some((u) => u.id === unit.id)) return prev;
        return [...prev, unit];
      });
    }
  }, [onAddUnit]);

  const handleInternalRemoveAllUnits = useCallback(() => {
    if (onRemoveAllUnits) {
      onRemoveAllUnits();
    } else {
      setInternalSelectedUnits([]);
    }
  }, [onRemoveAllUnits]);

  const handleInternalRestoreAllUnits = useCallback(() => {
    if (onRestoreAllUnits) {
      onRestoreAllUnits();
    } else {
      setInternalSelectedUnits(fetchedUnits);
    }
  }, [onRestoreAllUnits, fetchedUnits]);

  // Create context
  const enrichedContext: InvokerContext = useMemo(() => {
    const unitIdToSlugMap = effectiveUnits.reduce((acc, unit) => {
      acc[unit.id] = unit.name;
      return acc;
    }, {} as Record<string, string>);

    const validUnits = effectiveUnits.filter((unit): unit is typeof unit & { spaceId: string } =>
      typeof unit.spaceId === 'string'
    );

    return {
      selectedUnits: validUnits,
      primaryToolchainType: effectiveUnits[0]?.toolchainType,
      unitIdToSlugMap,
    };
  }, [effectiveUnits]);

  const spaceId = effectiveUnits?.[0]?.spaceId;

  // Get functions
  const { data: functionsData } = useListOrgFunctionsQuery({});

  const availableToolchainTypes = useMemo(() => {
    if (!functionsData) return [];
    return Object.keys(functionsData as ListOrgFunctionsApiResponse);
  }, [functionsData]);

  const functions: FunctionSignature[] = useMemo(() => {
    if (!functionsData) return [];
    const typedData = functionsData as ListOrgFunctionsApiResponse;

    if (toolchainFilter && typedData[toolchainFilter]) {
      return Object.values(typedData[toolchainFilter]);
    }

    return Object.values(typedData).flatMap(category =>
      Object.values(category)
    );
  }, [functionsData, toolchainFilter]);

  // Get saved invocations (show all invocations across all spaces).
  const { data: savedInvocationsData } = useListAllInvocationsQuery({});

  const savedInvocations = useMemo(() => {
    if (!savedInvocationsData || !Array.isArray(savedInvocationsData)) return [];
    return savedInvocationsData
      .map((item: { Invocation?: Invocation }) => item.Invocation)
      .filter((inv): inv is Invocation => !!inv);
  }, [savedInvocationsData]);

  // Get history (show all recent invocations, not filtered by toolchain)
  const { addInvocation, removeInvocation, recentInvocations } = useInvocationHistory(
    undefined
  );

  // Mutations
  const [invokeFunctionMutation] = useInvokeFunctionsMutation();
  const [createInvocationMutation] = useCreateInvocationMutation();
  const [triggerSearchUnitData] = useLazySearchUnitDataQuery();

  // When the Invoker is running in an initiative's context, each invocation is
  // wrapped in a per-run ChangeSet labeled with that initiative. Otherwise
  // invocations go through the normal stateless `invokeFunctions` path.
  const initiativeId = useAppSelector(selectInvocationInitiativeId);
  const { invoke: invokeInChangeSet } = useInvokeInChangeSet();
  const [lockedUnitIds, setLockedUnitIds] = useState<string[]>([]);
  const pendingInvokeRef = useRef<(() => void) | null>(null);
  const { holders: lockHolders, forceUnlock } = useForceUnlockUnits({
    spaceId: spaceId ?? '',
    lockedUnitIds,
  });
  const [createTriggerMutation] = useCreateTriggerMutation();
  const [patchInvocationMutation] = usePatchInvocationMutation();
  const [deleteInvocationMutation] = useDeleteInvocationMutation();

  // Toggle the sidebar: closed -> open, open -> close.
  const handleFunctionsButtonClick = useCallback(() => {
    if (isOpen) {
      onClose();
    } else {
      onOpen();
    }
  }, [isOpen, onOpen, onClose]);

  // Close handler
  const handleClose = useCallback(() => {
    onClose();
  }, [onClose]);

  // Back button handler
  const handleBack = useCallback(() => {
    setSelectedFunction(null);
    setPrefilledValues(undefined);
    setLoadedInvocation(null);
    setInvokeResult(null);
    setSelectionKey(null);
  }, []);

  // Handle invocation selection
  const handleSelectInvocation = useCallback(
    (invocation: Invocation | InvocationHistoryItem | undefined, functionName: string) => {
      const func = functions.find((f) => f.FunctionName === functionName);
      if (!func) return;

      setSelectedFunction(func);

      if (invocation && 'Arguments' in invocation && invocation.Arguments) {
        // InvocationHistoryItem: Arguments sit directly on the item.
        const values: FunctionParameterFormData = {};
        invocation.Arguments.forEach((arg: FunctionArgument) => {
          if (arg.ParameterName) {
            values[arg.ParameterName] = arg.Value || '';
          }
        });
        setPrefilledValues(values);
      } else if (invocation) {
        // Saved Invocation: Arguments live on its first FunctionInvocation. The
        // invoke form edits one function at a time, so only the first one prefills.
        const args = firstInvocationFunction(invocation)?.Arguments;
        if (args) {
          const values: FunctionParameterFormData = {};
          args.forEach((arg: FunctionArgument) => {
            if (arg.ParameterName) {
              values[arg.ParameterName] = arg.Value || '';
            }
          });
          setPrefilledValues(values);
        }
      }

      if (invocation && 'InvocationID' in invocation) {
        setLoadedInvocation(invocation as Invocation);
        setSelectionKey(`invocation-${invocation.InvocationID}`);
      } else if (invocation && 'timestamp' in invocation) {
        setSelectionKey(`history-${invocation.timestamp}`);
        setLoadedInvocation(null);
      } else {
        setLoadedInvocation(null);
        setSelectionKey(`function-${functionName}-${Date.now()}`);
      }

      setInvokeResult(null);
    },
    [functions]
  );

  // Handle function selection
  const handleSelectFunction = useCallback((func: FunctionSignature | null) => {
    setSelectedFunction(func);
    setPrefilledValues(undefined);
    setLoadedInvocation(null);
    setInvokeResult(null);
    setSelectionKey(func ? `function-${func.FunctionName}-${Date.now()}` : null);
  }, []);

  // Handle removing a history item
  const handleRemoveHistoryItem = useCallback(
    (id: string) => {
      removeInvocation(id);
    },
    [removeInvocation]
  );

  // Handle deleting a saved invocation
  const handleDeleteSavedInvocation = useCallback(
    async (invocationId: string) => {
      if (!spaceId) return;

      try {
        await deleteInvocationMutation({
          spaceId,
          invocationId,
        }).unwrap();
      } catch (error) {
        console.error('Failed to delete invocation:', error);
      }
    },
    [spaceId, deleteInvocationMutation]
  );

  // Handle function invocation
  const handleInvoke = useCallback(
    async (
      functionName: string,
      parameters: FunctionParameterFormData,
      dryRun: boolean = false,
      parameterizedInvocationId?: string,
    ) => {
      if (!spaceId) {
        setInvokeResult({
          success: false,
          message: 'No space selected. Please ensure you are on a unit details page or have units selected.',
        });
        return;
      }

      setIsInvoking(true);
      setInvokeResult(null);

      try {
        const functionArgs: FunctionArgument[] = Object.entries(parameters)
          .filter(([, value]) => value !== undefined && value !== null && value !== '')
          .map(([key, value]) => ({
            ParameterName: key,
            Value: String(value),
          }));

        if (enrichedContext.selectedUnits.length === 0) {
          setInvokeResult({
            success: false,
            message: 'No units selected. Please select at least one unit to invoke the function on.',
          });
          setIsInvoking(false);
          return;
        }

        const selectedUnitIds = enrichedContext.selectedUnits.map((u: { id: string }) => u.id);
        const unitIds = selectedUnitIds.map((id: string) => `'${id}'`).join(',');
        const whereClause = `UnitID IN (${unitIds})`;

        // Snapshot pre-invocation configuration so we can diff the response's ConfigData
        // against it. Fire alongside the mutation to keep latency flat — the
        // diff render can tolerate the snapshot arriving after the result.
        // The configuration is not on the Unit, so this reads the bulk data endpoint,
        // which returns the whole selection in one request.
        const beforeSnapshotPromise = triggerSearchUnitData({ where: whereClause }, true)
          .unwrap()
          .then((rows) => {
            const map: Record<string, InvocationBeforeSnapshot> = {};
            for (const row of rows) {
              const id = row.UnitID;
              if (!id) continue;
              map[id] = {
                spaceId: row.SpaceID ?? spaceId,
                unitSlug: row.Slug ?? '',
                data: row.Data,
              };
            }
            return map;
          })
          .catch(() => ({} as Record<string, InvocationBeforeSnapshot>));

        let result;
        if (parameterizedInvocationId) {
          // Parameterized Invocation: send the declared parameter values,
          // referencing the stored Invocation, and let the server expand its
          // templated arguments. (Not yet routed through an Initiative/ChangeSet.)
          const paramValues = Object.fromEntries(
            Object.entries(parameters).filter(
              ([, value]) => value !== undefined && value !== null && value !== '',
            ),
          );
          result = await invokeFunctionMutation({
            spaceId: spaceId,
            where: whereClause || undefined,
            dryRun: dryRun ? 'true' : undefined,
            functionInvocationsRequest: {
              ToolchainType: enrichedContext.primaryToolchainType || '',
              ParameterizedInvocations: [
                { InvocationID: parameterizedInvocationId, Parameters: paramValues },
              ],
            },
          }).unwrap();
        } else if (initiativeId) {
          const { responses } = await invokeInChangeSet({
            spaceId,
            initiativeId,
            unitIds: selectedUnitIds,
            toolchainType: enrichedContext.primaryToolchainType || '',
            functionInvocation: { FunctionName: functionName, Arguments: functionArgs },
            dryRun,
          });
          result = responses;
        } else {
          result = await invokeFunctionMutation({
            spaceId: spaceId,
            where: whereClause || undefined,
            dryRun: dryRun ? 'true' : undefined,
            functionInvocationsRequest: {
              ToolchainType: enrichedContext.primaryToolchainType || '',
              FunctionInvocations: [
                {
                  FunctionName: functionName,
                  Arguments: functionArgs,
                },
              ],
            },
          }).unwrap();
        }

        const hasErrors = result?.some((r) => !r.Success);

        const beforeByUnitId = await beforeSnapshotPromise;
        const diffs = buildInvocationDiffs(result, beforeByUnitId);
        const slugByUnitId: Record<string, string> = {};
        for (const [id, snap] of Object.entries(beforeByUnitId)) {
          if (snap.unitSlug) slugByUnitId[id] = snap.unitSlug;
        }
        // Fall back to the selection's current name for units that somehow
        // weren't in the snapshot (e.g. snapshot fetch failed).
        for (const u of enrichedContext.selectedUnits) {
          if (!slugByUnitId[u.id] && u.name) slugByUnitId[u.id] = u.name;
        }

        const invokeResultObj = {
          success: !hasErrors,
          message: hasErrors ? 'Some invocations failed' : 'All invocations succeeded',
          responses: result,
          diffs,
          slugByUnitId,
        };

        const historyItem: InvocationHistoryItem = {
          id: uuidv4(),
          FunctionName: functionName,
          ToolchainType: enrichedContext.primaryToolchainType || '',
          Arguments: functionArgs,
          timestamp: Date.now(),
          context: {
            unitIds: enrichedContext.selectedUnits.map((u: { id: string }) => u.id),
            unitNames: enrichedContext.selectedUnits.map((u: { name: string }) => u.name),
          },
          success: !hasErrors,
        };
        addInvocation(historyItem);

        setInvokeResult(invokeResultObj);
      } catch (error) {
        if (error instanceof LockedUnitsError) {
          pendingInvokeRef.current = () => {
            void handleInvoke(functionName, parameters, dryRun);
          };
          setLockedUnitIds(error.lockedUnitIds);
          setIsInvoking(false);
          return;
        }
        console.error('Failed to invoke function:', error);
        const { message, responses } = extractApiErrorMessage(error);

        const historyItem: InvocationHistoryItem = {
          id: uuidv4(),
          FunctionName: functionName,
          ToolchainType: enrichedContext.primaryToolchainType || '',
          Arguments: Object.entries(parameters)
            .filter(([, value]) => value !== undefined && value !== null && value !== '')
            .map(([key, value]) => ({
              ParameterName: key,
              Value: String(value),
            })),
          timestamp: Date.now(),
          context: {
            unitIds: enrichedContext.selectedUnits.map((u: { id: string }) => u.id),
            unitNames: enrichedContext.selectedUnits.map((u: { name: string }) => u.name),
          },
          success: false,
        };
        addInvocation(historyItem);

        setInvokeResult({ success: false, message, responses });
      } finally {
        setIsInvoking(false);
      }
    },
    [spaceId, enrichedContext, invokeFunctionMutation, initiativeId, invokeInChangeSet, addInvocation, triggerSearchUnitData]
  );

  // Handle save invocation or trigger
  const handleSave = useCallback(
    async (options: SaveInvocationOptions, parameters: FunctionParameterFormData): Promise<{ success: boolean; error?: string }> => {
      const targetSpaceId = options.spaceId || spaceId;

      if (!targetSpaceId || !selectedFunction?.FunctionName) {
        return { success: false, error: 'Missing space ID or function name' };
      }

      try {
        const functionArgs: FunctionArgument[] = Object.entries(parameters)
          .filter(([, value]) => value !== undefined && value !== null && value !== '')
          .map(([key, value]) => ({
            ParameterName: key,
            Value: String(value),
          }));

        if (options.mode === 'new' && options.displayName) {
          const saveType = options.type || 'invocation';

          if (saveType === 'trigger') {
            const result = await createTriggerMutation({
              spaceId: targetSpaceId,
              trigger: {
                Slug: options.displayName.toLowerCase().replace(/\s+/g, '-'),
                DisplayName: options.displayName,
                ToolchainType: options.toolchainType || enrichedContext.primaryToolchainType || '',
                Event: options.eventType || 'Mutation',
                FunctionName: selectedFunction.FunctionName,
                Arguments: functionArgs,
                ...(options.disabled !== undefined && { Disabled: options.disabled }),
                ...(options.enforced !== undefined && { Enforced: options.enforced }),
                ...(options.labels && { Labels: options.labels }),
                ...(options.annotations && { Annotations: options.annotations }),
                ...(options.bridgeWorkerId && { BridgeWorkerID: options.bridgeWorkerId }),
              },
            }).unwrap();

            const embeddedError = extractEmbeddedError(result);
            if (embeddedError) return { success: false, error: embeddedError };

            setInvokeResult({
              success: true,
              message: `Trigger "${options.displayName}" saved successfully`,
            });

            return { success: true };
          } else {
            const result = await createInvocationMutation({
              spaceId: targetSpaceId,
              invocation: {
                Slug: options.displayName.toLowerCase().replace(/\s+/g, '-'),
                DisplayName: options.displayName,
                ToolchainType: options.toolchainType || enrichedContext.primaryToolchainType || '',
                FunctionInvocations: [
                  { FunctionName: selectedFunction.FunctionName, Arguments: functionArgs },
                ],
                ...(options.labels && { Labels: options.labels }),
                ...(options.annotations && { Annotations: options.annotations }),
                ...(options.bridgeWorkerId && { BridgeWorkerID: options.bridgeWorkerId }),
              },
            }).unwrap();

            const embeddedError = extractEmbeddedError(result);
            if (embeddedError) return { success: false, error: embeddedError };

            setInvokeResult({
              success: true,
              message: `Invocation "${options.displayName}" saved successfully`,
            });

            return { success: true };
          }
        } else if (options.mode === 'overwrite' && options.invocationId && spaceId) {
          // Send current version - server checks it matches then increments
          // Overwrite edits the arguments of the one function being invoked. An Invocation may
          // call several, so the others are carried through rather than dropped.
          const existingFunctions = invocationFunctions(loadedInvocation);
          const editedFunction = existingFunctions.some(
            (fn) => fn.FunctionName === selectedFunction.FunctionName,
          );
          const updatedFunctions = editedFunction
            ? existingFunctions.map((fn) =>
                fn.FunctionName === selectedFunction.FunctionName
                  ? { ...fn, Arguments: functionArgs }
                  : fn,
              )
            : [{ FunctionName: selectedFunction.FunctionName, Arguments: functionArgs }];

          const result = await patchInvocationMutation({
            spaceId,
            invocationId: options.invocationId,
            body: {
              FunctionInvocations: updatedFunctions,
              Version: loadedInvocation?.Version ?? 0,
            },
          }).unwrap();

          const embeddedError = extractEmbeddedError(result);
          if (embeddedError) return { success: false, error: embeddedError };

          // Update loadedInvocation with the new version from the response
          setLoadedInvocation(result as Invocation);

          setInvokeResult({
            success: true,
            message: 'Invocation updated successfully',
          });

          return { success: true };
        }

        return { success: false, error: 'Invalid save mode' };
      } catch (error) {
        console.error('Failed to save:', error);
        const { message } = extractApiErrorMessage(error);
        return { success: false, error: message };
      }
    },
    [
      spaceId,
      enrichedContext.primaryToolchainType,
      selectedFunction,
      loadedInvocation,
      createInvocationMutation,
      createTriggerMutation,
      patchInvocationMutation,
    ]
  );

  // Handle saving edited attribute values
  const handleSaveAttributes = useCallback(
    async (unitId: string, unitSpaceId: string, attributes: Array<{ ResourceName?: string; ResourceType?: string; Path?: string; AttributeName?: string; DataType?: string; Value?: unknown }>, changeDescription: string) => {
      setIsSavingAttributes(true);

      try {
        // Convert AttributeValueItem to the format expected by set-attributes
        const attributeList = attributes.map((attr) => ({
          ResourceName: attr.ResourceName || '',
          ResourceType: attr.ResourceType || '',
          Path: attr.Path || '',
          AttributeName: attr.AttributeName || '',
          DataType: attr.DataType || 'string',
          Value: attr.Value,
        }));

        await invokeFunctionMutation({
          spaceId: unitSpaceId,
          where: `UnitID='${unitId}'`,
          functionInvocationsRequest: {
            ChangeDescription: changeDescription,
            ToolchainType: enrichedContext.primaryToolchainType || '',
            FunctionInvocations: [
              {
                FunctionName: 'set-attributes',
                Arguments: [
                  {
                    ParameterName: 'attribute-list',
                    Value: JSON.stringify(attributeList),
                  },
                ],
              },
            ],
          },
        }).unwrap();

        // Update invokeResult with the user's typed values
        setInvokeResult((prevResult) => {
          if (!prevResult?.responses) {
            return prevResult || { success: true, message: 'Saved successfully' };
          }

          const updatedResponses = prevResult.responses.map((response) => {
            if (response.UnitID === unitId && response.Outputs) {
              // Update the AttributeValueList with the new attribute values
              const attributeListBase64 = btoa(JSON.stringify(attributeList));

              return {
                ...response,
                Outputs: {
                  ...response.Outputs,
                  AttributeValueList: attributeListBase64,
                },
              };
            }
            return response;
          });

          return {
            success: true,
            message: 'Attributes saved successfully',
            responses: updatedResponses,
          };
        });
      } catch (error) {
        console.error('Failed to save attributes:', error);
        // Re-throw so the component can handle the error state
        throw error;
      } finally {
        setIsSavingAttributes(false);
      }
    },
    [enrichedContext.primaryToolchainType, invokeFunctionMutation]
  );

  return (
    <SidebarContainer>
      {/* Resize Handle - on the left edge of the button bar. Only interactive when open. */}
      {isOpen && (
        <ResizeHandle
          onMouseDown={onResizeStart}
          sx={{
            backgroundColor: isResizing ? theme.palette.primary.main : undefined,
          }}
        />
      )}

      {/* Button Bar - acts as separator between main content and sidebar */}
      <ButtonBar>
        <Tooltip title="Functions (F)" placement="left">
          <SidebarButton
            isActive={isOpen}
            onClick={handleFunctionsButtonClick}
            aria-label="Functions"
            data-testid="invoker-functions-button"
          >
            <FunctionsIcon fontSize="small" />
            <Typography
              variant="body2"
              sx={{
                writingMode: 'vertical-rl',
                textOrientation: 'mixed',
                transform: 'rotate(180deg)',
                fontWeight: 500,
                color: 'text.secondary',
                userSelect: 'none',
              }}
            >
              [F]unctions
            </Typography>
          </SidebarButton>
        </Tooltip>
      </ButtonBar>

      {/* Sidebar Panel - expands to the right of the button bar */}
      <SidebarPanel isOpen={isOpen} panelWidth={panelWidth}>

        {/* Header */}
        <SidebarHeader>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flex: 1, minWidth: 0 }}>
            {selectedFunction && (
              <IconButton size="small" onClick={handleBack} aria-label="back">
                <ArrowBackIcon fontSize="small" />
              </IconButton>
            )}
            <Typography variant="subtitle1" fontWeight={600} noWrap>
              {selectedFunction ? selectedFunction.FunctionName : 'Functions'}
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <Tooltip title="Close">
              <IconButton size="small" onClick={handleClose}>
                <CloseIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </Box>
        </SidebarHeader>

        {/* Content */}
        <SidebarContent>
          <InvokerContent
            key={selectionKey || 'no-selection'}
            context={enrichedContext}
            functions={functions}
            savedInvocations={savedInvocations}
            recentInvocations={recentInvocations}
            selectedFunction={selectedFunction}
            onSelectFunction={handleSelectFunction}
            onSelectInvocation={handleSelectInvocation}
            prefilledValues={prefilledValues}
            loadedInvocation={loadedInvocation}
            onInvoke={handleInvoke}
            onSave={handleSave}
            isInvoking={isInvoking}
            invokeResult={invokeResult}
            onRemoveUnit={handleInternalRemoveUnit}
            onAddUnit={handleInternalAddUnit}
            onRemoveAllUnits={handleInternalRemoveAllUnits}
            onRestoreAllUnits={handleInternalRestoreAllUnits}
            toolchainFilter={toolchainFilter}
            availableToolchainTypes={availableToolchainTypes}
            onToolchainFilterChange={handleToolchainFilterChange}
            onRemoveHistoryItem={handleRemoveHistoryItem}
            onDeleteSavedInvocation={handleDeleteSavedInvocation}
            functionsByToolchain={functionsData as ListOrgFunctionsApiResponse}
            totalVisibleUnits={totalVisibleUnits}
            onSaveAttributes={handleSaveAttributes}
            isSavingAttributes={isSavingAttributes}
          />
        </SidebarContent>
      </SidebarPanel>
      <LockedUnitsDialog
        open={lockedUnitIds.length > 0}
        holders={lockHolders}
        onClose={() => {
          setLockedUnitIds([]);
          pendingInvokeRef.current = null;
        }}
        onRetry={() => {
          const retry = pendingInvokeRef.current;
          setLockedUnitIds([]);
          retry?.();
        }}
        onForceUnlock={async () => {
          await forceUnlock();
          const retry = pendingInvokeRef.current;
          setLockedUnitIds([]);
          retry?.();
        }}
      />
    </SidebarContainer>
  );
};

export default InvokerSidebar;
