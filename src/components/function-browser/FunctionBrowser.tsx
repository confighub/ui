// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { useCallback, useMemo, useRef, useState } from 'react';

import { DiffCodeEditor } from '@/components/diff-editor-new/DiffCodeEditor';
import { ErrorList } from '@/components/error-list/ErrorList';
import { FunctionInvocationHoverCard } from '@/components/function-invocation-hover-card/FunctionInvocationHoverCard';
import { AttributeValueListTable } from '@/components/function-result-list/components/attribute-value-table/AttributeValueListTable';
import { ResourceInfoListTable } from '@/components/function-result-list/components/resource-info-list-table/ResourceInfoListTable';
import { ValidationResultTable } from '@/components/validation-result-table/ValidationResultTable';
import { useAppSelector } from '@/hooks/useApp';
import type {
  ExtendedUnitRead,
  FunctionArgument,
  FunctionInvocation,
  FunctionInvocationsResponse,
  FunctionSignature,
  Invocation,
  InvocationRead,
  InvokeFunctionsApiArg,
  UnitRead,
} from '@confighub/rtk-query';
import {
  useDeleteInvocationMutation,
  useDeleteTriggerMutation,
  useInvokeFunctionsMutation,
  useListAllInvocationsQuery,
  useListAllTriggersQuery,
  useListFunctionsQuery,
  useListSpacesQuery,
} from '@confighub/rtk-query';
import { selectSelectedUnits } from '@/state/slices/selectedUnits';
import { OUTPUT_TYPES } from '@/types';
import { invocationFunctions } from '@/utility/invocation-functions';
import type { OutputType } from '@/types';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import BookmarkIcon from '@mui/icons-material/Bookmark';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import ImageNotSupportedIcon from '@mui/icons-material/ImageNotSupported';
import ListAltIcon from '@mui/icons-material/ListAlt';
import MemoryIcon from '@mui/icons-material/Memory';
import PlaylistAddCheckIcon from '@mui/icons-material/PlaylistAddCheck';
import SearchIcon from '@mui/icons-material/Search';
import TextFormatIcon from '@mui/icons-material/TextFormat';
import Autocomplete from '@mui/material/Autocomplete';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import IconButton from '@mui/material/IconButton';
import Skeleton from '@mui/material/Skeleton';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { alpha, styled } from '@mui/material/styles';

import {
  type InvocationResults,
  buildDiffUnits,
  processInvocationResponses,
} from '../../hooks/useInvokeFunctions';
import { DynamicFunctionForm, type FunctionInvocationResultData } from './DynamicFunctionForm';
import { EmptyFunctionsSection } from './EmptyFunctionSection';
import { FunctionHoverCard } from './FunctionHoverCard';
import { useUnitDataMap } from '@/hooks/useUnitData';

// ============================================================================
// TYPES
// ============================================================================

export interface FunctionOption extends FunctionSignature {
  /** Toolchain type category for grouping */
  category: string;
  optionType?: 'function';
}

export interface InvocationOption {
  category: string;
  /** 'invocation' = args pre-filled → auto-invoke; 'savedFunction' = no args → open form; 'trigger' = auto-invoke */
  optionType: 'invocation' | 'savedFunction' | 'trigger';
  Slug: string;
  DisplayName?: string;
  FunctionName?: string;
  ToolchainType: string;
  Arguments?: FunctionArgument[] | null;
  /**
   * Every function the option invokes, for a saved Invocation that calls more than one. The
   * FunctionName and Arguments above describe the first, which is what the form edits and what
   * the option is labeled by.
   */
  FunctionInvocations?: FunctionInvocation[];
  SpaceID?: string;
  InvocationID?: string;
}

export type AutocompleteOption = FunctionOption | InvocationOption;

// ============================================================================
// HELPERS
// ============================================================================

const isInvocationOption = (option: AutocompleteOption): option is InvocationOption =>
  option.optionType === 'invocation' ||
  option.optionType === 'savedFunction' ||
  option.optionType === 'trigger';

/** Builds validation rows from invocation results for the ValidationResultTable */
const toValidationRows = (results: InvocationResults, units: ExtendedUnitRead[]) => {
  return results.items
    .map((item) => {
      const extended = units.find((u) => u.Unit?.UnitID === item.id);
      const unit = extended?.Unit;
      if (!unit) return null;
      return {
        id: item.id,
        name: unit.DisplayName || item.unitSlug,
        isSuccess: item.success,
        validationResult: item.validationResult ?? '',
        validationErrors: unit.ValidationErrors || {},
        labels: unit.Labels || {},
        lastChangeDescription: unit.LastChangeDescription || '',
        headRevision: unit.HeadRevisionNum ?? 0,
        lastReleasedRevision: unit.LastReleasedRevisionNum ?? 0,
        spaceName: item.spaceName,
        spaceId: item.spaceId,
      };
    })
    .filter((row): row is NonNullable<typeof row> => row !== null);
};

// ============================================================================
// SUGGESTIONS
// ============================================================================

interface FunctionSuggestion {
  icon: React.ReactNode;
  title: string;
  functionName: string;
  description: string;
  detail: string;
}

const FUNCTION_SUGGESTIONS: FunctionSuggestion[] = [
  {
    icon: <ImageNotSupportedIcon sx={{ fontSize: 15 }} />,
    title: 'Block :latest Tags',
    functionName: 'vet-images',
    description: 'Fail validation if any container image uses the :latest tag.',
    detail:
      'Non-deterministic image tags are a common source of unexpected production behavior. Extend with DenyStrings to block other patterns (e.g. ":dev", ":rc").',
  },
  {
    icon: <PlaylistAddCheckIcon sx={{ fontSize: 15 }} />,
    title: 'Minimum Replicas',
    functionName: 'vet-celexpr',
    description: 'Enforce Deployments have ≥ 2 replicas for high availability.',
    detail:
      'Uses a CEL expression: r.kind != "Deployment" || r.spec.replicas >= 2. Adjust the threshold for your HA requirements.',
  },
  {
    icon: <MemoryIcon sx={{ fontSize: 15 }} />,
    title: 'Resource Limits',
    functionName: 'vet-celexpr',
    description: 'Verify every container defines CPU and memory limits.',
    detail:
      'Unbounded containers can cause noisy-neighbour issues in multi-tenant clusters. CEL expression: r.kind != "Deployment" || r.spec.template.spec.containers.all(c, has(c.resources) && has(c.resources.limits))',
  },
  {
    icon: <TextFormatIcon sx={{ fontSize: 15 }} />,
    title: 'No Placeholder Values',
    functionName: 'vet-placeholders',
    description: 'Catch unresolved template tokens before they reach production.',
    detail:
      'Detects common patterns like <value>, ${VAR}, and {{placeholder}} left in configs. Run as a mutation gate to prevent broken deployments.',
  },
  {
    icon: <SearchIcon sx={{ fontSize: 15 }} />,
    title: 'Validate Schema',
    functionName: 'validate-k8s',
    description: 'Check Kubernetes resource structure against the API schema.',
    detail:
      'Surfaces missing required fields and type mismatches before apply. Useful for catching regressions introduced by templating or function mutations.',
  },
  {
    icon: <ListAltIcon sx={{ fontSize: 15 }} />,
    title: 'List Resources',
    functionName: 'list-resources',
    description: 'Enumerate all rendered Kubernetes resources for selected units.',
    detail:
      'A read-only audit of what will actually be deployed. Useful for reviewing resource counts, kinds, and namespaces before committing a change.',
  },
];

const SuggestionTooltip = styled(
  ({ className, ...props }: React.ComponentProps<typeof Tooltip>) => (
    <Tooltip {...props} classes={{ popper: className }} />
  ),
)(({ theme }) => ({
  [`& .MuiTooltip-tooltip`]: {
    backgroundColor: theme.palette.background.paper,
    color: theme.palette.text.primary,
    border: `1px solid ${theme.palette.divider}`,
    boxShadow: theme.shadows[4],
    borderRadius: 8,
    padding: theme.spacing(1.25, 1.5),
    maxWidth: 280,
  },
  [`& .MuiTooltip-arrow`]: {
    color: theme.palette.background.paper,
    '&::before': {
      border: `1px solid ${theme.palette.divider}`,
    },
  },
}));

const SuggestionItem = styled(Box)(({ theme }) => ({
  display: 'flex',
  alignItems: 'flex-start',
  gap: theme.spacing(1.25),
  padding: theme.spacing(0.875, 1),
  borderRadius: theme.spacing(0.75),
  cursor: 'default',
  transition: 'background-color 0.15s',
  '&:hover': {
    backgroundColor: alpha(theme.palette.primary.main, 0.06),
  },
}));

const SuggestionIconWrap = styled(Box)(({ theme }) => ({
  width: 26,
  height: 26,
  borderRadius: theme.spacing(0.5),
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0,
  backgroundColor: alpha(theme.palette.primary.main, 0.1),
  color: theme.palette.primary.main,
  marginTop: 1,
}));

const FunctionSuggestions = () => (
  <Box>
    <Typography
      variant='caption'
      color='text.disabled'
      sx={{
        px: 1,
        display: 'block',
        mb: 0.75,
        textTransform: 'uppercase',
        letterSpacing: '0.06em',
        fontSize: '0.65rem',
      }}
    >
      Common checks &amp; validations
    </Typography>
    <Stack spacing={0.25}>
      {FUNCTION_SUGGESTIONS.map((s) => (
        <SuggestionTooltip
          key={`${s.functionName}-${s.title}`}
          title={
            <>
              <Typography variant='caption' fontWeight={700} display='block' mb={0.5}>
                {s.functionName}
              </Typography>
              <Typography
                variant='caption'
                color='text.secondary'
                display='block'
                sx={{ lineHeight: 1.5 }}
              >
                {s.detail}
              </Typography>
            </>
          }
          placement='left'
          arrow
        >
          <SuggestionItem>
            <SuggestionIconWrap>{s.icon}</SuggestionIconWrap>
            <Box sx={{ minWidth: 0 }}>
              <Typography
                variant='caption'
                fontWeight={600}
                display='block'
                sx={{ lineHeight: 1.3 }}
              >
                {s.title}
              </Typography>
              <Typography
                variant='caption'
                color='text.secondary'
                display='block'
                sx={{ lineHeight: 1.4, fontSize: '0.7rem' }}
              >
                {s.description}
              </Typography>
            </Box>
          </SuggestionItem>
        </SuggestionTooltip>
      ))}
    </Stack>
  </Box>
);

// ============================================================================
// COMPONENT
// ============================================================================

/**
 * FunctionBrowser provides a searchable function selector with a detail
 * card that displays the description and parameters of the selected function.
 */
interface DeleteTarget {
  type: 'invocation' | 'trigger';
  id: string;
  spaceId: string;
  name: string;
}

export const FunctionBrowser = () => {
  const [selectedOption, setSelectedOption] = useState<AutocompleteOption | null>(null);
  const [resultData, setResultData] = useState<FunctionInvocationResultData | null>(null);
  const [isAutoInvoking, setIsAutoInvoking] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [deleteErrors, setDeleteErrors] = useState<string[]>([]);
  const [isDeleting, setIsDeleting] = useState(false);
  const selectedUnitsRaw = useAppSelector(selectSelectedUnits);
  const selectedUnits = useMemo(() => selectedUnitsRaw ?? [], [selectedUnitsRaw]);
  // The "before" side of a preview diff is the stored configuration, fetched in one request.
  const { dataFor: unitDataFor } = useUnitDataMap(selectedUnits.map((u) => u.Unit?.UnitID));
  const cleanupRef = useRef<(() => void) | null>(null);

  // Derived: selectedFunction (only when it's a FunctionOption)
  const selectedFunction =
    selectedOption && !isInvocationOption(selectedOption)
      ? (selectedOption as FunctionOption)
      : null;

  // Scroll handler for the function options list to prevent scroll bleed to the outer container
  const listboxRef = useCallback((node: HTMLUListElement | null) => {
    cleanupRef.current?.();
    cleanupRef.current = null;
    if (!node) return;
    const handler = (e: WheelEvent) => {
      e.preventDefault();
      node.scrollTop += e.deltaY * 0.4;
    };
    node.addEventListener('wheel', handler, { passive: false });
    cleanupRef.current = () => node.removeEventListener('wheel', handler);
  }, []);

  const { data: spaces = [], isLoading: isLoadingSpaces } = useListSpacesQuery({});
  const activeSpaceId = spaces[0]?.Space?.SpaceID || '';

  const { data: functions = {}, isLoading: isLoadingFunctions } = useListFunctionsQuery(
    { spaceId: activeSpaceId },
    { skip: !activeSpaceId },
  );

  const { data: invocationsData = [] } = useListAllInvocationsQuery({});
  const { data: triggersData = [] } = useListAllTriggersQuery({});

  const [invokeFunctionMutation] = useInvokeFunctionsMutation();
  const [deleteInvocation] = useDeleteInvocationMutation();
  const [deleteTrigger] = useDeleteTriggerMutation();

  // All function options (unfiltered)
  const functionOptions: FunctionOption[] = useMemo(
    () =>
      Object.entries(functions).flatMap(([category, funcs]) =>
        Object.values(funcs as Record<string, FunctionSignature>).map((func) => ({
          category,
          optionType: 'function' as const,
          ...func,
        })),
      ),
    [functions],
  );

  // Toolchain types from selected units
  const selectedToolchains = useMemo(() => {
    const types = selectedUnits
      .map((u) => u.Unit?.ToolchainType)
      .filter((t): t is string => !!t);
    return new Set(types);
  }, [selectedUnits]);

  // Filter functions by toolchain type of selected units (show all if no units selected)
  const filteredFunctionOptions = useMemo(
    () =>
      selectedToolchains.size > 0
        ? functionOptions.filter((opt) => selectedToolchains.has(opt.category))
        : functionOptions,
    [functionOptions, selectedToolchains],
  );

  const invocationsRaw = useMemo(
    () => invocationsData.map((r) => r.Invocation).filter(Boolean),
    [invocationsData],
  );

  // An Invocation opens the function form only when there is one function to fill in and it has
  // no arguments yet. Anything else -- arguments already supplied, or several functions -- is
  // ready to run, so selecting it invokes.
  const isSavedFunction = (inv: InvocationRead) => {
    const functions = invocationFunctions(inv);
    return functions.length === 1 && !functions[0].Arguments?.length;
  };

  const toInvocationOption = (inv: InvocationRead, category: string, optionType: 'invocation' | 'savedFunction') => {
    const functions = invocationFunctions(inv);
    return {
      category,
      optionType,
      Slug: inv.Slug ?? '',
      DisplayName: inv.DisplayName,
      FunctionName: functions[0]?.FunctionName,
      ToolchainType: inv.ToolchainType ?? '',
      Arguments: functions[0]?.Arguments,
      FunctionInvocations: functions,
      SpaceID: inv.SpaceID,
      InvocationID: inv.InvocationID,
    };
  };

  // Saved Invocations: ready to run → auto-invoke on select
  const savedInvocationOptions: InvocationOption[] = useMemo(
    () =>
      invocationsRaw
        .filter((inv) => !isSavedFunction(inv!))
        .map((inv) => toInvocationOption(inv!, 'Saved Invocations', 'invocation')),
    [invocationsRaw],
  );

  // Saved Functions: one function with no arguments → open the function form pre-filled
  const savedFunctionOptions: InvocationOption[] = useMemo(
    () =>
      invocationsRaw
        .filter((inv) => isSavedFunction(inv!))
        .map((inv) => toInvocationOption(inv!, 'Saved Functions', 'savedFunction')),
    [invocationsRaw],
  );

  // Triggers: always auto-invoke (secondary bookmark color)
  const triggerOptions: InvocationOption[] = useMemo(
    () =>
      triggersData
        .map((r) => r.Trigger)
        .filter(Boolean)
        .map((t) => ({
          category: 'Triggers',
          optionType: 'trigger' as const,
          Slug: t!.Slug ?? '',
          DisplayName: t!.DisplayName,
          FunctionName: t!.FunctionName,
          ToolchainType: t!.ToolchainType ?? '',
          Arguments: t!.Arguments,
          SpaceID: t!.SpaceID,
          InvocationID: t!.TriggerID,
        })),
    [triggersData],
  );

  // Merge: saved invocations → saved functions → triggers → filtered regular functions
  const allOptions: AutocompleteOption[] = useMemo(
    () => [
      ...savedInvocationOptions,
      ...savedFunctionOptions,
      ...triggerOptions,
      ...filteredFunctionOptions,
    ],
    [savedInvocationOptions, savedFunctionOptions, triggerOptions, filteredFunctionOptions],
  );

  const isLoading = isLoadingSpaces || isLoadingFunctions;

  const handleResults = useCallback((data: FunctionInvocationResultData) => {
    setResultData(data);
  }, []);

  const handleConfirmDelete = useCallback(async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    setDeleteErrors([]);
    try {
      if (deleteTarget.type === 'invocation') {
        await deleteInvocation({
          spaceId: deleteTarget.spaceId,
          invocationId: deleteTarget.id,
        }).unwrap();
      } else {
        await deleteTrigger({
          spaceId: deleteTarget.spaceId,
          triggerId: deleteTarget.id,
        }).unwrap();
      }
      setDeleteTarget(null);
    } catch (err) {
      const msg = (err as { data?: { message?: string } })?.data?.message ?? 'Delete failed';
      setDeleteErrors([msg]);
    } finally {
      setIsDeleting(false);
    }
  }, [deleteTarget, deleteInvocation, deleteTrigger]);

  const handleAutoInvoke = useCallback(
    async (invocation: InvocationOption) => {
      if (selectedUnits.length === 0) return;
      setIsAutoInvoking(true);
      setSelectedOption(null);

      // A Trigger option carries only its own function; an Invocation option carries the whole
      // list it calls.
      const invokedFunctions: FunctionInvocation[] =
        invocation.FunctionInvocations?.length
          ? invocation.FunctionInvocations
          : [{ FunctionName: invocation.FunctionName || '', Arguments: invocation.Arguments ?? [] }];

      try {
        const settled = await Promise.allSettled(
          selectedUnits.map(async (extended) => {
            const unit = extended.Unit || ({} as UnitRead);
            const input: InvokeFunctionsApiArg = {
              spaceId: unit.SpaceID || '',
              where: `UnitID='${unit.UnitID}'`,
              functionInvocationsRequest: {
                ToolchainType: invocation.ToolchainType,
                FunctionInvocations: invokedFunctions.map((f) => ({
                  FunctionName: f.FunctionName || '',
                  Arguments: (f.Arguments ?? []).map((a) => ({
                    ParameterName: a.ParameterName,
                    Value: a.Value,
                  })),
                })),
              },
            };
            return invokeFunctionMutation(input).unwrap();
          }),
        );

        const successfulResponses: FunctionInvocationsResponse[][] = [];
        const requestErrors: string[] = [];
        settled.forEach((result, index) => {
          if (result.status === 'fulfilled') {
            successfulResponses.push(result.value);
          } else {
            const unit = selectedUnits[index]?.Unit;
            const reason = result.reason as { data?: { message?: string } };
            requestErrors.push(
              `${unit?.Slug || 'Unknown'}: ${reason?.data?.message || 'Unknown error'}`,
            );
          }
        });

        const flatResponses = successfulResponses.flat();
        const invocationResults = processInvocationResponses(
          flatResponses,
          selectedUnits,
          invocation.FunctionName || '',
        );

        const allErrors = [...requestErrors, ...invocationResults.errors];
        const finalResults: InvocationResults = {
          ...invocationResults,
          errors: allErrors,
          hasErrors: allErrors.length > 0,
        };

        const func = functionOptions.find((f) => f.FunctionName === invocation.FunctionName);
        // Any mutating function in the list means the run may have changed the data.
        const anyMutating = invokedFunctions.some((f) =>
          functionOptions.some((option) => option.FunctionName === f.FunctionName && option.Mutating),
        );
        handleResults({
          ...(anyMutating
            ? buildDiffUnits(finalResults, selectedUnits, unitDataFor)
            : { diffUnits: [], dataOverrides: new Map<string, string>() }),
          results: finalResults,
          selectedFunction:
            func ?? ({ FunctionName: invocation.FunctionName } as FunctionSignature),
        });
      } finally {
        setIsAutoInvoking(false);
      }
    },
    [selectedUnits, functionOptions, invokeFunctionMutation, handleResults],
  );

  if (isLoadingSpaces) {
    return (
      <Stack spacing={2}>
        <Skeleton variant='rounded' height={40} />
        <Skeleton variant='rounded' height={40} />
      </Stack>
    );
  }

  if (spaces.length === 0) {
    return (
      <Typography variant='body2' color='text.secondary' textAlign='center'>
        No spaces available
      </Typography>
    );
  }

  const renderFunctionContent = () => {
    if (selectedFunction && selectedUnits.length > 0) {
      return (
        <DynamicFunctionForm
          key={selectedFunction.FunctionName}
          selectedFunction={selectedFunction}
          units={selectedUnits}
          spaceId={activeSpaceId}
          onResults={handleResults}
        />
      );
    }
    if (isLoading) return null;
    if (functionOptions.length === 0 && activeSpaceId) {
      return (
        <Typography variant='body2' color='text.secondary' textAlign='center' sx={{ mt: 2 }}>
          No functions available for this space
        </Typography>
      );
    }
    if (!selectedFunction && selectedUnits.length === 0) {
      return <EmptyFunctionsSection />;
    }
    return null;
  };

  const renderResultsContent = () => {
    if (isAutoInvoking) {
      return (
        <Box
          sx={{
            p: 4,
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            gap: 2,
          }}
        >
          <CircularProgress size={20} />
          <Typography variant='body2' color='text.secondary'>
            Invoking...
          </Typography>
        </Box>
      );
    }

    if (!resultData) {
      return (
        <Box sx={{ p: 4, textAlign: 'center' }}>
          <Typography variant='body2' color='text.secondary'>
            No results yet. Invoke a function to see results.
          </Typography>
        </Box>
      );
    }

    const { results, diffUnits, dataOverrides, selectedFunction: func } = resultData;
    const isValidating = func.Validating;
    const outputType = (func.OutputInfo?.OutputType as OutputType) || 'YAML';
    const hasItems = results.items.length > 0;

    return (
      <Stack spacing={2} px={1}>
        {results.errors.length > 0 && (
          <ErrorList
            errors={results.errors}
            onClose={() =>
              setResultData((prev) =>
                prev
                  ? {
                      ...prev,
                      results: { ...prev.results, errors: [], hasErrors: false },
                    }
                  : null,
              )
            }
          />
        )}

        {hasItems && isValidating && (
          <ValidationResultTable rows={toValidationRows(results, selectedUnits)} />
        )}

        {hasItems && !isValidating && outputType === OUTPUT_TYPES.ATTRIBUTE_VALUE_LIST && (
          <AttributeValueListTable
            data={results.items.flatMap((item) => {
              if (!item.output) return [];
              try {
                const decoded = atob(item.output);
                const parsed: unknown = JSON.parse(decoded);
                const attrs = Array.isArray(parsed) ? parsed : [parsed];
                return attrs.map((attr) => ({
                  ...attr,
                  UnitName: item.unitSlug,
                  SpaceName: item.spaceName,
                }));
              } catch {
                return [];
              }
            })}
          />
        )}

        {hasItems && !isValidating && outputType === OUTPUT_TYPES.RESOURCE_INFO_LIST && (
          <ResourceInfoListTable
            data={results.items.flatMap((item) => {
              if (!item.output) return [];
              try {
                const decoded = atob(item.output);
                const parsed: unknown = JSON.parse(decoded);
                const resources = Array.isArray(parsed) ? parsed : [parsed];
                return resources.map((resource) => ({
                  ...resource,
                  UnitName: item.unitSlug,
                  SpaceName: item.spaceName,
                }));
              } catch {
                return [];
              }
            })}
          />
        )}

        {diffUnits.length > 0 && (
          <DiffCodeEditor units={diffUnits} dataOverrides={dataOverrides} editorOffset='120px' />
        )}
      </Stack>
    );
  };

  const deleteDialog = (
    <Dialog
      open={!!deleteTarget}
      onClose={() => !isDeleting && setDeleteTarget(null)}
      maxWidth='xs'
      fullWidth
    >
      <DialogTitle sx={{ pb: 1 }}>
        Delete {deleteTarget?.type === 'trigger' ? 'Trigger' : 'Saved Invocation'}?
      </DialogTitle>
      <DialogContent>
        <Typography variant='body2' color='text.secondary'>
          <Box component='span' fontWeight={600} color='text.primary'>
            {deleteTarget?.name}
          </Box>{' '}
          will be permanently removed and cannot be undone.
        </Typography>
        {deleteErrors.length > 0 && (
          <Box mt={2}>
            <ErrorList errors={deleteErrors} onClose={() => setDeleteErrors([])} />
          </Box>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button size='small' onClick={() => setDeleteTarget(null)} disabled={isDeleting}>
          Cancel
        </Button>
        <Button
          size='small'
          variant='contained'
          onClick={handleConfirmDelete}
          disabled={isDeleting}
          startIcon={isDeleting ? <CircularProgress size={12} color='inherit' /> : undefined}
        >
          {isDeleting ? 'Deleting…' : 'Delete'}
        </Button>
      </DialogActions>
    </Dialog>
  );

  const showResults = !!resultData || isAutoInvoking;

  const searchEl = selectedUnits?.length > 0 && (
    <Box>
      <Autocomplete
        size='small'
        options={allOptions}
        loading={isLoadingFunctions}
        groupBy={(option) => option.category}
        getOptionLabel={(option) =>
          isInvocationOption(option)
            ? option.Slug
            : (option as FunctionOption).FunctionName || ''
        }
        value={selectedOption}
        onChange={(_event, value) => {
          if (!value) {
            setSelectedOption(null);
            setResultData(null);
            return;
          }
          if (isInvocationOption(value)) {
            if (value.optionType === 'invocation' || value.optionType === 'trigger') {
              handleAutoInvoke(value);
            } else {
              const func = functionOptions.find((f) => f.FunctionName === value.FunctionName);
              if (func) setSelectedOption(func);
            }
            return;
          }
          setSelectedOption(value);
          setResultData(null);
        }}
        isOptionEqualToValue={(option, value) => {
          if (isInvocationOption(option) && isInvocationOption(value)) {
            return option.InvocationID === value.InvocationID;
          }
          if (!isInvocationOption(option) && !isInvocationOption(value)) {
            return (
              (option as FunctionOption).FunctionName ===
              (value as FunctionOption).FunctionName
            );
          }
          return false;
        }}
        slotProps={{ listbox: { ref: listboxRef } }}
        renderInput={(params) => (
          <TextField {...params} label='Search functions' variant='outlined' />
        )}
        renderOption={(props, option) => {
          if (isInvocationOption(option)) {
            const optionContent = (
              <Stack
                direction='row'
                spacing={1}
                justifyContent='space-between'
                alignItems='center'
                width='100%'
              >
                <Typography variant='body2' sx={{ flexGrow: 1 }}>
                  {option.DisplayName || option.Slug}
                </Typography>
                <BookmarkIcon
                  color={option.optionType === 'trigger' ? 'secondary' : 'primary'}
                  sx={{ fontSize: 16, flexShrink: 0 }}
                />
                <Tooltip title='Delete'>
                  <IconButton
                    size='small'
                    sx={{ p: 0.25, flexShrink: 0 }}
                    onClick={(e) => {
                      e.stopPropagation();
                      setDeleteErrors([]);
                      setDeleteTarget({
                        type: option.optionType === 'trigger' ? 'trigger' : 'invocation',
                        id: option.InvocationID ?? '',
                        spaceId: option.SpaceID ?? activeSpaceId,
                        name: option.DisplayName || option.Slug,
                      });
                    }}
                  >
                    <DeleteOutlineIcon sx={{ fontSize: 15 }} />
                  </IconButton>
                </Tooltip>
              </Stack>
            );
            return (
              <li {...props}>
                <FunctionInvocationHoverCard invocation={option as unknown as Invocation}>
                  {optionContent}
                </FunctionInvocationHoverCard>
              </li>
            );
          }
          return (
            <li {...props}>
              <FunctionHoverCard func={option as FunctionOption}>
                <Stack>
                  <Typography variant='body2'>
                    {(option as FunctionOption).FunctionName}
                  </Typography>
                </Stack>
              </FunctionHoverCard>
            </li>
          );
        }}
      />
    </Box>
  );

  // Results view: back arrow + function name + count, then results
  if (showResults) {
    return (
      <>
        <Stack sx={{ height: '100%', overflow: 'hidden' }}>
          {/* Results header */}
          <Stack
            direction='row'
            alignItems='center'
            spacing={1}
            sx={{ px: 1, py: 0.75, flexShrink: 0 }}
          >
            <IconButton
              size='small'
              onClick={() => {
                setResultData(null);
              }}
              sx={{ p: 0.5 }}
            >
              <ArrowBackIcon sx={{ fontSize: 16 }} />
            </IconButton>
            <Typography variant='caption' fontWeight={600} sx={{ flex: 1 }} noWrap>
              {resultData?.selectedFunction?.FunctionName ?? 'Results'}
            </Typography>
          </Stack>

          <Box sx={{ flex: 1, overflowY: 'auto', scrollbarGutter: 'stable' }}>
            {renderResultsContent()}
          </Box>
        </Stack>
        {deleteDialog}
      </>
    );
  }

  // Default: function form view
  return (
    <Stack sx={{ height: '100%', overflow: 'hidden' }}>
      <Box p={2}>
        {searchEl}
        <Box>{renderFunctionContent()}</Box>
      </Box>
      {/* Suggestions — shown when units are selected but no function is chosen */}
      {selectedUnits.length > 0 && !selectedFunction && (
        <Box sx={{ px: 1.5, pb: 2, overflowY: 'auto' }}>
          <FunctionSuggestions />
        </Box>
      )}
      {deleteDialog}
    </Stack>
  );
};
