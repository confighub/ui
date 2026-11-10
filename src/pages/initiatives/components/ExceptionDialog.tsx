// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { useState } from 'react';

import { ErrorBox } from '@/components/error-box/ErrorBox';
import { GuardValuesSection } from '@/components/guarded-write/GuardValuesSection';
import {
  type GuardValues,
  NO_GUARD_VALUES,
  clearanceRecording,
  guardParams,
  guardValuesComplete,
} from '@/components/guarded-write/guardValues';
import { guardedChanges, withheldSummary } from '@/components/guarded-write/guardedWrite';
import { useGuardedWrite } from '@/components/guarded-write/useGuardedWrite';
import { useAppDispatch } from '@/hooks/useApp';
import { getApiErrorMessage } from '@/utility/error-functions';
import {
  type Clearance,
  type FunctionInvocation,
  confighubApi,
  useInvokeFunctionsOnOrgMutation,
} from '@confighub/rtk-query';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';

/** A resource of a Unit, as the resource list names it. */
export interface UnitResource {
  type: string;
  name: string;
}

/** The Unit an exception is added to or removed from. */
export interface ExceptionUnit {
  unitId: string;
  slug: string;
  spaceId: string;
  spaceSlug: string;
  toolchainType: string;
}

export type ExceptionDialogRequest =
  | {
      mode: 'add';
      unit: ExceptionUnit;
      /** The Unit's resources, the ones that fail first. */
      resources: UnitResource[];
    }
  | {
      mode: 'remove';
      unit: ExceptionUnit;
      resource: UnitResource;
      /** Whether the exception is the resource's only annotation, so removing it removes the map. */
      onlyAnnotation: boolean;
    };

interface ExceptionDialogProps {
  request: ExceptionDialogRequest | null;
  triggerName: string;
  /** The annotation key that excepts a resource from the Trigger. */
  annotationKey: string;
  onClose: () => void;
  onDone: (message: string) => void;
}

const quoted = (value: string) => `'${value.replace(/'/g, "''")}'`;

const resourceWhere = (r: UnitResource) =>
  `ConfigHub.ResourceType = ${quoted(r.type)} AND ConfigHub.ResourceName = ${quoted(r.name)}`;

const resourceKey = (r: UnitResource) => `${r.type}|${r.name}`;

/** The annotation path of key, with the dots in it escaped so the path has the segments it means. */
const annotationPath = (key: string) => `metadata.annotations.${key.replace(/\./g, '~1')}`;

/**
 * Adds an exception to a validating Trigger -- the annotation its WhereResource skips -- to one
 * resource of a Unit, or removes one. An exception is part of the resource's configuration, so
 * either is a change to the Unit, with a change description, and promoted downstream like any
 * other.
 *
 * The write runs as a dry run first: if a guard on the resource would withhold it, the person is
 * asked whether to clear it. A guard can be recorded on the annotation as it is added, such as
 * Override=External, so that an upload of the Unit's source does not remove it; inherited, it
 * goes with the annotation to the Units downstream.
 */
export const ExceptionDialog = ({
  request,
  triggerName,
  annotationKey,
  onClose,
  onDone,
}: ExceptionDialogProps) => {
  const dispatch = useAppDispatch();
  const [invoke] = useInvokeFunctionsOnOrgMutation();
  const { start, dialog, busy } = useGuardedWrite(
    request?.mode === 'remove' ? 'Remove' : 'Except',
  );
  const [resource, setResource] = useState('');
  const [reason, setReason] = useState('');
  const [guardValues, setGuardValues] = useState<GuardValues>(NO_GUARD_VALUES);
  const [changeDescription, setChangeDescription] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [attempted, setAttempted] = useState(false);

  if (!request) return null;
  const { unit } = request;
  const unitLabel = `${unit.spaceSlug}/${unit.slug}`;
  const chosen =
    request.mode === 'add'
      ? (request.resources.find((r) => resourceKey(r) === resource) ?? request.resources[0])
      : request.resource;
  const resourceText = chosen ? `${chosen.type} ${chosen.name}` : '';
  const description =
    changeDescription.trim() ||
    (request.mode === 'add'
      ? `Except ${chosen?.name ?? 'a resource'} from ${triggerName}: ${reason.trim()}`
      : `Remove the exception of ${chosen?.name ?? 'a resource'} from ${triggerName}`);

  const close = () => {
    setResource('');
    setReason('');
    setGuardValues(NO_GUARD_VALUES);
    setChangeDescription('');
    setError(null);
    setAttempted(false);
    onClose();
  };

  const functionInvocation = (r: UnitResource): FunctionInvocation =>
    request.mode === 'add'
      ? {
          FunctionName: 'set-annotation',
          Arguments: [
            { ParameterName: 'annotation-key', Value: annotationKey },
            { ParameterName: 'annotation-value', Value: reason.trim() },
          ],
          WhereResource: resourceWhere(r),
        }
      : {
          FunctionName: 'delete-path',
          Arguments: [
            { ParameterName: 'resource-type', Value: r.type },
            // The last annotation takes the map with it, so that adding and removing an exception
            // leaves the resource as it was.
            {
              ParameterName: 'path',
              Value: request.onlyAnnotation
                ? 'metadata.annotations'
                : annotationPath(annotationKey),
            },
          ],
          WhereResource: resourceWhere(r),
        };

  const submit = async () => {
    setAttempted(true);
    setError(null);
    if (!chosen) return;
    if (request.mode === 'add' && (!reason.trim() || !guardValuesComplete(guardValues)))
      return;
    const guards = request.mode === 'add' ? guardValues : NO_GUARD_VALUES;
    try {
      const outcome = await start({
        // A guard on any path of the resource could withhold the write, and only a dry run says,
        // so every exception is asked about first.
        guarded: true,
        run: async ({ dryRun, clearance }: { dryRun: boolean; clearance?: Clearance }) => {
          const recording = clearanceRecording(clearance, guards);
          const responses = await invoke({
            where: `UnitID = ${quoted(unit.unitId)}`,
            executorSpace: unit.spaceId,
            dryRun: dryRun ? 'true' : undefined,
            clearance:
              recording && recording.length > 0 ? JSON.stringify(recording) : undefined,
            ...guardParams(guards),
            functionInvocationsRequest: {
              ToolchainType: unit.toolchainType,
              FunctionInvocations: [functionInvocation(chosen)],
              ChangeDescription: dryRun ? undefined : description,
            },
          }).unwrap();
          const failed = responses.find((r) => !r.Success && r.Error);
          if (failed?.Error) throw new Error(failed.Error.Message ?? 'The change failed.');
          return responses.flatMap((r) =>
            guardedChanges(r.Conflicts, unitLabel, {
              spaceId: unit.spaceId,
              unitId: unit.unitId,
            }),
          );
        },
      });
      if (outcome.status === 'cancelled') return;
      dispatch(confighubApi.util.invalidateTags(['Unit', 'Resource', 'Revision']));
      if (outcome.withheld.length > 0) {
        setError(withheldSummary(outcome.withheld));
        return;
      }
      onDone(
        request.mode === 'add'
          ? `Excepted ${resourceText} in ${unitLabel} from ${triggerName}.`
          : `Removed the exception of ${resourceText} in ${unitLabel} from ${triggerName}.`,
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
        data-testid='exception-dialog'
      >
        <DialogTitle>
          {request.mode === 'add'
            ? `Except a resource from ${triggerName}`
            : `Remove an exception from ${triggerName}`}
        </DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <DialogContentText component='div'>
              {request.mode === 'add' ? (
                <>
                  The resource is annotated <code>{annotationKey}</code>, with the reason as
                  its value, in <strong>{unitLabel}</strong>. The Trigger skips it from then
                  on. Promote the change to the Units downstream as any other.
                </>
              ) : (
                <>
                  The <code>{annotationKey}</code> annotation is removed from{' '}
                  <strong>{resourceText}</strong> in <strong>{unitLabel}</strong>, so the
                  Trigger checks it again.
                </>
              )}
            </DialogContentText>
            {request.mode === 'add' && (
              <>
                <TextField
                  select
                  size='small'
                  label='Resource'
                  value={chosen ? resourceKey(chosen) : ''}
                  onChange={(e) => setResource(e.target.value)}
                  disabled={busy}
                  data-testid='exception-resource'
                >
                  {request.resources.map((r) => (
                    <MenuItem key={resourceKey(r)} value={resourceKey(r)}>
                      {r.type} {r.name}
                    </MenuItem>
                  ))}
                </TextField>
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
                  helperText='Why the resource is excepted. Recorded as the annotation’s value.'
                  data-testid='exception-reason'
                />
                <GuardValuesSection
                  values={guardValues}
                  onChange={setGuardValues}
                  disabled={busy}
                  keyMissing={attempted && !guardValuesComplete(guardValues)}
                />
                <Typography variant='body2' color='text.secondary' fontSize='0.75rem'>
                  Guard the annotation when an upload or merge from upstream could remove it,
                  such as with Override=External for a Unit uploaded from a chart. Inherited,
                  the guard goes with it to the Units downstream.
                </Typography>
              </>
            )}
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
            disabled={busy || !chosen}
            startIcon={busy ? <CircularProgress size={14} color='inherit' /> : undefined}
            data-testid='exception-submit'
          >
            {request.mode === 'add' ? 'Add exception' : 'Remove exception'}
          </Button>
        </DialogActions>
      </Dialog>
      {dialog}
    </>
  );
};
