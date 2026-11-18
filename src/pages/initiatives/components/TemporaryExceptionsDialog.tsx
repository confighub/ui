// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { useMemo, useState } from 'react';

import { ErrorBox } from '@/components/error-box/ErrorBox';
import { GuardValuesSection } from '@/components/guarded-write/GuardValuesSection';
import {
  type GuardValues,
  NO_GUARD_VALUES,
  clearanceRecording,
  guardParams,
  guardValuesComplete,
} from '@/components/guarded-write/guardValues';
import {
  type GuardedChange,
  guardedChanges,
  withheldSummary,
} from '@/components/guarded-write/guardedWrite';
import { useGuardedWrite } from '@/components/guarded-write/useGuardedWrite';
import { useAppDispatch } from '@/hooks/useApp';
import { plural } from '@/pages/change-orders/changeOrderHistory';
import { SpaceNameList } from '@/pages/change-orders/components/SpaceListing';
import { nonMergeClearanceParam } from '@/utility/clearance-functions';
import { getApiErrorMessage } from '@/utility/error-functions';
import {
  type Clearance,
  type ExtendedResourceRead,
  type FunctionInvocation,
  type ValidationResultList,
  confighubApi,
  useInvokeFunctionsOnOrgMutation,
  useListAllResourcesQuery,
} from '@confighub/rtk-query';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';

import { unitLink } from '../validationLinks';
import {
  NOT_EXCEPTED_TEXT,
  type NamedResource,
  type NotExceptedKind,
  type PolicyUnit,
  type ScopeSpace,
  TEMPORARY_EXCEPTION_PREFIX,
  failedResources,
  resourcesToExcept,
  temporaryReason,
} from '../validationModel';

// Units per request, so a Trigger failing across a fleet makes several requests rather than one
// whose filter is too long.
const UNITS_CHUNK = 100;

const quoted = (value: string) => `'${value.replace(/'/g, "''")}'`;

const resourceWhere = (r: NamedResource) =>
  `ConfigHub.ResourceType = ${quoted(r.type)} AND ConfigHub.ResourceName = ${quoted(r.name)}`;

const resourceKey = (r: NamedResource) => `${r.type}|${r.name}`;

// The groups of Units left out, those the person can act on first.
const NOT_EXCEPTED_ORDER: NotExceptedKind[] = [
  'Ambiguous',
  'Unnamed',
  'NotHeld',
  'AlreadyExcepted',
];

interface TemporaryExceptionsDialogProps {
  open: boolean;
  triggerName: string;
  toolchainType: string;
  /** The annotation key that excepts a resource from the Trigger, and its path. */
  annotationKey: string;
  annotationPath: string;
  /** The failing Units whose failures to except. */
  units: PolicyUnit[];
  /** The Trigger's results on each failing Unit, by Unit ID; undefined until they are read. */
  resultsByUnit: Map<string, ValidationResultList> | undefined;
  /** The resources of the Units in the Trigger's scope; undefined until they are read. */
  resources: ExtendedResourceRead[] | undefined;
  spaceById: Map<string, ScopeSpace>;
  onClose: () => void;
  onDone: (message: string) => void;
}

/** One set of resources to except, in every Unit failing on just those. */
interface ExceptionGroup {
  resources: NamedResource[];
  unitIds: string[];
}

/**
 * Excepts every resource failing a validating Trigger in some Units, with a reason starting
 * ToBeFixed, so that the Trigger can be enforced before they are fixed, and blocks anything new
 * that fails it. A Unit's failing resources are those its results name, or its only resource when
 * they name none; a Unit whose failures cannot all be placed is left as it is, and listed.
 *
 * The Units failing on the same resources, as the variants of one base do, are written with one
 * request. As for one exception, the write runs as a dry run first, so a guard that would
 * withhold it is asked about.
 */
export const TemporaryExceptionsDialog = ({
  open,
  triggerName,
  toolchainType,
  annotationKey,
  annotationPath,
  units,
  resultsByUnit,
  resources,
  spaceById,
  onClose,
  onDone,
}: TemporaryExceptionsDialogProps) => {
  const dispatch = useAppDispatch();
  const [invoke] = useInvokeFunctionsOnOrgMutation();
  const { start, dialog, busy } = useGuardedWrite('Except');
  const [reason, setReason] = useState('');
  const [guardValues, setGuardValues] = useState<GuardValues>(NO_GUARD_VALUES);
  const [changeDescription, setChangeDescription] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [attempted, setAttempted] = useState(false);

  const {
    data: exceptedData,
    isError: exceptedError,
    error: exceptedQueryError,
  } = useListAllResourcesQuery(
    {
      where: `Data.${annotationPath} IS NOT NULL`,
      select: 'ResourceID,UnitID,ResourceType,ResourceName',
    },
    { skip: !open },
  );

  const plan = useMemo(() => {
    if (!resultsByUnit || !resources || !exceptedData) return undefined;
    const excepted = new Set(
      exceptedData.flatMap((er) =>
        er.Resource
          ? [`${er.Resource.UnitID}|${er.Resource.ResourceType}|${er.Resource.ResourceName}`]
          : [],
      ),
    );
    const byUnit = new Map<string, NamedResource[]>();
    for (const er of resources) {
      const r = er.Resource;
      if (!r?.UnitID || !r.ResourceType || !r.ResourceName) continue;
      byUnit.set(r.UnitID, [
        ...(byUnit.get(r.UnitID) ?? []),
        { type: r.ResourceType, name: r.ResourceName },
      ]);
    }
    const groups = new Map<string, ExceptionGroup>();
    const notExcepted: { unit: PolicyUnit; kind: NotExceptedKind }[] = [];
    let count = 0;
    for (const u of units) {
      const chosen = resourcesToExcept(
        failedResources(resultsByUnit.get(u.unit.id)),
        byUnit.get(u.unit.id) ?? [],
        (r) => excepted.has(`${u.unit.id}|${r.type}|${r.name}`),
      );
      if (chosen.kind !== undefined) {
        notExcepted.push({ unit: u, kind: chosen.kind });
        continue;
      }
      const sorted = [...chosen.resources].sort((a, b) =>
        resourceKey(a).localeCompare(resourceKey(b)),
      );
      const key = sorted.map(resourceKey).join('\n');
      const group = groups.get(key) ?? { resources: sorted, unitIds: [] };
      group.unitIds.push(u.unit.id);
      groups.set(key, group);
      count += sorted.length;
    }
    return {
      groups: [...groups.values()],
      units: [...groups.values()].reduce((n, g) => n + g.unitIds.length, 0),
      resources: count,
      notExcepted,
    };
  }, [resultsByUnit, resources, exceptedData, units]);

  if (!open) return null;

  const value = temporaryReason(reason);
  const description =
    changeDescription.trim() ||
    `Temporarily except the resources failing ${triggerName}: ${value}`;
  const unitLabel = (u: PolicyUnit) =>
    `${spaceById.get(u.unit.spaceId)?.slug ?? ''}/${u.unit.slug}`;

  const close = () => {
    setReason('');
    setGuardValues(NO_GUARD_VALUES);
    setChangeDescription('');
    setError(null);
    setAttempted(false);
    onClose();
  };

  const functionInvocations = (group: ExceptionGroup): FunctionInvocation[] =>
    group.resources.map((r) => ({
      FunctionName: 'set-annotation',
      Arguments: [
        { ParameterName: 'annotation-key', Value: annotationKey },
        { ParameterName: 'annotation-value', Value: value },
      ],
      WhereResource: resourceWhere(r),
    }));

  const submit = async () => {
    setAttempted(true);
    setError(null);
    if (!plan || plan.groups.length === 0) return;
    if (!reason.trim() || !guardValuesComplete(guardValues)) return;
    // The Units a write failed on, by run, so that only the real write's are reported.
    let failed: string[] = [];
    try {
      const outcome = await start({
        guarded: true,
        run: async ({ dryRun, clearance }: { dryRun: boolean; clearance?: Clearance }) => {
          failed = [];
          const withheld: GuardedChange[] = [];
          for (const group of plan.groups) {
            for (let i = 0; i < group.unitIds.length; i += UNITS_CHUNK) {
              const chunk = group.unitIds.slice(i, i + UNITS_CHUNK);
              const responses = await invoke({
                where: `UnitID IN (${chunk.map(quoted).join(', ')})`,
                dryRun: dryRun ? 'true' : undefined,
                clearance: nonMergeClearanceParam(
                  undefined,
                  clearanceRecording(clearance, guardValues),
                ),
                ...guardParams(guardValues),
                functionInvocationsRequest: {
                  ToolchainType: toolchainType,
                  FunctionInvocations: functionInvocations(group),
                  ChangeDescription: dryRun ? undefined : description,
                },
              }).unwrap();
              for (const r of responses) {
                if (!r.Success && r.Error)
                  failed.push(`${r.SpaceSlug}/${r.UnitSlug}: ${r.Error.Message}`);
                withheld.push(
                  ...guardedChanges(r.Conflicts, `${r.SpaceSlug}/${r.UnitSlug}`, {
                    spaceId: r.SpaceID ?? '',
                    unitId: r.UnitID ?? '',
                  }),
                );
              }
            }
          }
          // A dry run that fails on a Unit writes nothing anywhere: the failure is shown first.
          if (dryRun && failed.length > 0) throw new Error(failed.join('; '));
          return withheld;
        },
      });
      if (outcome.status === 'cancelled') return;
      dispatch(confighubApi.util.invalidateTags(['Unit', 'Resource', 'Revision']));
      const problems = [
        ...(failed.length > 0
          ? [
              `Not excepted in ${plural(failed.length, 'Unit')}: ${failed.slice(0, 3).join('; ')}${failed.length > 3 ? ` and ${failed.length - 3} more` : ''}`,
            ]
          : []),
        ...(outcome.withheld.length > 0 ? [withheldSummary(outcome.withheld)] : []),
      ];
      if (problems.length > 0) {
        setError(problems.join(' '));
        return;
      }
      onDone(
        `Excepted ${plural(plan.resources, 'resource')} in ${plural(plan.units, 'Unit')} from ${triggerName} temporarily.`,
      );
      close();
    } catch (err) {
      setError(getApiErrorMessage(err, 'The change failed.'));
    }
  };

  return (
    <>
      <Dialog
        open
        onClose={() => !busy && close()}
        maxWidth='sm'
        fullWidth
        data-testid='temporary-exceptions-dialog'
      >
        <DialogTitle>Except the failures of {triggerName} temporarily</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <DialogContentText component='div'>
              Each failing resource is annotated <code>{annotationKey}</code>, with{' '}
              <code>{TEMPORARY_EXCEPTION_PREFIX}:</code> and the reason as its value, so the
              Trigger skips it and it is listed under Temporary Exceptions until it is fixed.
            </DialogContentText>
            {exceptedError ? (
              <Alert severity='error'>
                {getApiErrorMessage(exceptedQueryError, 'Could not read the exceptions.')}
              </Alert>
            ) : !plan ? (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <CircularProgress size={16} />
                <Typography variant='body2' color='text.secondary'>
                  Reading the failures…
                </Typography>
              </Box>
            ) : (
              <>
                <Typography variant='body2' data-testid='temporary-exceptions-summary'>
                  {plan.resources > 0 ? (
                    <>
                      Excepts <strong>{plural(plan.resources, 'resource')}</strong> in{' '}
                      <strong>{plural(plan.units, 'Unit')}</strong>.
                    </>
                  ) : (
                    'No failing resource can be excepted.'
                  )}
                </Typography>
                {plan.notExcepted.length > 0 && (
                  <Alert severity='warning' data-testid='temporary-exceptions-not-excepted'>
                    <Typography variant='body2' sx={{ mb: 0.5 }}>
                      {plural(plan.notExcepted.length, 'Unit')}{' '}
                      {plan.notExcepted.length === 1 ? 'is' : 'are'} left as{' '}
                      {plan.notExcepted.length === 1 ? 'it is' : 'they are'}:
                    </Typography>
                    {NOT_EXCEPTED_ORDER.flatMap((kind) => {
                      const left = plan.notExcepted.filter((n) => n.kind === kind);
                      return left.length === 0
                        ? []
                        : [
                            <Box
                              key={kind}
                              sx={{ mt: 0.5 }}
                              data-testid={`temporary-exceptions-not-excepted-${kind}`}
                            >
                              <Typography variant='body2'>
                                {plural(left.length, 'Unit')}: {NOT_EXCEPTED_TEXT[kind]}
                              </Typography>
                              <SpaceNameList
                                noun='Unit'
                                spaces={left.map(({ unit }) => ({
                                  spaceId: unit.unit.id,
                                  name: unitLabel(unit),
                                  labels: spaceById.get(unit.unit.spaceId)?.labels,
                                  href: unitLink(unit.unit.spaceId, unit.unit.id),
                                }))}
                              />
                            </Box>,
                          ];
                    })}
                  </Alert>
                )}
              </>
            )}
            <TextField
              size='small'
              label='Reason'
              required
              multiline
              minRows={2}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              disabled={busy}
              error={attempted && !reason.trim()}
              helperText={`Why the failures are not fixed yet. Recorded after ${TEMPORARY_EXCEPTION_PREFIX}:.`}
              data-testid='temporary-exceptions-reason'
            />
            <GuardValuesSection
              values={guardValues}
              onChange={setGuardValues}
              disabled={busy}
              keyMissing={attempted && !guardValuesComplete(guardValues)}
            />
            <TextField
              size='small'
              label='Change description'
              value={changeDescription}
              placeholder={description}
              onChange={(e) => setChangeDescription(e.target.value)}
              disabled={busy}
              slotProps={{ inputLabel: { shrink: true } }}
            />
            <ErrorBox error={error} onClose={() => setError(null)} />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={close} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant='contained'
            onClick={() => void submit()}
            disabled={busy || !plan || plan.resources === 0}
            startIcon={busy ? <CircularProgress size={14} color='inherit' /> : undefined}
            data-testid='temporary-exceptions-submit'
          >
            Add exceptions
          </Button>
        </DialogActions>
      </Dialog>
      {dialog}
    </>
  );
};
