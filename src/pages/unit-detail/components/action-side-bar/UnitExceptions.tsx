// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { useMemo, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';

import {
  ExceptionDialog,
  type ExceptionDialogRequest,
} from '@/pages/initiatives/components/ExceptionDialog';
import {
  annotationKeyOfPath,
  exceptionAnnotationPath,
  honoredExceptionPaths,
  isTemporaryException,
} from '@/pages/initiatives/validationModel';
import { getApiErrorMessage } from '@/utility/error-functions';
import {
  type ExtendedTriggerRead,
  type TriggerRead,
  type UnitRead,
  useListAllResourcesQuery,
} from '@confighub/rtk-query';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Link from '@mui/material/Link';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Typography from '@mui/material/Typography';

/** One resource of the Unit excepted from one Trigger. */
interface UnitException {
  /** The Trigger whose own exception it is, or that honors it when the owner is not selected. */
  trigger: TriggerRead;
  /** The rule the annotation names, when no Trigger selected for the Unit is its own. */
  honoredRule?: string;
  annotationKey: string;
  type: string;
  name: string;
  reason: string;
  /** Whether the exception is the resource's only annotation. */
  onlyAnnotation: boolean;
}

interface UnitExceptionsProps {
  unit: UnitRead;
  spaceSlug: string;
  /** The Triggers selected for the Unit; undefined until they are read. */
  triggers: ExtendedTriggerRead[] | undefined;
  /** Why the Triggers could not be read, when they could not. */
  triggersError?: string;
}

const resourceAnnotations = (data: unknown): Record<string, unknown> =>
  (data as { metadata?: { annotations?: Record<string, unknown> } } | undefined)?.metadata
    ?.annotations ?? {};

/**
 * The resources of a Unit excepted from the validating Triggers selected for it, and why: those
 * carrying an annotation a Trigger's WhereResource skips, its own or one it honors. The temporary
 * exceptions, whose reason marks them as failures to be fixed, are listed first, apart from the
 * rest. An exception is part of the resource's configuration, so it is read from there, and
 * removing one is a change to the Unit.
 */
export const UnitExceptions = ({
  unit,
  spaceSlug,
  triggers,
  triggersError,
}: UnitExceptionsProps) => {
  const [removeRequest, setRemoveRequest] = useState<
    (ExceptionDialogRequest & { triggerName: string; annotationKey: string }) | null
  >(null);
  const [notice, setNotice] = useState<string | null>(null);
  const {
    data: resources,
    isLoading,
    error,
  } = useListAllResourcesQuery({ where: `UnitID = '${unit.UnitID}'` }, { skip: !unit.UnitID });

  // Each exception annotation of the selected Triggers, with the Trigger that owns it, or, for
  // one only honored, the first Trigger honoring it.
  const byKey = useMemo(() => {
    const out = new Map<string, { trigger: TriggerRead; own: boolean }>();
    for (const et of triggers ?? []) {
      const t = et.Trigger;
      if (!t?.Validating || t.Disabled) continue;
      const own = exceptionAnnotationPath(t.WhereResource, t.Slug);
      if (own) out.set(annotationKeyOfPath(own), { trigger: t, own: true });
      for (const path of honoredExceptionPaths(t.WhereResource, t.Slug)) {
        const key = annotationKeyOfPath(path);
        if (!out.has(key)) out.set(key, { trigger: t, own: false });
      }
    }
    return out;
  }, [triggers]);

  const exceptions = useMemo(() => {
    const out: UnitException[] = [];
    for (const er of resources ?? []) {
      const r = er.Resource;
      if (!r?.ResourceType || !r.ResourceName) continue;
      const annotations = resourceAnnotations(r.Data);
      for (const [key, value] of Object.entries(annotations)) {
        const match = byKey.get(key);
        if (!match) continue;
        out.push({
          trigger: match.trigger,
          honoredRule: match.own ? undefined : key.slice(key.lastIndexOf('/') + 1),
          annotationKey: key,
          type: r.ResourceType,
          name: r.ResourceName,
          reason: typeof value === 'string' ? value : '',
          onlyAnnotation: Object.keys(annotations).length === 1,
        });
      }
    }
    return out.sort(
      (a, b) =>
        (a.trigger.DisplayName || a.trigger.Slug || '').localeCompare(
          b.trigger.DisplayName || b.trigger.Slug || '',
        ) || a.name.localeCompare(b.name),
    );
  }, [resources, byKey]);

  const failed = triggersError ?? (error ? getApiErrorMessage(error, '') : undefined);
  const loading = triggers === undefined || isLoading;
  const temporary = exceptions.filter((e) => isTemporaryException(e.reason));
  const lasting = exceptions.filter((e) => !isTemporaryException(e.reason));

  const remove = (e: UnitException) =>
    setRemoveRequest({
      mode: 'remove',
      unit: {
        unitId: unit.UnitID ?? '',
        slug: unit.Slug ?? '',
        spaceId: unit.SpaceID ?? '',
        spaceSlug,
        toolchainType: unit.ToolchainType ?? 'Kubernetes/YAML',
      },
      resource: { type: e.type, name: e.name },
      onlyAnnotation: e.onlyAnnotation,
      triggerName: e.trigger.DisplayName || e.trigger.Slug || '',
      annotationKey: e.annotationKey,
    });

  return (
    <Box sx={{ mt: 3 }} data-testid='unit-exceptions'>
      {failed ? (
        <Alert severity='error'>Could not read the Unit’s exceptions. {failed}</Alert>
      ) : loading ? (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Typography variant='body2' sx={{ fontWeight: 600 }}>
            Exceptions
          </Typography>
          <CircularProgress size={14} />
        </Box>
      ) : (
        <>
          {notice && (
            <Alert severity='info' onClose={() => setNotice(null)} sx={{ mb: 2 }}>
              {notice}
            </Alert>
          )}
          {temporary.length > 0 && (
            <Box sx={{ mb: 2 }} data-testid='unit-temporary-exceptions'>
              <Typography variant='body2' sx={{ fontWeight: 600, mb: 1 }}>
                Temporary Exceptions ({temporary.length})
              </Typography>
              <ExceptionRows exceptions={temporary} onRemove={remove} />
            </Box>
          )}
          <Box data-testid='unit-lasting-exceptions'>
            <Typography variant='body2' sx={{ fontWeight: 600, mb: 1 }}>
              Exceptions ({lasting.length})
            </Typography>
            {lasting.length === 0 ? (
              <Typography variant='body2' color='text.secondary'>
                No {temporary.length > 0 ? 'other ' : ''}resource is excepted.
              </Typography>
            ) : (
              <ExceptionRows exceptions={lasting} onRemove={remove} />
            )}
          </Box>
        </>
      )}
      {removeRequest && (
        <ExceptionDialog
          request={removeRequest}
          triggerName={removeRequest.triggerName}
          annotationKey={removeRequest.annotationKey}
          onClose={() => setRemoveRequest(null)}
          onDone={(message) =>
            setNotice(`${message} The Unit is evaluated again as it changes.`)
          }
        />
      )}
    </Box>
  );
};

const ExceptionRows = ({
  exceptions,
  onRemove,
}: {
  exceptions: UnitException[];
  onRemove: (e: UnitException) => void;
}) => (
  <Table size='small' sx={{ border: '1px solid', borderColor: 'divider' }}>
    <TableHead>
      <TableRow>
        <TableCell>Trigger</TableCell>
        <TableCell>Resource</TableCell>
        <TableCell>Reason</TableCell>
        <TableCell />
      </TableRow>
    </TableHead>
    <TableBody>
      {exceptions.map((e) => (
        <TableRow key={`${e.annotationKey}|${e.type}|${e.name}`} hover>
          <TableCell>
            {e.honoredRule ? (
              <>
                {e.honoredRule}, honored by{' '}
                <Link
                  component={RouterLink}
                  to={`/validation/${e.trigger.TriggerID}`}
                  underline='hover'
                >
                  {e.trigger.DisplayName || e.trigger.Slug}
                </Link>
              </>
            ) : (
              <Link
                component={RouterLink}
                to={`/validation/${e.trigger.TriggerID}`}
                underline='hover'
              >
                {e.trigger.DisplayName || e.trigger.Slug}
              </Link>
            )}
          </TableCell>
          <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>
            {e.type} {e.name}
          </TableCell>
          <TableCell>{e.reason || '(no reason given)'}</TableCell>
          <TableCell align='right'>
            <Button size='small' sx={{ textTransform: 'none' }} onClick={() => onRemove(e)}>
              Remove…
            </Button>
          </TableCell>
        </TableRow>
      ))}
    </TableBody>
  </Table>
);
