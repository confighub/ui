// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';

import { ErrorBox } from '@/components/error-box/ErrorBox';
import {
  useListResourcesBySpaceChunkedQuery,
  useListUnitsByIdChunkedQuery,
} from '@/hooks/chunkedQueriesApi';
import { useAppDispatch, useAppSelector } from '@/hooks/useApp';
import { validatingTriggerRequest } from '@/hooks/useGateTriggers';
import { plural } from '@/pages/change-orders/changeOrderHistory';
import { SpaceNameList } from '@/pages/change-orders/components/SpaceListing';
import {
  recheckCompleted,
  selectInitiativeInvocation,
} from '@/state/slices/initiativeInvocation';
import { requestInvokerOpen } from '@/state/slices/invokerRequest';
import {
  selectSelectedUnits,
  setSelectedUnits as setGlobalSelectedUnits,
  setInvocationInitiativeId,
} from '@/state/slices/selectedUnits';
import { FILTER_URL_PARAMS } from '@/utility/constants/url-params';
import { getApiErrorMessage } from '@/utility/error-functions';
import {
  ENFORCED_AT_ANNOTATION,
  ENFORCED_BY_ANNOTATION,
  ENFORCEMENT_STAGE_INFO,
  PRIORITY_ANNOTATION,
  TRIGGER_PRIORITIES,
  type TriggerPriority,
  enforcementDate,
  toEnforcementTime,
} from '@/utility/triggerEnforcement';
import {
  type ComponentRead,
  type ExtendedUnitRead,
  type TriggerRead,
  type ValidationResultList,
  useInvokeFunctionsOnOrgMutation,
  useLazyListAllResourcesQuery,
  usePatchTriggerMutation,
} from '@confighub/rtk-query';
import CloseIcon from '@mui/icons-material/Close';
import EditIcon from '@mui/icons-material/Edit';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';
import IconButton from '@mui/material/IconButton';
import Link from '@mui/material/Link';
import MenuItem from '@mui/material/MenuItem';
import Paper from '@mui/material/Paper';
import TextField from '@mui/material/TextField';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import dayjs from 'dayjs';

import { spaceLink, targetLink } from '../validationLinks';
import {
  type OutcomeCounts,
  type PolicyUnit,
  type ScopeSpace,
  type ScopeTarget,
  type ValidationPolicy,
  annotationKeyOfPath,
  emptyCounts,
  exceptionAnnotationPath,
  failedResources,
  failingOf,
  groupCounts,
  isOverdue,
} from '../validationModel';
import { ExceptionDialog, type ExceptionDialogRequest } from './ExceptionDialog';
import { PolicyExceptions } from './PolicyExceptions';
import { PolicyUnitsTable, type UnitFilter } from './PolicyUnitsTable';

// Units per request when evaluating, so a long list makes several requests rather than one too long.
const EVALUATE_CHUNK = 100;

const quoted = (value: string) => `'${value.replace(/'/g, "''")}'`;

interface PolicyDetailProps {
  policy: ValidationPolicy;
  spaceById: Map<string, ScopeSpace>;
  targetById: Map<string, ScopeTarget>;
  componentById: Map<string, ComponentRead>;
  onEdit: (trigger: TriggerRead) => void;
  onClose: () => void;
  /** Reads the Units again, for after a change re-evaluates them. */
  onRefresh: () => void;
}

/**
 * One validating Trigger on the Validation page: how far its enforcement has come, what it applies to,
 * how that fared, and the quick changes that move it along -- its priority, the date it is due to
 * be enforced, and enforcing it. Everything else about the Trigger is changed in its drawer.
 */
export const PolicyDetail = ({
  policy,
  spaceById,
  targetById,
  componentById,
  onEdit,
  onClose,
  onRefresh,
}: PolicyDetailProps) => {
  const { trigger } = policy;
  const [patchTrigger, { isLoading: isPatching }] = usePatchTriggerMutation();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmWarn, setConfirmWarn] = useState<boolean | null>(null);
  const [isChangingMode, setIsChangingMode] = useState(false);
  const failing = failingOf(policy.unitCounts);
  const [unitFilter, setUnitFilter] = useState<UnitFilter>(failing > 0 ? 'Failing' : 'All');
  const [enforcedByDraft, setEnforcedByDraft] = useState(enforcementDate(policy.enforcedBy));
  useEffect(() => setEnforcedByDraft(enforcementDate(policy.enforcedBy)), [policy.enforcedBy]);
  const dispatch = useAppDispatch();
  const [invokeFunctions] = useInvokeFunctionsOnOrgMutation();
  const [loadResources] = useLazyListAllResourcesQuery();
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [exceptionRequest, setExceptionRequest] = useState<ExceptionDialogRequest | null>(
    null,
  );

  // The Units checked here are the function invoker's selection, so a fix can be run on them from
  // the invoker; and while some are, the invoker makes each run in a ChangeSet of its own, labeled
  // with this Trigger, so the changes made for it can be found together.
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const selectedUnits = useMemo(
    () => policy.units.filter((u) => selectedSet.has(u.unit.id)),
    [policy.units, selectedSet],
  );
  useEffect(() => {
    dispatch(
      setGlobalSelectedUnits({
        units: selectedUnits.map(
          (u): ExtendedUnitRead =>
            ({
              Unit: {
                UnitID: u.unit.id,
                Slug: u.unit.slug,
                SpaceID: u.unit.spaceId,
                TargetID: u.unit.targetId,
                ToolchainType: u.unit.toolchainType ?? '',
              },
              Space: {
                SpaceID: u.unit.spaceId,
                Slug: spaceById.get(u.unit.spaceId)?.slug ?? '',
              },
            }) as ExtendedUnitRead,
        ),
      }),
    );
    dispatch(setInvocationInitiativeId(selectedUnits.length > 0 ? policy.id : undefined));
  }, [selectedUnits, policy.id, spaceById, dispatch]);
  useEffect(
    () => () => {
      dispatch(setGlobalSelectedUnits({ units: [] }));
      dispatch(setInvocationInitiativeId(undefined));
    },
    [dispatch],
  );
  // A Unit taken out in the invoker is taken out here too.
  const invokerUnits = useAppSelector(selectSelectedUnits);
  useEffect(() => {
    const ids = (invokerUnits ?? []).flatMap((u) => (u.Unit?.UnitID ? [u.Unit.UnitID] : []));
    if (ids.length < selectedIds.length && ids.every((id) => selectedSet.has(id)))
      setSelectedIds(ids);
    // Only the invoker's list decides; selectedIds changing on its own is the page's.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invokerUnits]);
  // A run from the invoker re-evaluates the Units it changed; read them again once it has.
  const { completionSeq, initiativeId: completedFor } = useAppSelector(
    selectInitiativeInvocation,
  );
  const seenCompletion = useRef(completionSeq);
  useEffect(() => {
    if (completionSeq === seenCompletion.current) return;
    seenCompletion.current = completionSeq;
    dispatch(recheckCompleted());
    if (completedFor === policy.id) setTimeout(onRefresh, 3000);
  }, [completionSeq, completedFor, policy.id, onRefresh, dispatch]);

  /**
   * Runs the Trigger on Units and records what it finds, so a Unit it has no verdict on gets one.
   * This is what a Unit's Triggers do when it changes, run for this Trigger alone.
   */
  const evaluate = async (units: PolicyUnit[], failedPrefix = 'Not evaluated') => {
    setIsEvaluating(true);
    setError(null);
    setNotice(null);
    const failed: string[] = [];
    try {
      for (let i = 0; i < units.length; i += EVALUATE_CHUNK) {
        const chunk = units.slice(i, i + EVALUATE_CHUNK);
        try {
          const responses = await invokeFunctions({
            where: `UnitID IN (${chunk.map((u) => `'${u.unit.id}'`).join(', ')})`,
            functionInvocationsRequest: validatingTriggerRequest(
              trigger.ToolchainType,
              policy.id,
              {
                updateValidationResults: true,
              },
            ),
          }).unwrap();
          for (const r of responses) {
            if (!r.Success && r.Error)
              failed.push(`${r.SpaceSlug}/${r.UnitSlug}: ${r.Error.Message}`);
          }
        } catch (err) {
          failed.push(getApiErrorMessage(err, 'The Trigger did not run.'));
        }
      }
      if (failed.length > 0) {
        setError(
          `${failedPrefix}: ${failed.slice(0, 3).join('; ')}${failed.length > 3 ? ` and ${failed.length - 3} more` : ''}`,
        );
      } else {
        setNotice(`Evaluated ${plural(units.length, 'Unit')}.`);
      }
      onRefresh();
    } finally {
      setIsEvaluating(false);
    }
  };

  const exceptionPath = exceptionAnnotationPath(trigger.WhereResource);
  const exceptionKey = exceptionPath ? annotationKeyOfPath(exceptionPath) : undefined;
  const openAddException = async (u: PolicyUnit) => {
    setError(null);
    try {
      const resources = await loadResources({
        where: `UnitID = '${u.unit.id}'`,
        select: 'ResourceID,ResourceType,ResourceName',
      }).unwrap();
      const failingNames = new Set(
        failedResources(resultsByUnit.get(u.unit.id)).map((r) => r.name),
      );
      const listed = resources
        .flatMap((er) =>
          er.Resource?.ResourceType && er.Resource.ResourceName
            ? [{ type: er.Resource.ResourceType, name: er.Resource.ResourceName }]
            : [],
        )
        .sort((a, b) => Number(failingNames.has(b.name)) - Number(failingNames.has(a.name)));
      setExceptionRequest({
        mode: 'add',
        unit: {
          unitId: u.unit.id,
          slug: u.unit.slug,
          spaceId: u.unit.spaceId,
          spaceSlug: spaceById.get(u.unit.spaceId)?.slug ?? '',
          toolchainType: u.unit.toolchainType ?? trigger.ToolchainType ?? 'Kubernetes/YAML',
        },
        resources: listed,
      });
    } catch (err) {
      setError(getApiErrorMessage(err, 'Could not read the Unit’s resources.'));
    }
  };

  // The failing Units' results, for the resources they failed on.
  const failingUnits = useMemo(
    () => policy.units.filter((u) => u.outcome === 'Error' || u.outcome === 'Warning'),
    [policy.units],
  );
  // As many requests as the IDs need, since a Trigger in audit across a fleet can fail on more
  // Units than one filter can name.
  const failingIds = useMemo(() => failingUnits.map((u) => u.unit.id), [failingUnits]);
  const { currentData: failingData, isError: failingError } = useListUnitsByIdChunkedQuery(
    { unitIds: failingIds, select: 'UnitID,ValidationResults' },
    { skip: failingIds.length === 0 },
  );
  const resultsByUnit = useMemo(() => {
    const gatesOf = new Map(failingUnits.map((u) => [u.unit.id, u.gates]));
    const out = new Map<string, ValidationResultList>();
    for (const eu of failingData ?? []) {
      const id = eu.Unit?.UnitID;
      if (!id) continue;
      out.set(
        id,
        (gatesOf.get(id) ?? []).flatMap((g) => eu.Unit?.ValidationResults?.[g] ?? []),
      );
    }
    return out;
  }, [failingData, failingUnits]);

  // Every resource of the Units in scope, to count resources by outcome.
  const scopeSpaceIds = useMemo(
    () => [...new Set(policy.units.map((u) => u.unit.spaceId))].sort(),
    [policy.units],
  );
  const { currentData: resourcesData, isError: resourcesError } =
    useListResourcesBySpaceChunkedQuery(
      { spaceIds: scopeSpaceIds, select: 'ResourceID,UnitID,ResourceType,ResourceName' },
      { skip: scopeSpaceIds.length === 0 },
    );
  // Counted only once the failing Units' results are in too: until then which of their
  // resources failed is not known, and a guess would read as an answer.
  const resultsLoaded = failingIds.length === 0 || !!failingData;
  const resourceCounts = useMemo((): OutcomeCounts | undefined => {
    if (scopeSpaceIds.length === 0) return emptyCounts();
    if (!resourcesData || !resultsLoaded) return undefined;
    const outcomeOf = new Map(policy.units.map((u) => [u.unit.id, u.outcome]));
    const counts: OutcomeCounts = {
      total: 0,
      passed: 0,
      warning: 0,
      error: 0,
      notEvaluated: 0,
    };
    const failedNames = new Map<string, Set<string>>();
    for (const [unitId, results] of resultsByUnit) {
      failedNames.set(unitId, new Set(failedResources(results).map((r) => r.name)));
    }
    for (const er of resourcesData) {
      const r = er.Resource;
      const outcome = r?.UnitID ? outcomeOf.get(r.UnitID) : undefined;
      if (!r || !outcome) continue;
      counts.total++;
      if (outcome === 'NotEvaluated') {
        counts.notEvaluated++;
      } else if (outcome === 'Passed') {
        counts.passed++;
      } else {
        // A failing Unit's resource fails if its results name it, or if they name none at all,
        // as a check of the Unit as a whole does.
        const names = failedNames.get(r.UnitID ?? '');
        const failed = !names || names.size === 0 || names.has(r.ResourceName ?? '');
        if (!failed) counts.passed++;
        else if (outcome === 'Error') counts.error++;
        else counts.warning++;
      }
    }
    return counts;
  }, [scopeSpaceIds, resourcesData, resultsLoaded, resultsByUnit, policy.units]);

  const spaceCounts = useMemo(
    () => groupCounts(policy.units, (u) => u.unit.spaceId),
    [policy.units],
  );
  const componentCounts = useMemo(
    () => groupCounts(policy.units, (u) => spaceById.get(u.unit.spaceId)?.componentId),
    [policy.units, spaceById],
  );

  // The failing Units in the Units list, one link per gate name and kind, which is usually one.
  const unitListLinks = useMemo(() => {
    const links = new Map<string, string>();
    for (const u of failingUnits) {
      for (const g of u.gates) {
        const field = u.unit.validationErrors?.[g]
          ? 'ValidationErrors'
          : u.unit.validationWarnings?.[g]
            ? 'ValidationWarnings'
            : undefined;
        if (field) links.set(`${field} ? ${quoted(g)}`, field);
      }
    }
    return [...links.entries()].map(([where, field]) => ({
      field,
      href: `/units?${FILTER_URL_PARAMS.WHERE}=${encodeURIComponent(where)}`,
    }));
  }, [failingUnits]);

  const patch = async (body: Parameters<typeof patchTrigger>[0]['body']) => {
    setError(null);
    setNotice(null);
    try {
      await patchTrigger({
        spaceId: trigger.SpaceID ?? '',
        triggerId: policy.id,
        body,
      }).unwrap();
      return true;
    } catch (err) {
      setError(getApiErrorMessage(err, 'Could not update the Trigger.'));
      return false;
    }
  };

  const setPriority = (priority: TriggerPriority) =>
    void patch({
      Annotations: { [PRIORITY_ANNOTATION]: priority === 'Unspecified' ? null : priority },
    });

  const commitEnforcedBy = () => {
    // The field holds a date; a time of day set elsewhere stays while the date does.
    if (enforcedByDraft === enforcementDate(policy.enforcedBy)) return;
    const next = toEnforcementTime(enforcedByDraft);
    void patch({ Annotations: { [ENFORCED_BY_ANNOTATION]: next || null } });
  };

  /**
   * Enforces the Trigger, or returns it to audit, and runs it again on the Units it fails, so that
   * each failure moves between the Unit's warnings and the gates that block its release. A Unit it
   * passes has neither, so nothing about it changes. Without the run, the failing Units would keep
   * their old verdicts until each of them next changed, since a change to a Trigger re-evaluates
   * only the Units of its own Space.
   */
  const changeMode = async (warn: boolean) => {
    setIsChangingMode(true);
    try {
      const ok = await patch({
        Warn: warn,
        Annotations: {
          [ENFORCED_AT_ANNOTATION]: warn ? null : toEnforcementTime(new Date().toISOString()),
        },
      });
      if (!ok) return;
      // The Trigger has changed by now, so a failure here is only that some Units keep their
      // old verdicts.
      if (failingUnits.length > 0)
        await evaluate(
          failingUnits,
          'The Trigger changed, but it did not run again on these Units',
        );
    } finally {
      setIsChangingMode(false);
      setConfirmWarn(null);
    }
  };

  const stageInfo = ENFORCEMENT_STAGE_INFO[policy.stage];
  const overdue = isOverdue(policy);
  const narrowed = !!trigger.WhereUnit || !!trigger.UnitFilterID;

  return (
    <Box
      data-testid='validation-detail'
      sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}
    >
      <Paper variant='outlined' sx={{ p: 2.5, borderRadius: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5 }}>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
              <Typography variant='h5' fontWeight={600} sx={{ overflowWrap: 'anywhere' }}>
                {policy.name}
              </Typography>
              <Tooltip title={stageInfo.description}>
                <Chip
                  size='small'
                  label={stageInfo.label}
                  data-testid='validation-stage'
                  sx={{
                    fontWeight: 600,
                    bgcolor: 'grey.100',
                    '& .MuiChip-label': { display: 'flex', alignItems: 'center', gap: 0.75 },
                  }}
                  icon={
                    <Box
                      component='span'
                      sx={{
                        width: 8,
                        height: 8,
                        borderRadius: '50%',
                        bgcolor: stageInfo.dotColor,
                        ml: '8px !important',
                      }}
                    />
                  }
                />
              </Tooltip>
            </Box>
            <Typography
              variant='body2'
              fontSize='0.75rem'
              color='text.secondary'
              sx={{ fontFamily: 'monospace' }}
            >
              <Link
                component={RouterLink}
                to={spaceLink(trigger.SpaceID ?? '')}
                underline='hover'
              >
                {policy.spaceSlug}
              </Link>
              /{trigger.Slug} · {trigger.FunctionName || 'Invocation'} ·{' '}
              {trigger.ToolchainType}
            </Typography>
            {trigger.Description && (
              <Typography
                variant='body2'
                color='text.secondary'
                sx={{ mt: 1, whiteSpace: 'pre-line' }}
              >
                {trigger.Description}
              </Typography>
            )}
          </Box>
          <Button
            size='small'
            variant='outlined'
            startIcon={<EditIcon />}
            onClick={() => onEdit(trigger)}
          >
            Edit Trigger
          </Button>
          <Tooltip title='Close (Esc)'>
            <IconButton size='small' onClick={onClose} aria-label='Close'>
              <CloseIcon fontSize='small' />
            </IconButton>
          </Tooltip>
        </Box>

        <Box
          sx={{ display: 'flex', alignItems: 'flex-start', gap: 2, mt: 2, flexWrap: 'wrap' }}
        >
          <TextField
            select
            size='small'
            label='Priority'
            value={policy.priority}
            onChange={(e) => setPriority(e.target.value as TriggerPriority)}
            disabled={isPatching}
            sx={{ minWidth: 150 }}
            data-testid='validation-priority'
          >
            {TRIGGER_PRIORITIES.map((p) => (
              <MenuItem key={p} value={p}>
                {p}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            type='date'
            size='small'
            label='Enforce by'
            value={enforcedByDraft}
            onChange={(e) => setEnforcedByDraft(e.target.value)}
            onBlur={commitEnforcedBy}
            onKeyDown={(e) => e.key === 'Enter' && commitEnforcedBy()}
            disabled={isPatching}
            error={overdue}
            helperText={overdue ? 'Overdue' : undefined}
            slotProps={{ inputLabel: { shrink: true } }}
            sx={{ minWidth: 170 }}
            data-testid='validation-enforced-by'
          />
          <Box>
            <ToggleButtonGroup
              size='small'
              exclusive
              color='primary'
              value={trigger.Warn ? 'audit' : 'enforce'}
              disabled={isPatching || isChangingMode || !!trigger.Disabled}
              onChange={(_, v: 'audit' | 'enforce' | null) =>
                v && setConfirmWarn(v === 'audit')
              }
              aria-label='Validation mode'
              sx={{ '& .MuiToggleButton-root': { textTransform: 'none', px: 1.5 } }}
            >
              <ToggleButton value='audit' data-testid='validation-mode-audit'>
                Audit (warn)
              </ToggleButton>
              <ToggleButton value='enforce' data-testid='validation-mode-enforce'>
                Enforce (block)
              </ToggleButton>
            </ToggleButtonGroup>
            {!trigger.Warn && policy.enforcedAt && (
              <Typography
                variant='body2'
                fontSize='0.75rem'
                color='text.secondary'
                sx={{ display: 'block', mt: 0.5 }}
              >
                Enforced {dayjs(policy.enforcedAt).format('MMM D, YYYY')}
              </Typography>
            )}
          </Box>
          {(isPatching || isChangingMode) && <CircularProgress size={20} sx={{ mt: 1 }} />}
        </Box>

        <ErrorBox error={error} onClose={() => setError(null)} sx={{ mt: 2 }} />
        {notice && (
          <Alert severity='info' onClose={() => setNotice(null)} sx={{ mt: 2 }}>
            {notice}
          </Alert>
        )}
        {policy.stage === 'Created' && (
          <Alert severity='info' sx={{ mt: 2 }}>
            No Space or Target selects this Trigger, so it checks nothing yet. A Space or
            Target selects Triggers by its WhereTrigger; the Trigger runs on its Units once its
            Triggers are refreshed.
          </Alert>
        )}
        {policy.stage === 'Disabled' && (
          <Alert severity='info' sx={{ mt: 2 }}>
            The Trigger is disabled, so it checks nothing; the results below are from before.
            Enable it in Edit Trigger.
          </Alert>
        )}
        {narrowed && (
          <Alert severity='info' sx={{ mt: 2 }}>
            The Trigger applies only to the Units{' '}
            {trigger.WhereUnit ? <code>{trigger.WhereUnit}</code> : 'its Unit Filter'} selects,
            so the Units in its Spaces it does not apply to are counted as not evaluated.
          </Alert>
        )}
      </Paper>

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: 1.5,
        }}
      >
        <StatTile title='Units' counts={policy.unitCounts} />
        <StatTile title='Components' counts={componentCounts} />
        <StatTile title='Spaces' counts={spaceCounts} />
        <StatTile
          title='Resources'
          counts={resourceCounts}
          loading={!resourcesError && !failingError}
        />
      </Box>

      <Paper variant='outlined' sx={{ p: 2, borderRadius: 2 }}>
        <Typography variant='subtitle2' fontWeight={600} sx={{ mb: 1 }}>
          Scope
        </Typography>
        {policy.spaces.length + policy.targets.length === 0 ? (
          <Typography variant='body2' color='text.secondary'>
            Not selected by any Space or Target.
          </Typography>
        ) : (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
            {policy.spaces.length > 0 && (
              <Typography variant='body2' component='div'>
                Selected by {plural(policy.spaces.length, 'Space')}:{' '}
                <SpaceNameList
                  spaces={policy.spaces.map((s) => ({
                    spaceId: s.id,
                    name: s.slug,
                    labels: s.labels,
                  }))}
                />
              </Typography>
            )}
            {policy.targets.length > 0 && (
              <Typography variant='body2' component='div'>
                Selected by {plural(policy.targets.length, 'Target')}:{' '}
                <SpaceNameList
                  noun='Target'
                  spaces={policy.targets.map((t) => ({
                    spaceId: t.id,
                    name: [spaceById.get(t.spaceId)?.slug, t.slug].filter(Boolean).join('/'),
                    href: targetLink(t.id),
                  }))}
                />
              </Typography>
            )}
          </Box>
        )}
      </Paper>

      {exceptionPath && (
        <Paper variant='outlined' sx={{ p: 2, borderRadius: 2 }}>
          <Typography variant='subtitle2' fontWeight={600} sx={{ mb: 1 }}>
            Exceptions
          </Typography>
          <PolicyExceptions
            annotationPath={exceptionPath}
            onRemove={(e) =>
              setExceptionRequest({
                mode: 'remove',
                unit: {
                  unitId: e.unitId,
                  slug: e.unitSlug,
                  spaceId: e.spaceId,
                  spaceSlug: e.spaceSlug,
                  toolchainType: e.toolchainType,
                },
                resource: { type: e.type, name: e.name },
                onlyAnnotation: e.onlyAnnotation,
              })
            }
          />
        </Paper>
      )}

      <Box>
        <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 2, mb: 1, flexWrap: 'wrap' }}>
          <Typography variant='subtitle2' fontWeight={600}>
            Units
          </Typography>
          {unitListLinks.map((l) => (
            <Link
              key={l.href}
              component={RouterLink}
              to={l.href}
              variant='body2'
              underline='hover'
            >
              Open the Units with {l.field} from it in the Units list
            </Link>
          ))}
        </Box>
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            mb: 1,
            minHeight: 32,
            flexWrap: 'wrap',
          }}
          data-testid='validation-selection-bar'
        >
          {selectedIds.length > 0 ? (
            <>
              <Typography variant='body2' fontWeight={600}>
                {plural(selectedIds.length, 'Unit')} selected
              </Typography>
              <Tooltip title='Opens the function invoker on the selected Units. Each run is made in a ChangeSet of its own, labeled with this Trigger.'>
                <Button
                  size='small'
                  variant='outlined'
                  onClick={() => dispatch(requestInvokerOpen())}
                >
                  Run a function…
                </Button>
              </Tooltip>
              {!trigger.Disabled && (
                <Tooltip title='Runs this Trigger on the selected Units and records what it finds.'>
                  <span>
                    <Button
                      size='small'
                      variant='outlined'
                      disabled={isEvaluating}
                      onClick={() => void evaluate(selectedUnits)}
                    >
                      Evaluate
                    </Button>
                  </span>
                </Tooltip>
              )}
              <Button size='small' onClick={() => setSelectedIds([])}>
                Clear
              </Button>
            </>
          ) : (
            policy.unitCounts.notEvaluated > 0 &&
            !trigger.Disabled && (
              <Tooltip title='Runs this Trigger on the Units it has no verdict on, and records what it finds.'>
                <span>
                  <Button
                    size='small'
                    variant='outlined'
                    disabled={isEvaluating}
                    onClick={() =>
                      void evaluate(policy.units.filter((u) => u.outcome === 'NotEvaluated'))
                    }
                    data-testid='validation-evaluate-all'
                  >
                    Evaluate the {plural(policy.unitCounts.notEvaluated, 'Unit')} not evaluated
                  </Button>
                </span>
              </Tooltip>
            )
          )}
          {isEvaluating && <CircularProgress size={16} />}
        </Box>
        <PolicyUnitsTable
          policy={policy}
          spaceById={spaceById}
          targetById={targetById}
          componentById={componentById}
          resultsByUnit={resultsByUnit}
          resultsUnavailable={failingError}
          filter={unitFilter}
          onFilterChange={setUnitFilter}
          selectedIds={selectedSet}
          onSelectionChange={setSelectedIds}
          onExcept={exceptionKey ? (u) => void openAddException(u) : undefined}
        />
      </Box>

      {exceptionKey && (
        <ExceptionDialog
          request={exceptionRequest}
          triggerName={policy.name}
          annotationKey={exceptionKey}
          onClose={() => setExceptionRequest(null)}
          onDone={(message) => {
            setNotice(
              `${message} The Unit is evaluated again as it changes; Refresh to read the result.`,
            );
            setTimeout(onRefresh, 3000);
          }}
        />
      )}

      <Dialog
        open={confirmWarn !== null}
        onClose={() => !isChangingMode && setConfirmWarn(null)}
      >
        <DialogTitle>{confirmWarn ? 'Return to audit?' : 'Enforce this Trigger?'}</DialogTitle>
        <DialogContent>
          <DialogContentText component='div'>
            {confirmWarn ? (
              <>
                Configuration that fails <strong>{policy.name}</strong> will get
                ValidationWarnings rather than ValidationErrors, and will no longer be blocked
                from release.
              </>
            ) : (
              <>
                Configuration that fails <strong>{policy.name}</strong> will get
                ValidationErrors, which block its release.{' '}
                {policy.unitCounts.warning > 0 ? (
                  <strong>
                    {plural(policy.unitCounts.warning, 'Unit')} now warned by it will be
                    blocked.
                  </strong>
                ) : (
                  'No Unit is warned by it now.'
                )}
              </>
            )}
            {failingUnits.length > 0 && (
              <Box sx={{ mt: 1.5 }}>
                The Trigger runs again on the {plural(failingUnits.length, 'Unit')} it fails.
              </Box>
            )}
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmWarn(null)} disabled={isChangingMode}>
            Cancel
          </Button>
          <Button
            variant='contained'
            color={confirmWarn ? 'primary' : 'warning'}
            onClick={() => confirmWarn !== null && void changeMode(confirmWarn)}
            disabled={isChangingMode}
            data-testid='validation-mode-confirm'
          >
            {confirmWarn ? 'Return to audit' : 'Enforce'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

const SEGMENTS: { key: keyof Omit<OutcomeCounts, 'total'>; label: string; color: string }[] = [
  { key: 'passed', label: 'passed', color: '#4caf50' },
  { key: 'warning', label: 'warning', color: '#ff9800' },
  { key: 'error', label: 'error', color: '#e53935' },
  { key: 'notEvaluated', label: 'not evaluated', color: '#bdbdbd' },
];

/** How many of a kind of thing pass, with a bar of every outcome. A group fails if any Unit in it does. */
const StatTile = ({
  title,
  counts,
  loading,
}: {
  title: string;
  counts?: OutcomeCounts;
  loading?: boolean;
}) => {
  const evaluated = counts ? counts.passed + counts.warning + counts.error : 0;
  return (
    <Paper
      variant='outlined'
      sx={{ p: 1.5, borderRadius: 2 }}
      data-testid={`validation-tile-${title.toLowerCase()}`}
    >
      <Typography
        variant='body2'
        fontSize='0.75rem'
        color='text.secondary'
        fontWeight={600}
        sx={{ textTransform: 'uppercase', letterSpacing: 0.5 }}
      >
        {title}
      </Typography>
      {!counts ? (
        <Typography variant='body2' color='text.disabled' sx={{ mt: 0.5 }}>
          {loading ? 'Loading…' : 'Not available'}
        </Typography>
      ) : (
        <>
          <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 0.75, mt: 0.25 }}>
            <Typography variant='h5' fontWeight={600}>
              {counts.passed}
            </Typography>
            <Typography variant='body2' color='text.secondary'>
              of {evaluated} passing
            </Typography>
          </Box>
          <Box
            sx={{
              display: 'flex',
              height: 6,
              borderRadius: 3,
              overflow: 'hidden',
              bgcolor: 'grey.200',
              my: 0.75,
            }}
          >
            {counts.total > 0 &&
              SEGMENTS.map((s) =>
                counts[s.key] > 0 ? (
                  <Box
                    key={s.key}
                    sx={{
                      width: `${(counts[s.key] / counts.total) * 100}%`,
                      bgcolor: s.color,
                    }}
                  />
                ) : null,
              )}
          </Box>
          <Typography variant='body2' fontSize='0.75rem' color='text.secondary'>
            {SEGMENTS.filter((s) => s.key !== 'passed' && counts[s.key] > 0)
              .map((s) =>
                s.key === 'notEvaluated'
                  ? `${counts[s.key]} ${s.label}`
                  : plural(counts[s.key], s.label),
              )
              .join(' · ') || (counts.total > 0 ? 'All passing' : 'None in scope')}
          </Typography>
        </>
      )}
    </Paper>
  );
};
