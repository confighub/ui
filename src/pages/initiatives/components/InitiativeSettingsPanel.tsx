// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Controller, useForm } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';

import {
  DEFAULT_TOOLCHAIN_TYPES,
  extractLabelOptions,
  generateFilterId,
  parseWhereClausesToFilters,
  useQueryBuilder,
} from '@/components/query-builder';
import {
  useCreateFilterMutation,
  useCreateTriggerMutation,
  useCreateViewMutation,
  useInvokeFunctionsOnOrgMutation,
  useListAllBridgeWorkersQuery,
  useListAllTargetsQuery,
  useListAllUnitsQuery,
  useListAllViewsQuery,
  useListSpacesQuery,
  usePatchFilterMutation,
  usePatchTriggerMutation,
  usePatchViewMutation,
} from '@confighub/rtk-query';
import { Resource, convertToResourceList } from '@/utility/schema-functions';
import { ANNOTATION_VALUE_MAX_LENGTH } from '@confighub/api';
import { cleanString } from '@/utility/string-functions';
import type { Initiative, InitiativePriority, UnitCheckResult } from '@/types/initiative';
import Editor from '@monaco-editor/react';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import SaveIcon from '@mui/icons-material/Save';

import { getApiErrorMessage } from '@/utility/error-functions';
import { toUnitCheckResults } from '../utils/checkResultHelpers';
import { ErrorBox } from '@/components/error-box/ErrorBox';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Divider from '@mui/material/Divider';
import FormControl from '@mui/material/FormControl';
import FormHelperText from '@mui/material/FormHelperText';
import InputLabel from '@mui/material/InputLabel';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import TextField from '@mui/material/TextField';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';

const PRIORITIES: InitiativePriority[] = ['HIGH', 'MEDIUM', 'LOW'];

interface InitiativeFormValues {
  name: string;
  description: string;
  priority: InitiativePriority;
  deadline: string;
  kyvernoPolicy: string;
  triggerBridgeWorkerId: string;
  /** true = trigger runs with Warn=false (blocking ValidationErrors); false = Warn=true (non-blocking ValidationWarnings) */
  enforced: boolean;
}

interface InitiativeSettingsPanelProps {
  /** Called whenever the WHERE clause changes so the right pane can update live */
  onWhereClauseChange: (whereClause: string, whereDataClause: string, resourceTypeClause: string) => void;
  /** DOM node in the right pane where the QueryBuilder should be portaled into */
  scopePortalTarget?: HTMLElement | null;
  /** When provided, the panel operates in edit mode for this initiative */
  initiative?: Initiative;
  /** Called with test results after running the Kyverno policy check */
  onTestResults?: (results: UnitCheckResult[] | null) => void;
  /** Kyverno policy YAML fetched from the initiative's Trigger (edit mode only) */
  kyvernoPolicy?: string;
  /** Bridge worker ID fetched from the initiative's Trigger (edit mode only) */
  triggerBridgeWorkerId?: string;
  /** Warn flag fetched from the initiative's Trigger (edit mode only).
   *  true → failures produce non-blocking ValidationWarnings; false → blocking ValidationErrors. */
  triggerWarn?: boolean;
}

function generateSlug(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 40);
  return `${base}-${Date.now().toString(36)}`;
}

const MIN_EDITOR_HEIGHT = 120;
const DEFAULT_EDITOR_HEIGHT = 250;

function ResizableEditorContainer({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const [height, setHeight] = useState(DEFAULT_EDITOR_HEIGHT);
  const [isResizing, setIsResizing] = useState(false);
  const heightRef = useRef(height);
  heightRef.current = height;
  const startY = useRef(0);
  const startH = useRef(0);

  const onMouseMove = useCallback((e: MouseEvent) => {
    const newH = Math.max(MIN_EDITOR_HEIGHT, startH.current + (e.clientY - startY.current));
    setHeight(newH);
  }, []);

  const onMouseUp = useCallback(() => {
    setIsResizing(false);
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mouseup', onMouseUp);
  }, [onMouseMove]);

  // Clean up listeners on unmount to prevent leaks if unmounted mid-drag
  useEffect(() => {
    return () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };
  }, [onMouseMove, onMouseUp]);

  const onResizeStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      setIsResizing(true);
      startY.current = e.clientY;
      startH.current = heightRef.current;
      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    },
    [onMouseMove, onMouseUp],
  );

  return (
    <Box
      sx={{
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: 1,
        overflow: 'hidden',
        position: 'relative',
        zIndex: isResizing ? 1 : 'auto',
      }}
    >
      <Editor
        height={height}
        language='yaml'
        value={value}
        theme='light'
        onChange={(v) => onChange(v ?? '')}
        options={{
          minimap: { enabled: false },
          fontSize: 13,
          lineNumbers: 'on',
          lineNumbersMinChars: 2,
          lineDecorationsWidth: 10,
          folding: false,
          glyphMargin: false,
          scrollBeyondLastLine: false,
          automaticLayout: true,
          tabSize: 2,
          wordWrap: 'on',
          padding: { top: 8 },
        }}
      />
      {/* Drag handle for vertical resize */}
      <Box
        onMouseDown={onResizeStart}
        sx={{
          height: 6,
          cursor: 'row-resize',
          bgcolor: 'action.hover',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          '&:hover': { bgcolor: 'action.selected' },
        }}
      >
        <Box
          sx={{
            width: 32,
            height: 2,
            borderRadius: 1,
            bgcolor: 'text.disabled',
          }}
        />
      </Box>
    </Box>
  );
}

/**
 * Left pane of the initiative creation/edit split-view.
 * In create mode (no `initiative` prop): creates Filter + View (with initiative Labels/Annotations) + optional Trigger.
 * In edit mode (`initiative` prop supplied): patches the existing Filter + View + Trigger with updated metadata.
 */
export const InitiativeSettingsPanel = ({
  onWhereClauseChange,
  scopePortalTarget,
  initiative,
  onTestResults,
  kyvernoPolicy: kyvernoPolicyProp,
  triggerBridgeWorkerId: triggerBridgeWorkerIdProp,
  triggerWarn: triggerWarnProp,
}: InitiativeSettingsPanelProps) => {
  const isEditMode = Boolean(initiative);
  const navigate = useNavigate();

  const { refetch: refetchInitiatives } = useListAllViewsQuery({
    where: "Labels.initiative = 'true'",
    include: 'FilterID',
  });

  const [createFilter, { isLoading: isCreatingFilter }] = useCreateFilterMutation();
  const [createView, { isLoading: isCreatingView }] = useCreateViewMutation();
  const [patchFilter, { isLoading: isPatchingFilter }] = usePatchFilterMutation();
  const [patchView, { isLoading: isPatchingView }] = usePatchViewMutation();
  const [createTrigger, { isLoading: isCreatingTrigger }] = useCreateTriggerMutation();
  const [patchTrigger, { isLoading: isPatchingTrigger }] = usePatchTriggerMutation();

  const isSaving =
    isCreatingFilter ||
    isCreatingView ||
    isPatchingFilter ||
    isPatchingView ||
    isCreatingTrigger ||
    isPatchingTrigger;

  const {
    control,
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<InitiativeFormValues>({
    defaultValues: {
      name: initiative?.name ?? '',
      description: initiative?.description ?? '',
      priority: initiative?.priority ?? 'MEDIUM',
      deadline: initiative?.deadline ?? '',
      kyvernoPolicy: kyvernoPolicyProp ?? '',
      triggerBridgeWorkerId: triggerBridgeWorkerIdProp ?? '',
      // New initiatives default to non-enforced (Warn=true). Edit mode overrides
      // this via the useEffect below once the trigger query resolves.
      enforced: triggerWarnProp === undefined ? false : !triggerWarnProp,
    },
  });

  // ── Data for QueryBuilder ─────────────────────────────────────────────────
  const { spaces = [] } = useListSpacesQuery(
    {},
    {
      selectFromResult: (result) => ({
        spaces: result?.data?.map((s) => s.Space).filter(Boolean) ?? [],
      }),
    },
  );

  const queryBuilderSpaces = useMemo(
    () =>
      spaces.map((s) => ({
        id: s?.SpaceID ?? '',
        name: s?.DisplayName ?? s?.Slug ?? '',
        labels: s?.Labels as Record<string, string> | undefined,
      })),
    [spaces],
  );

  const { data: targetsData } = useListAllTargetsQuery({});
  const queryBuilderTargets = useMemo(
    () =>
      targetsData?.map((t) => ({
        id: t.Target?.TargetID ?? '',
        name: t.Target?.DisplayName ?? t.Target?.Slug ?? '',
      })) ?? [],
    [targetsData],
  );

  const { data: bridgeWorkersData } = useListAllBridgeWorkersQuery({});
  const queryBuilderBridgeWorkers = useMemo(
    () =>
      bridgeWorkersData?.map((w) => ({
        id: w.BridgeWorker?.BridgeWorkerID ?? '',
        name: w.BridgeWorker?.DisplayName ?? w.BridgeWorker?.Slug ?? '',
      })) ?? [],
    [bridgeWorkersData],
  );

  // Sync form with trigger data that arrives asynchronously after initial mount.
  // useForm's defaultValues are only evaluated once, so we need setValue for async props.
  useEffect(() => {
    if (kyvernoPolicyProp) {
      setValue('kyvernoPolicy', kyvernoPolicyProp);
    }
    if (triggerBridgeWorkerIdProp) {
      setValue('triggerBridgeWorkerId', triggerBridgeWorkerIdProp);
    }
    if (triggerWarnProp !== undefined) {
      setValue('enforced', !triggerWarnProp);
    }
  }, [kyvernoPolicyProp, triggerBridgeWorkerIdProp, triggerWarnProp, setValue]);

  // Auto-select a worker that has vet-kyverno (create mode only)
  const hasAutoSelectedWorker = useRef(false);
  useEffect(() => {
    if (isEditMode || hasAutoSelectedWorker.current || !bridgeWorkersData) return;
    const match = bridgeWorkersData.find((w) => {
      const funcs = w.BridgeWorker?.ProvidedInfo?.FunctionWorkerInfo?.SupportedFunctions;
      if (!funcs) return false;
      return Object.values(funcs).some((byName) => 'vet-kyverno' in byName);
    });
    if (match?.BridgeWorker?.BridgeWorkerID) {
      setValue('triggerBridgeWorkerId', match.BridgeWorker.BridgeWorkerID);
      hasAutoSelectedWorker.current = true;
    }
  }, [isEditMode, bridgeWorkersData, setValue]);

  const { data: allUnitsRaw = [] } = useListAllUnitsQuery({});
  const labelOptions = useMemo(
    () => extractLabelOptions(allUnitsRaw.map((u) => u.Unit)),
    [allUnitsRaw],
  );

  // ── Resource types (reuses sessionStorage cache from UnitListPage) ──────
  const [invokeGetResources] = useInvokeFunctionsOnOrgMutation();
  const [invokeTest, { isLoading: isTestRunning }] = useInvokeFunctionsOnOrgMutation();
  const [resourceTypes, setResourceTypes] = useState<string[]>(() => {
    try {
      const cached = sessionStorage.getItem('confighub:resourceTypes');
      return cached ? JSON.parse(cached) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    if (resourceTypes.length > 0) return;

    const fetchResourceTypes = async () => {
      const result = await invokeGetResources({
        functionInvocationsRequest: {
          FunctionInvocations: [
            {
              FunctionName: 'get-resources',
              Arguments: [{ ParameterName: 'body', Value: 'none' }],
            },
          ],
        },
      });

      if (result.error || !result.data) return;

      const allTypes = new Set<string>();
      for (const response of result.data) {
        const resourceList = convertToResourceList(
          cleanString(response?.Outputs?.['ResourceList'] || ''),
        ) as Resource[];
        for (const resource of resourceList) {
          if (resource.ResourceType) {
            allTypes.add(resource.ResourceType);
          }
        }
      }
      const sorted = [...allTypes].sort();
      setResourceTypes(sorted);
      try {
        sessionStorage.setItem('confighub:resourceTypes', JSON.stringify(sorted));
      } catch { /* sessionStorage full or unavailable */ }
    };

    fetchResourceTypes();
  }, [resourceTypes.length, invokeGetResources]);

  const [saveError, setSaveError] = useState<string | null>(null);
  const [testError, setTestError] = useState<string | null>(null);

  // ── QueryBuilder ──────────────────────────────────────────────────────────
  const { QueryBuilderElement, whereClause, whereDataClause, resourceTypeClause, setFilters } = useQueryBuilder({
    entityType: 'Unit',
    spaces: queryBuilderSpaces,
    targets: queryBuilderTargets,
    toolchainTypes: DEFAULT_TOOLCHAIN_TYPES,
    bridgeWorkers: queryBuilderBridgeWorkers,
    resourceTypes,
    labelOptions,
    syncToUrl: false,
  });

  // In edit mode, seed the QueryBuilder with the initiative's saved WHERE clause.
  // We wait until spaces are loaded (needed by the parser for space-ID lookup).
  const hasSeededFilters = useRef(false);
  useEffect(() => {
    if ((!initiative?.whereClause && !initiative?.whereDataClause && !initiative?.resourceTypeClause) || hasSeededFilters.current || queryBuilderSpaces.length === 0) return;
    const parsed = parseWhereClausesToFilters(initiative.whereClause, initiative.whereDataClause ?? '', '', queryBuilderSpaces);
    if (initiative.resourceTypeClause) {
      parsed.push({
        id: generateFilterId(),
        field: 'resourceType',
        operator: 'equals',
        value: initiative.resourceTypeClause,
      });
    }
    if (parsed.length > 0) {
      setFilters(parsed);
    }
    hasSeededFilters.current = true;
  }, [initiative?.whereClause, initiative?.whereDataClause, initiative?.resourceTypeClause, queryBuilderSpaces, setFilters]);

  // Propagate all clauses to parent whenever they change
  useEffect(() => {
    onWhereClauseChange(whereClause, whereDataClause, resourceTypeClause);
  }, [whereClause, whereDataClause, resourceTypeClause, onWhereClauseChange]);

  // Portal the QueryBuilder into the right pane's scope container
  const scopePortal = scopePortalTarget
    ? createPortal(QueryBuilderElement, scopePortalTarget)
    : null;

  // ── Test handler ────────────────────────────────────────────────────────
  const kyvernoPolicyValue = watch('kyvernoPolicy');
  const triggerBridgeWorkerIdValue = watch('triggerBridgeWorkerId');
  const canTest = Boolean(kyvernoPolicyValue && triggerBridgeWorkerIdValue);

  const handleTestPolicy = useCallback(async () => {
    if (!kyvernoPolicyValue || !triggerBridgeWorkerIdValue) return;
    setTestError(null);
    // Don't clear existing results preemptively — keep the previous Pass/Fail/N/A
    // cells visible until the new run returns so re-runs don't flash the column
    // back to empty. Matches the main (auto-run) view's behaviour.
    try {
      const responses = await invokeTest({
        where: whereClause || undefined,
        whereData: whereDataClause || undefined,
        resourceType: resourceTypeClause || undefined,
        dryRun: 'true',
        functionInvocationsRequest: {
          BridgeWorkerID: triggerBridgeWorkerIdValue,
          FunctionInvocations: [{ FunctionName: 'vet-kyverno', Arguments: [{ ParameterName: 'policy', Value: kyvernoPolicyValue }] }],
        },
      }).unwrap();
      onTestResults?.(toUnitCheckResults(responses));
    } catch (err) {
      setTestError(getApiErrorMessage(err as Parameters<typeof getApiErrorMessage>[0], 'Failed to run compliance check.'));
    }
  }, [kyvernoPolicyValue, triggerBridgeWorkerIdValue, whereClause, whereDataClause, resourceTypeClause, invokeTest, onTestResults]);

  // ── Save handler ──────────────────────────────────────────────────────────
  const onSubmit = async (values: InitiativeFormValues) => {
    setSaveError(null);
    try {
      if (isEditMode && initiative) {
        // ── Edit mode: patch existing Filter + View, update Trigger ────────
        if (initiative.filterId && initiative.spaceId) {
          await patchFilter({
            filterId: initiative.filterId,
            spaceId: initiative.spaceId,
            // @ts-expect-error RTK Query PATCH requires JSON string body
            body: JSON.stringify({
              DisplayName: values.name,
              Where: whereClause || undefined,
              WhereData: whereDataClause || undefined,
              ResourceType: resourceTypeClause || undefined,
            }),
          }).unwrap();
        }

        if (initiative.viewId && initiative.spaceId) {
          await patchView({
            viewId: initiative.viewId,
            spaceId: initiative.spaceId,
            body: {
              DisplayName: values.name,
              Labels: {
                'initiative-priority': values.priority,
              },
              Annotations: {
                'initiative-description': values.description ?? '',
                'initiative-deadline': values.deadline ?? null,
              },
            },
          }).unwrap();
        }

        // Update the compliance check trigger if it exists
        if (initiative.triggerId && initiative.spaceId) {
          await patchTrigger({
            spaceId: initiative.spaceId,
            triggerId: initiative.triggerId,
            // @ts-expect-error RTK Query PATCH requires JSON string body
            body: JSON.stringify({
              FunctionName: 'vet-kyverno',
              BridgeWorkerID: values.triggerBridgeWorkerId || null,
              Arguments: values.kyvernoPolicy
                ? [{ ParameterName: 'policy', Value: values.kyvernoPolicy }]
                : undefined,
              // Enforced initiatives produce blocking ValidationErrors (Warn=false);
              // non-enforced produce non-blocking ValidationWarnings (Warn=true).
              Warn: !values.enforced,
              // Keep the initiative label so useInitiatives can narrow its trigger
              // list query. Also backfills the label on pre-label triggers.
              Labels: { initiative: 'true' },
            }),
          }).unwrap();
        }

      } else {
        // ── Create mode: create new Filter + View + optional Trigger ────────
        const storageSpaceId = queryBuilderSpaces[0]?.id;
        if (!storageSpaceId) return;

        const slug = generateSlug(values.name);

        const filterData = await createFilter({
          spaceId: storageSpaceId,
          filter: {
            From: 'Unit',
            Slug: slug,
            DisplayName: values.name,
            Where: whereClause || undefined,
            WhereData: whereDataClause || undefined,
            ResourceType: resourceTypeClause || undefined,
          },
        }).unwrap();

        const filterId = filterData?.FilterID;
        if (!filterId) return;

        const viewData = await createView({
          spaceId: storageSpaceId,
          view: {
            FilterID: filterId,
            Slug: slug,
            DisplayName: values.name,
            Labels: {
              initiative: 'true',
              'initiative-priority': values.priority,
              'initiative-status': 'draft',
            },
            Annotations: {
              'initiative-description': values.description ?? '',
              'initiative-deadline': values.deadline ?? '',
              'initiative-trigger-id': '',
            },
          },
        }).unwrap();

        // Create the compliance check trigger if a policy was supplied.
        // Disabled: false so it runs on every apply. Warn follows the "enforced"
        // toggle: non-enforced → Warn=true (non-blocking ValidationWarnings);
        // enforced → Warn=false (blocking ValidationErrors).
        let triggerId: string | undefined;
        if (values.kyvernoPolicy) {
          const triggerData = await createTrigger({
            spaceId: storageSpaceId,
            trigger: {
              Slug: `${slug}-check`,
              Event: 'Mutation',
              ToolchainType: 'Kubernetes/YAML',
              FunctionName: 'vet-kyverno',
              BridgeWorkerID: values.triggerBridgeWorkerId || undefined,
              Arguments: [{ ParameterName: 'policy', Value: values.kyvernoPolicy }],
              Disabled: false,
              Warn: !values.enforced,
              // Tag so useInitiatives can narrow its trigger list query
              // (mirrors the Labels.initiative='true' filter used for Views).
              Labels: { initiative: 'true' },
            },
          }).unwrap();
          triggerId = triggerData?.TriggerID;
        }

        // Patch the View to store the trigger id now that we know it
        if (triggerId && viewData?.ViewID) {
          await patchView({
            viewId: viewData.ViewID,
            spaceId: storageSpaceId,
            body: {
              Annotations: {
                'initiative-trigger-id': triggerId,
              },
            },
          }).unwrap();
        }
      }

      await refetchInitiatives();
      navigate('/x/initiatives');
    } catch (err) {
      setSaveError(getApiErrorMessage(err as Parameters<typeof getApiErrorMessage>[0], 'Failed to save initiative. Please try again.'));
    }
  };

  return (
    <>
    {scopePortal}
    <Box
      sx={{
        height: '100%',
        overflowY: 'auto',
      }}
    >
      <Box sx={{ p: 3, display: 'flex', flexDirection: 'column', gap: 3 }}>
        {/* Initiative name */}
        <TextField
          label='Initiative name'
          size='small'
          fullWidth
          required
          autoFocus
          {...register('name', { required: 'Name is required' })}
          error={!!errors.name}
          helperText={errors.name?.message}
        />

        {/* Description */}
        <TextField
          label='Description'
          size='small'
          fullWidth
          multiline
          rows={3}
          {...register('description', {
            maxLength: {
              value: ANNOTATION_VALUE_MAX_LENGTH,
              message: `Description must be ${ANNOTATION_VALUE_MAX_LENGTH} characters or less`,
            },
          })}
          error={!!errors.description}
          helperText={errors.description?.message}
          inputProps={{ maxLength: ANNOTATION_VALUE_MAX_LENGTH }}
        />

        {/* Priority */}
        <FormControl>
          <Typography variant='caption' color='text.secondary' sx={{ mb: 0.75, fontWeight: 500 }}>
            Priority
          </Typography>
          <Controller
            name='priority'
            control={control}
            render={({ field }) => (
              <ToggleButtonGroup
                exclusive
                size='small'
                value={field.value}
                onChange={(_, val: InitiativePriority | null) => {
                  if (val) field.onChange(val);
                }}
                sx={{ width: '100%' }}
              >
                {PRIORITIES.map((p) => (
                  <ToggleButton
                    key={p}
                    value={p}
                    sx={{
                      flex: 1,
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      letterSpacing: 0.5,
                    }}
                  >
                    {p}
                  </ToggleButton>
                ))}
              </ToggleButtonGroup>
            )}
          />
        </FormControl>

        {/* Deadline */}
        <TextField
          label='Deadline'
          size='small'
          type='date'
          fullWidth
          InputLabelProps={{ shrink: true }}
          {...register('deadline')}
          helperText='Optional target completion date'
        />

        {/* Enforcement mode */}
        <FormControl>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.75 }}>
            <Typography variant='caption' color='text.secondary' sx={{ fontWeight: 500 }}>
              Enforcement
            </Typography>
            <Tooltip
              title="Apply pushes a unit's config to its target (e.g. a Kubernetes cluster). Enforced blocks failing units from being Applied; non-enforced lets them through and just records a warning."
              placement='top'
            >
              <InfoOutlinedIcon sx={{ fontSize: 14, color: 'text.secondary' }} />
            </Tooltip>
          </Box>
          <Controller
            name='enforced'
            control={control}
            render={({ field }) => (
              <ToggleButtonGroup
                exclusive
                size='small'
                value={field.value ? 'enforced' : 'non-enforced'}
                onChange={(_, val: 'enforced' | 'non-enforced' | null) => {
                  if (val) field.onChange(val === 'enforced');
                }}
                sx={{ width: '100%' }}
              >
                <ToggleButton
                  value='non-enforced'
                  sx={{ flex: 1, fontSize: '0.75rem', fontWeight: 600, letterSpacing: 0.5 }}
                >
                  NON-ENFORCED
                </ToggleButton>
                <ToggleButton
                  value='enforced'
                  sx={{ flex: 1, fontSize: '0.75rem', fontWeight: 600, letterSpacing: 0.5 }}
                >
                  ENFORCED
                </ToggleButton>
              </ToggleButtonGroup>
            )}
          />
        </FormControl>

        <Divider />

        {/* Compliance check section */}
        <Box>
          <Typography variant='subtitle2' fontWeight={600} sx={{ mb: 0.5 }}>
            Compliance check
          </Typography>
          <Typography variant='body2' color='text.secondary' sx={{ mb: 2 }}>
            Validate units in scope against Kyverno policies. A trigger will be created and can be
            run on demand from the dashboard.
          </Typography>

          {/* Bridge worker */}
          <FormControl fullWidth size='small' sx={{ mb: 2 }}>
            <InputLabel>Bridge worker</InputLabel>
            <Controller
              name='triggerBridgeWorkerId'
              control={control}
              render={({ field }) => (
                <Select {...field} label='Bridge worker'>
                  <MenuItem value=''>
                    <em>None (built-in)</em>
                  </MenuItem>
                  {queryBuilderBridgeWorkers.map((w) => (
                    <MenuItem key={w.id} value={w.id}>
                      {w.name}
                    </MenuItem>
                  ))}
                </Select>
              )}
            />
            <FormHelperText>
              Select a worker with the <code>vet-kyverno</code> function registered
            </FormHelperText>
          </FormControl>

          {/* Kyverno policy YAML */}
          <Box>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.5 }}>
              <Typography variant='body2' fontWeight={600}>
                Kyverno policy YAML
              </Typography>
              <Button
                variant='outlined'
                size='small'
                disabled={!canTest || isTestRunning}
                onClick={handleTestPolicy}
                startIcon={isTestRunning ? <CircularProgress size={14} color='inherit' /> : <PlayArrowIcon />}
                sx={{ textTransform: 'none', fontSize: '0.75rem' }}
              >
                {isTestRunning ? 'Testing…' : 'Test'}
              </Button>
            </Box>
            {testError && (
              <Alert severity='error' onClose={() => setTestError(null)} sx={{ mt: 1, mb: 1, fontSize: '0.8rem' }}>
                {testError}
              </Alert>
            )}
            <Controller
              name='kyvernoPolicy'
              control={control}
              render={({ field }) => (
                <ResizableEditorContainer
                  value={field.value}
                  onChange={field.onChange}
                />
              )}
            />
            <FormHelperText>
              Paste a ClusterPolicy or ValidatingPolicy YAML from kyverno.io/policies
            </FormHelperText>
          </Box>
        </Box>

        {/* Footer */}
        <Box
          sx={{
            pt: 2,
            borderTop: '1px solid',
            borderColor: 'divider',
          }}
        >
          <ErrorBox error={saveError} onClose={() => setSaveError(null)} sx={{ mb: 2 }} />
          <FormHelperText sx={{ mb: 1 }}>
            Scope and metadata will be saved as a View in ConfigHub.
          </FormHelperText>
          <Button
            variant='contained'
            fullWidth
            disabled={isSaving}
            onClick={handleSubmit(onSubmit)}
            startIcon={isSaving ? <CircularProgress size={16} color='inherit' /> : <SaveIcon />}
          >
            {isSaving ? 'Saving…' : isEditMode ? 'Update Initiative' : 'Save Initiative'}
          </Button>
        </Box>
      </Box>
    </Box>
    </>
  );
};
