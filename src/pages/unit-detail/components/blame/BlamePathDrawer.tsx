// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { useState } from 'react';

import { ErrorBox } from '@/components/error-box/ErrorBox';
import { NavLink } from '@/components/nav-link/NavLink';
import { getApiErrorMessage } from '@/utility/error-functions';
import {
  type BlameField,
  type BlameOrigin,
  type BlamePathChange,
  type UnitPathReport,
  useGetUnitPathQuery,
} from '@confighub/rtk-query';
import CloseIcon from '@mui/icons-material/Close';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Divider from '@mui/material/Divider';
import Drawer from '@mui/material/Drawer';
import IconButton from '@mui/material/IconButton';
import Stack from '@mui/material/Stack';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';

import { unitRevisionHref } from '../../unitDetailHrefs';
import { BlameFlagChip } from './BlameFlagChip';
import { conflictDismissalText, originUnitLabel, resourceLabel } from './blameFields';

dayjs.extend(relativeTime);

export interface BlamePathDrawerProps {
  spaceId: string;
  unitId: string;
  /** The field the drawer is about; closed when absent. */
  field?: BlameField;
  onClose: () => void;
}

const monoSx = { fontFamily: 'monospace', wordBreak: 'break-all' } as const;

/** One `label: value` line, left out when there is nothing to say. */
const Line = ({ label, children }: { label: string; children?: React.ReactNode }) => {
  if (children === undefined || children === null || children === '') return null;
  return (
    <Stack direction='row' spacing={1} alignItems='baseline'>
      <Typography variant='body2' color='text.secondary' sx={{ minWidth: 120, flexShrink: 0 }}>
        {label}
      </Typography>
      <Box sx={{ minWidth: 0 }}>
        {typeof children === 'string' ? (
          <Typography variant='body2'>{children}</Typography>
        ) : (
          children
        )}
      </Box>
    </Stack>
  );
};

const Heading = ({ children }: { children: React.ReactNode }) => (
  <Typography variant='subtitle2' sx={{ mt: 2, mb: 0.5 }}>
    {children}
  </Typography>
);

/** A name next to the ID it is for, as a hop names a Link, Trigger or Invocation. */
const named = (name?: string) => (name ? name : undefined);

const UnitLink = ({ origin }: { origin: BlameOrigin }) =>
  origin.SpaceID && origin.UnitID ? (
    <NavLink to={`/units/${origin.SpaceID}/${origin.UnitID}`}>
      {originUnitLabel(origin)}
    </NavLink>
  ) : (
    <>{originUnitLabel(origin)}</>
  );

/** One change: the hop it is, what made it and why, and the Revision it is in. */
const ChangeCard = ({ change }: { change: BlamePathChange }) => {
  const origin = change.Origin ?? {};
  return (
    <Box
      sx={{ border: 1, borderColor: 'divider', borderRadius: 1, p: 1.5 }}
      data-testid='blame-change'
    >
      <Stack direction='row' spacing={1} alignItems='baseline' flexWrap='wrap'>
        <Typography variant='body2' sx={{ fontWeight: 600 }}>
          <UnitLink origin={origin} />
        </Typography>
        {origin.RevisionNum ? (
          origin.SpaceID && origin.UnitID ? (
            <NavLink to={unitRevisionHref(origin.SpaceID, origin.UnitID, origin.RevisionNum)}>
              revision {origin.RevisionNum}
            </NavLink>
          ) : (
            <Typography variant='body2'>revision {origin.RevisionNum}</Typography>
          )
        ) : null}
        {origin.When && (
          <Tooltip title={dayjs(origin.When).format('YYYY-MM-DD HH:mm:ss')}>
            <Typography variant='caption' color='text.secondary'>
              {dayjs(origin.When).fromNow()}
            </Typography>
          </Tooltip>
        )}
      </Stack>
      <Stack spacing={0.25} sx={{ mt: 0.5 }}>
        <Line label='Set by'>{origin.SetBy}</Line>
        <Line label='Function'>
          {origin.Function !== origin.SetBy ? origin.Function : undefined}
        </Line>
        <Line label='Link'>{named(origin.Link)}</Line>
        <Line label='Trigger'>{named(origin.Trigger)}</Line>
        <Line label='Invocation'>{named(origin.Invocation)}</Line>
        <Line label='Read from'>
          {origin.LinkUpstream
            ? `${origin.LinkUpstream}${origin.LinkUpstreamRevisionNum ? ` revision ${origin.LinkUpstreamRevisionNum}` : ''}`
            : undefined}
        </Line>
        <Line label='Operation'>{origin.Source}</Line>
        <Line label='User'>{origin.User}</Line>
        <Line label='Description'>{origin.Description}</Line>
        <Line label='Mutation'>
          {change.MutationType
            ? `${change.MutationType}${origin.MutationNum ? ` (mutation ${origin.MutationNum})` : ''}`
            : undefined}
        </Line>
        <Line label='Value'>
          {change.Value ? (
            <Typography variant='body2' sx={monoSx}>
              {change.Value}
            </Typography>
          ) : undefined}
        </Line>
        <Line label='ChangeOrders'>{(origin.ChangeOrders ?? []).join(', ')}</Line>
        <Line label='Releases'>{(origin.Releases ?? []).join(', ')}</Line>
        <Line label='Tags'>{(origin.Tags ?? []).join(', ')}</Line>
      </Stack>
    </Box>
  );
};

/** Everything the report says about the field as it stands. */
const FieldSummary = ({ report }: { report: UnitPathReport }) => {
  const field = report.Field ?? {};
  const names = report.Names ?? {};
  return (
    <Stack spacing={0.5}>
      <Line label='Resource'>
        {[field.ResourceType, field.ResourceName].filter(Boolean).join(' ')}
      </Line>
      <Line label='Path'>
        {field.Path ? (
          <Typography variant='body2' sx={monoSx}>
            {field.Path}
          </Typography>
        ) : (
          'none: this is the resource as a whole'
        )}
      </Line>
      <Line label='REF'>
        <Typography variant='body2' sx={monoSx}>
          {field.Ref}
        </Typography>
      </Line>
      <Line label='Value'>
        {field.Absent ? (
          'none: the Unit does not have this field'
        ) : field.Deleted ? (
          `none: a change deleted the ${field.Path ? 'field' : 'resource'} from the Unit`
        ) : !field.Path ? undefined : (
          <Box
            component='pre'
            sx={{ ...monoSx, m: 0, fontSize: '0.8125rem', whiteSpace: 'pre-wrap' }}
          >
            {field.Value}
          </Box>
        )}
      </Line>
      <Line label='Flags'>
        {(field.Flags ?? []).length > 0 ? (
          <Stack direction='row' spacing={0.5} flexWrap='wrap' useFlexGap>
            {(field.Flags ?? []).map((code) => (
              <BlameFlagChip key={code} code={code} field={field} />
            ))}
          </Stack>
        ) : undefined}
      </Line>
      <Line label='Released'>{report.ReleaseMessage}</Line>
      <Line label='Kept on merge'>
        {field.Deleted && field.Protected
          ? 'yes: a merge from upstream leaves it deleted'
          : field.ResourceProtected && !field.Path
            ? 'yes: the resource is protected as a whole, so a merge from upstream leaves all of it alone'
            : field.ResourceProtected
              ? 'yes: its resource is protected as a whole'
              : field.Protected
                ? 'yes: an override a merge from upstream leaves alone'
                : undefined}
      </Line>
      <Line label='Guards'>
        {Object.entries(field.Guards ?? {})
          .map(
            ([key, value]) =>
              `${key}=${value}${(field.InheritedGuards ?? []).includes(key) ? ' (inherited)' : ''}`,
          )
          .join(' ')}
      </Line>
      {Object.entries(report.Annotations ?? {}).map(([kind, values]) => (
        <Line key={kind} label={kind}>
          {Object.entries(values)
            .map(([key, value]) => `${key}=${value}`)
            .join(' ')}
        </Line>
      ))}
      {(report.ConflictDismissals ?? []).map((dismissal, i) => (
        <Line key={`dismissal-${i}`} label='Conflicts dismissed'>
          {conflictDismissalText(dismissal)}
        </Line>
      ))}
      {(field.Conflicts ?? []).map((conflict, i) => (
        <Line key={`conflict-${i}`} label='Conflict'>
          {`${conflict.Reason ?? ''}: upstream ${conflict.Source?.MutationType ?? 'change'}${
            conflict.Source?.Value ? ` to ${conflict.Source.Value.trim()}` : ''
          }${conflict.UnitID && names[conflict.UnitID] ? `, from ${names[conflict.UnitID]}` : ''}`}
        </Line>
      ))}
      {(field.Findings ?? []).map((finding, i) => (
        <Line key={`finding-${i}`} label='Link finding'>
          {[finding.Reason, finding.Details].filter(Boolean).join(': ')}
        </Line>
      ))}
      {(field.Validation ?? []).map((validation, i) => {
        const messages = [
          ...(validation.Issues ?? []).map((issue) => issue.Message ?? ''),
          ...(validation.Details ?? []),
        ].filter(Boolean);
        if (
          messages.length === 0 &&
          validation.Value !== undefined &&
          validation.Value !== null
        ) {
          messages.push(`found ${JSON.stringify(validation.Value)}`);
        }
        return (
          <Line
            key={`validation-${i}`}
            label={validation.Warning ? 'Warning' : 'Validation error'}
          >
            {`${validation.Gate ?? ''}${validation.Score ? ` (${validation.Score})` : ''}${
              validation.Path ? ` at ${validation.Path}` : ''
            }${messages.length > 0 ? `: ${messages.join('; ')}` : ''}`}
          </Line>
        );
      })}
      {(field.Needed ?? []).map((needed, i) => (
        <Line key={`needed-${i}`} label='Needed'>
          {`${needed.AttributeName || '(unnamed attribute)'}${needed.BoundLink ? `, bound by Link ${needed.BoundLink}` : ', not bound by a Link'}`}
        </Line>
      ))}
      {(field.Provided ?? []).map((provided, i) => (
        <Line key={`provided-${i}`} label='Provided'>
          {provided.AttributeName || '(unnamed attribute)'}
        </Line>
      ))}
    </Stack>
  );
};

/** Everything recorded about one field, from GetUnitPath. */
export const BlamePathDrawer = ({ spaceId, unitId, field, onClose }: BlamePathDrawerProps) => {
  const [history, setHistory] = useState(false);
  const [errorDismissed, setErrorDismissed] = useState(false);
  const open = field !== undefined;
  const { data, error, isFetching } = useGetUnitPathQuery(
    // The REF names the field; the resource is given too, since a REF prefix could be shared.
    { spaceId, unitId, field: field?.Ref ?? '', resource: field?.ResourceName, history },
    { skip: !open || !field?.Ref },
  );

  const close = () => {
    setHistory(false);
    setErrorDismissed(false);
    onClose();
  };

  return (
    <Drawer
      anchor='right'
      open={open}
      onClose={close}
      PaperProps={{ sx: { width: { xs: '100%', md: '50%' } } }}
    >
      <Stack direction='row' alignItems='center' sx={{ p: 2, pb: 1 }}>
        <Typography variant='h6' sx={{ flex: 1, ...monoSx }}>
          {field?.Path || resourceLabel(field ?? {})}
        </Typography>
        <IconButton aria-label='Close' onClick={close}>
          <CloseIcon />
        </IconButton>
      </Stack>
      <Divider />
      <Box sx={{ p: 2, overflow: 'auto' }} data-testid='blame-path-drawer'>
        {error && !errorDismissed && (
          <ErrorBox
            error={getApiErrorMessage(error, 'Failed to read the field')}
            onClose={() => setErrorDismissed(true)}
          />
        )}
        {isFetching && !data && <CircularProgress size={24} />}
        {data && (
          <>
            <FieldSummary report={data} />
            <Heading>
              {data.Field?.Deleted
                ? 'Changes, from this Unit out to where it was deleted'
                : !data.Field?.Path
                  ? 'Changes, from this Unit out to where the resource was added'
                  : 'Changes, from this Unit out to where the value was set'}
            </Heading>
            {(data.Changes ?? []).length === 0 ? (
              <Typography variant='body2' color='text.secondary'>
                {data.Field?.Absent
                  ? 'No recorded change: the Unit does not have this field.'
                  : !data.Field?.Path
                    ? 'No recorded change: the resource has been there since the Unit was created.'
                    : 'No recorded change: the value has been there since the Unit was created.'}
              </Typography>
            ) : (
              <Stack spacing={1}>
                {(data.Changes ?? []).map((change, i) => (
                  <ChangeCard key={i} change={change} />
                ))}
              </Stack>
            )}
            <Heading>History in this Unit</Heading>
            {!history ? (
              <Button
                size='small'
                onClick={() => setHistory(true)}
                disabled={data.Field?.Absent}
              >
                Show history
              </Button>
            ) : isFetching ? (
              <CircularProgress size={20} />
            ) : (data.History ?? []).length === 0 ? (
              <Typography variant='body2' color='text.secondary'>
                This Unit records no change to the field itself; it arrived with its resource.
              </Typography>
            ) : (
              <Stack spacing={1}>
                {(data.History ?? []).map((change, i) => (
                  <ChangeCard key={i} change={change} />
                ))}
              </Stack>
            )}
          </>
        )}
      </Box>
    </Drawer>
  );
};
