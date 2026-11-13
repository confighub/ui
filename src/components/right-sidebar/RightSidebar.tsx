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
  Clearance,
  FunctionArgument,
  FunctionInvocationsResponse,
  FunctionSignature,
  Invocation,
  useCreateInvocationMutation,
  useCreateTriggerMutation,
  useDeleteInvocationMutation,
  useGetSpaceQuery,
  useInvokeFunctionsOnOrgMutation,
  useLazyListAllUnitsQuery,
  useListAllUnitsQuery,
  useListAllInvocationsQuery,
  useListOrgFunctionsQuery,
  usePatchInvocationMutation,
} from '@confighub/rtk-query';
import { InvokerContent } from '../invoker/InvokerContent';
import { useAppDispatch, useAppSelector } from '@/hooks/useApp';
import {
  clearInvokerRequest,
  selectCreateTriggerInSpaceId,
  selectInvokerRequestSeq,
} from '@/state/slices/invokerRequest';
import { selectInvocationInitiativeId, selectInvocationTriggerRef } from '@/state/slices/selectedUnits';
import { useInvokeInChangeSet } from '@/components/invoker/hooks/useInvokeInChangeSet';
import { useInitiativeChangeSetLifecycle } from '@/components/invoker/hooks/useInitiativeChangeSetLifecycle';
import { ChangeSetSpaceDialog } from '@/components/invoker/components/ChangeSetSpaceDialog';
import { type ChangeSetSpace, RunCancelled } from '@/components/invoker/utils/triggerChangeSet';
import { useInvocationHistory } from '../invoker/hooks/useInvocationHistory';
import {
  FunctionParameterFormData,
  InvocationHistoryItem,
  InvokerContext,
  SaveInvocationOptions,
} from '../invoker/types/invoker.types';
import { extractApiErrorMessage, extractEmbeddedError } from '../invoker/utils/error-handling.utils';
import { firstInvocationFunction, invocationFunctions } from '@/utility/invocation-functions';
import { FUNCTIONS_PANEL_MARKER } from './appPanel';
import { guardedChanges } from '@/components/guarded-write/guardedWrite';
import { useGuardedWrite } from '@/components/guarded-write/useGuardedWrite';
import {
  NO_GUARD_VALUES,
  clearanceRecording,
  guardParams,
  guardStamp,
} from '@/components/guarded-write/guardValues';
import type { InvokeWriteOptions } from '@/components/invoker/InvokeWriteOptions';
import {
  guardSaveBlockedReason,
  guardsPatch,
  storedClearance,
} from '@/components/invoker/utils/invocation-write-options';
import { chunkInClause, inClause } from '@/hooks/inClauseChunks';
import { unitHasGuards } from '@/utility/clearance-functions';

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
  // Invocations go to the organization, so selected Units in every Space are reached. When
  // they all share a Space, its executor runs the functions, so the Attributes it registers
  // apply as they do on that Space's own pages.
  const executorSpaceId = effectiveUnits.every((unit) => unit.spaceId === spaceId) ? spaceId : undefined;

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
  const [invokeFunctionMutation] = useInvokeFunctionsOnOrgMutation();
  const [listUnits] = useLazyListAllUnitsQuery();
  const { start: startGuardedWrite, dialog: guardedWriteDialog } = useGuardedWrite('Run');

  // Which of the Units have guards, read in chunks since a long IN clause goes past the server's
  // limit. A write to the others is never withheld by a guard, so they need no dry run.
  const guardedUnitIds = useCallback(
    async (unitIds: string[]) => {
      const pages = await Promise.all(
        chunkInClause('UnitID', unitIds).map((where) =>
          listUnits({ where, select: 'UnitID,PathAnnotations' }).unwrap(),
        ),
      );
      return pages
        .flat()
        .filter((item) => unitHasGuards(item.Unit?.PathAnnotations))
        .map((item) => item.Unit?.UnitID)
        .filter((id): id is string => !!id);
    },
    [listUnits],
  );
  const [createInvocationMutation] = useCreateInvocationMutation();

  // When the Invoker runs for a Validation Trigger, each write is made in the Trigger's ChangeSet,
  // which is left open for the change to be reviewed. Otherwise invocations go through the
  // normal stateless `invokeFunctions` path.
  const initiativeId = useAppSelector(selectInvocationInitiativeId);
  const triggerRef = useAppSelector(selectInvocationTriggerRef);
  const forTrigger = Boolean(initiativeId && triggerRef);
  const { invoke: invokeInChangeSet } = useInvokeInChangeSet();
  const { joinChangeSet, triggerChangeSetSpaceFor } = useInitiativeChangeSetLifecycle();
  // The question of where a run's ChangeSet goes, when the Units are in several Spaces and none
  // is theirs, and how it is answered.
  const [spaceQuestion, setSpaceQuestion] = useState<{
    choices: ChangeSetSpace[];
    answer: (spaceId: string | undefined) => void;
  } | null>(null);
  const askChangeSetSpace = useCallback(
    (choices: ChangeSetSpace[]) =>
      new Promise<string | undefined>((resolve) =>
        setSpaceQuestion({
          choices,
          answer: (chosen) => {
            setSpaceQuestion(null);
            resolve(chosen);
          },
        }),
      ),
    [],
  );
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

  // A page asked for a Trigger to be created, in its Space or in one the user picks: the save
  // panel opens as a Trigger, in that Space when there is one, once a function is picked. The
  // request lasts until the invoker closes or a Trigger is saved.
  const dispatch = useAppDispatch();
  const createTriggerInSpaceId = useAppSelector(selectCreateTriggerInSpaceId);
  const invokerRequestSeq = useAppSelector(selectInvokerRequestSeq);
  const { data: createTriggerSpace } = useGetSpaceQuery(
    { spaceId: createTriggerInSpaceId || '' },
    { skip: !createTriggerInSpaceId },
  );
  const wasOpenRef = useRef(isOpen);
  useEffect(() => {
    if (wasOpenRef.current && !isOpen && createTriggerInSpaceId !== null) {
      dispatch(clearInvokerRequest());
    }
    wasOpenRef.current = isOpen;
  }, [isOpen, createTriggerInSpaceId, dispatch]);
  const saveAsTrigger = useMemo(
    () =>
      createTriggerInSpaceId !== null
        ? {
            requestSeq: invokerRequestSeq,
            spaceId: createTriggerInSpaceId,
            spaceName: createTriggerSpace?.Space?.Slug || '',
            onCancel: () => dispatch(clearInvokerRequest()),
          }
        : undefined,
    [createTriggerInSpaceId, invokerRequestSeq, createTriggerSpace?.Space?.Slug, dispatch],
  );

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
      writeOptions?: InvokeWriteOptions,
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

        // Each Unit as the dialog and the results name it: with its Space, since slugs repeat.
        const labelByUnitId: Record<string, string> = {};
        for (const u of enrichedContext.selectedUnits) {
          labelByUnitId[u.id] = u.spaceName ? `${u.spaceName}/${u.name}` : u.name;
        }
        const withheldIn = (responses: FunctionInvocationsResponse[]) =>
          responses.flatMap((r) =>
            guardedChanges(
              r.Conflicts,
              (r.UnitID && labelByUnitId[r.UnitID]) || '',
              r.SpaceID && r.UnitID ? { spaceId: r.SpaceID, unitId: r.UnitID } : undefined,
            ),
          );
        // One invocation, on the Units given. A parameterized Invocation sends the declared
        // parameter values, referencing the stored Invocation, and the server expands its
        // templated arguments. For a Validation Trigger the write is made in the Trigger's
        // ChangeSet (not yet for a parameterized Invocation).
        // The clearance is what the person stated, plus the guards they acknowledged at the write
        // (requirements of one key are alternatives, so the two add up), plus the guard the write
        // records, which the server refuses to record otherwise. A dry run sends the same, so it
        // previews what the write would withhold.
        const guardValues = writeOptions?.guardValues ?? NO_GUARD_VALUES;
        const invokeOn = async (
          unitIdsToRun: string[],
          options: { dryRun: boolean; clearance?: Clearance },
        ): Promise<FunctionInvocationsResponse[]> => {
          const cleared = [...(writeOptions?.clearance ?? []), ...(options.clearance ?? [])];
          const clearance = clearanceRecording(cleared.length > 0 ? cleared : undefined, guardValues);
          const guardOptions = {
            clearance: clearance ? JSON.stringify(clearance) : undefined,
            ...guardParams(guardValues),
          };
          if (initiativeId && triggerRef && !parameterizedInvocationId) {
            // Where a write's ChangeSet goes when none of the Trigger's holds the Units: their
            // Space, the root Space of their Component, or one the person chooses.
            const chooseSpace = async () => {
              const unitSpaceIds = enrichedContext.selectedUnits
                .filter((unit) => unitIdsToRun.includes(unit.id))
                .map((unit) => unit.spaceId);
              const choice = await triggerChangeSetSpaceFor(unitSpaceIds);
              return 'spaceId' in choice ? choice.spaceId : askChangeSetSpace(choice.ask);
            };
            const { responses } = await invokeInChangeSet({
              chooseSpace,
              executorSpaceId,
              initiativeId,
              triggerRef,
              unitIds: unitIdsToRun,
              toolchainType: enrichedContext.primaryToolchainType || '',
              functionInvocation: { FunctionName: functionName, Arguments: functionArgs },
              dryRun: options.dryRun,
              changeDescription: writeOptions?.changeDescription,
              ...guardOptions,
            });
            return responses;
          }
          const paramValues = Object.fromEntries(
            Object.entries(parameters).filter(
              ([, value]) => value !== undefined && value !== null && value !== '',
            ),
          );
          return invokeFunctionMutation({
            executorSpace: executorSpaceId,
            where: inClause('UnitID', unitIdsToRun),
            dryRun: options.dryRun ? 'true' : undefined,
            ...guardOptions,
            // A dry run writes nothing, so it is made in no ChangeSet: the Units join one only for
            // the write itself, and the server asks a ChangeSet to be open with them in it.
            changeSetId: options.dryRun ? undefined : writeOptions?.changeSetId,
            include: 'Diff',
            functionInvocationsRequest: parameterizedInvocationId
              ? {
                  ToolchainType: enrichedContext.primaryToolchainType || '',
                  ParameterizedInvocations: [
                    { InvocationID: parameterizedInvocationId, Parameters: paramValues },
                  ],
                  ChangeDescription: writeOptions?.changeDescription,
                }
              : {
                  ToolchainType: enrichedContext.primaryToolchainType || '',
                  FunctionInvocations: [{ FunctionName: functionName, Arguments: functionArgs }],
                  ChangeDescription: writeOptions?.changeDescription,
                },
          }).unwrap();
        };

        let result: FunctionInvocationsResponse[] | undefined;
        if (dryRun) {
          // A dry run asked for is the preview already: what guards would withhold shows in
          // its results.
          result = await invokeOn(selectedUnitIds, { dryRun: true });
        } else {
          // Where some of the Units have guards, those are run as a dry run first, to ask
          // before anything is written whether to clear what the guards would withhold.
          const guarded = await guardedUnitIds(selectedUnitIds);
          const outcome = await startGuardedWrite({
            guarded: guarded.length > 0,
            run: async ({ dryRun: preview, clearance }) => {
              if (preview) {
                return withheldIn(await invokeOn(guarded, { dryRun: true }));
              }
              // A ChangeSet the person chose is joined only for the write itself, so a dry run or
              // a cancelled one leaves the Units as they were.
              if (writeOptions?.changeSetId && !(forTrigger && !parameterizedInvocationId)) {
                await joinChangeSet({ unitIds: selectedUnitIds, changeSetId: writeOptions.changeSetId });
              }
              result = await invokeOn(selectedUnitIds, { dryRun: false, clearance });
              return withheldIn(result);
            },
          });
          if (outcome.status === 'cancelled') return;
        }

        const hasErrors = result?.some((r) => !r.Success);

        const slugByUnitId: Record<string, string> = {};
        for (const u of enrichedContext.selectedUnits) {
          if (u.name) slugByUnitId[u.id] = u.name;
        }

        const invokeResultObj = {
          success: !hasErrors,
          dryRun,
          message: hasErrors ? 'Some invocations failed' : 'All invocations succeeded',
          responses: result,
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
        if (error instanceof RunCancelled) {
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
    [spaceId, executorSpaceId, enrichedContext, invokeFunctionMutation, initiativeId, triggerRef, forTrigger, triggerChangeSetSpaceFor, askChangeSetSpace, invokeInChangeSet, joinChangeSet, addInvocation, guardedUnitIds, startGuardedWrite]
  );

  // Handle save invocation or trigger
  const handleSave = useCallback(
    async (
      options: SaveInvocationOptions,
      parameters: FunctionParameterFormData,
      writeOptions: InvokeWriteOptions,
    ): Promise<{ success: boolean; error?: string }> => {
      const targetSpaceId = options.spaceId || spaceId;

      if (!targetSpaceId || !selectedFunction?.FunctionName) {
        return { success: false, error: 'Missing space ID or function name' };
      }
      // An Invocation or Trigger stores the clearance and the guard the Options
      // state. Neither can hold an inherited guard, so that is not saved rather than dropped.
      const { guardValues } = writeOptions;
      const blockedReason = guardSaveBlockedReason(guardValues);
      if (blockedReason) return { success: false, error: blockedReason };
      const clearance = storedClearance(writeOptions.clearance, guardValues);
      const guards = guardStamp(guardValues);

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
                ...(options.channelId && { ChannelID: options.channelId }),
                ...(clearance && { Clearance: clearance }),
                ...(guards && { Guards: guards }),
              },
            }).unwrap();

            const embeddedError = extractEmbeddedError(result);
            if (embeddedError) return { success: false, error: embeddedError };

            setInvokeResult({
              success: true,
              message: `Trigger "${options.displayName}" saved successfully`,
            });
            dispatch(clearInvokerRequest());

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
                ...(options.channelId && { ChannelID: options.channelId }),
                ...(clearance && { Clearance: clearance }),
                ...(guards && { Guards: guards }),
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

          const patchedGuards = guardsPatch(loadedInvocation?.Guards, guardValues);
          const result = await patchInvocationMutation({
            spaceId,
            invocationId: options.invocationId,
            body: {
              FunctionInvocations: updatedFunctions,
              // A merge patch replaces a list whole, and null removes it.
              Clearance: clearance ?? null,
              ...(patchedGuards && { Guards: patchedGuards }),
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
      dispatch,
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
          executorSpace: unitSpaceId,
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
    <SidebarContainer data-testid="invoker-sidebar" {...FUNCTIONS_PANEL_MARKER}>
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
      <ButtonBar data-testid="invoker-rail">
        <Tooltip title="Functions (F)" placement="left">
          <SidebarButton
            isActive={isOpen}
            onClick={handleFunctionsButtonClick}
            aria-label="Functions"
            aria-expanded={isOpen}
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
            saveAsTrigger={saveAsTrigger}
            changeSetChoice={!forTrigger}
          />
        </SidebarContent>
      </SidebarPanel>
      {guardedWriteDialog}
      <ChangeSetSpaceDialog
        choices={spaceQuestion?.choices}
        triggerRef={triggerRef ?? ''}
        onChoose={(chosen) => spaceQuestion?.answer(chosen)}
      />
    </SidebarContainer>
  );
};

export default InvokerSidebar;
