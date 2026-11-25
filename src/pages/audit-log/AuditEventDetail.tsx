// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * An AuditEvent's details, under its row: when, the error, the authority it acted under, where the
 * request came from, and what changed. The audit log does not copy Unit data: a Revision holds a
 * Unit's change, and the details link to it.
 */
import { type ReactNode, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';

import type { PrincipalNames } from '@/hooks/usePrincipalNames';
import {
  type AuditEventRead,
  type AuditGrant,
  useListAllRevisionsQuery,
} from '@confighub/rtk-query';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';

import { R_MICRO, consoleTokens as T } from '../change-orders/consoleStyle';
import { orgRoleLabel } from '../service-accounts/orgRoles';
import { type OwnerLookup, isFailure, principalLabel, subjectText } from './auditEventText';

const LINK_SX = {
  color: T.action,
  fontWeight: 600,
  textDecoration: 'none',
  cursor: 'pointer',
  '&:hover': { textDecoration: 'underline', textUnderlineOffset: '2px' },
  '&:focus-visible': {
    outline: `2px solid ${T.focus}`,
    outlineOffset: 2,
    borderRadius: R_MICRO,
  },
} as const;

const SMALL_BUTTON_SX = {
  all: 'unset',
  cursor: 'pointer',
  fontSize: 11.5,
  lineHeight: T.lh,
  color: T.ink2,
  border: `1px solid ${T.lineStrong}`,
  borderRadius: '6px',
  padding: '0 6px',
  marginLeft: '4px',
  '&:hover': { background: T.surfaceSunk },
  '&:focus-visible': { outline: `2px solid ${T.focus}`, outlineOffset: 1 },
} as const;

const SECTION_HEAD_SX = {
  margin: '0 0 8px',
  fontSize: 11.5,
  lineHeight: T.lh,
  fontWeight: 700,
  letterSpacing: '.02em',
  color: T.ink3,
} as const;
const MUTED_SX = { color: T.ink3 } as const;
const MONO_SX = { fontFamily: T.mono } as const;

function Facts({ rows }: { rows: readonly [string, ReactNode][] }) {
  return (
    <Box
      component='dl'
      sx={{
        display: 'grid',
        gridTemplateColumns: '110px minmax(0, 1fr)',
        gap: '6px 12px',
        margin: 0,
        fontSize: 12.5,
        lineHeight: T.lh,
      }}
    >
      {rows.map(([term, value]) => (
        <Box key={term} sx={{ display: 'contents' }}>
          <Box
            component='dt'
            sx={{ color: T.ink3, fontWeight: 600, fontSize: 11.5, paddingTop: '1px' }}
          >
            {term}
          </Box>
          <Box
            component='dd'
            sx={{ margin: 0, minWidth: 0, overflowWrap: 'anywhere', color: T.ink }}
          >
            {value}
          </Box>
        </Box>
      ))}
    </Box>
  );
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');
  return (
    <Box
      component='button'
      type='button'
      onClick={() => {
        navigator.clipboard?.writeText(text).then(
          () => setState('copied'),
          () => setState('failed'),
        );
      }}
      sx={SMALL_BUTTON_SX}
    >
      {state === 'copied' ? 'Copied' : state === 'failed' ? 'Could not copy' : label}
    </Box>
  );
}

interface GrantContext {
  event: AuditEventRead;
  spaceSlugById: ReadonlyMap<string, string>;
  spacesLoaded: boolean;
  principals: PrincipalNames;
  owner: OwnerLookup;
}

function grantText(
  grant: AuditGrant,
  { event, spaceSlugById, spacesLoaded, principals, owner }: GrantContext,
): string {
  const group = grant.GroupID
    ? principalLabel(
        principals.group(grant.GroupID),
        principals.loaded,
        'a Group that cannot be read',
      )
    : undefined;
  const toGroup = group ? `, to Group ${group}` : '';
  const space = (id: string | undefined) =>
    id ? (spaceSlugById.get(id) ?? (spacesLoaded ? 'that no longer exists' : '…')) : '';
  switch (grant.Source) {
    case 'Role':
      return `${orgRoleLabel(event.Role)} in the Organization`;
    case 'SpaceGrant':
      return `Space ${space(grant.EntityID)}${toGroup}`;
    case 'EntityPermissions': {
      if (grant.EntityType === 'Space') return `Space ${space(grant.EntityID)}${toGroup}`;
      if (grant.EntityID && grant.EntityID === event.SubjectEntityID)
        return `${grant.EntityType ?? 'Entity'} ${subjectText(event, spaceSlugById, owner)}${toGroup}`;
      return `A ${grant.EntityType ?? 'entity'}${toGroup}`;
    }
    case 'Group':
      return `Group ${group ?? ''}`;
    default:
      return grant.EntityType ?? 'Grant';
  }
}

function pretty(value: unknown): string[] {
  if (value === undefined || value === null) return ['(none)'];
  try {
    return JSON.stringify(value, null, 2).split('\n');
  } catch {
    return [String(value)];
  }
}

/** A line of the pretty-printed document that sets one of the changed top-level fields. */
const changedLine = (line: string, changed: ReadonlySet<string>) => {
  const match = /^ {2}"([^"]+)":/.exec(line);
  return match !== null && changed.has(match[1]);
};

function CodeBlock({
  title,
  lines,
  changed,
  tone,
}: {
  title: string;
  lines: string[];
  changed: ReadonlySet<string>;
  tone: 'del' | 'add';
}) {
  return (
    <Box
      sx={{
        border: `1px solid ${T.line}`,
        borderRadius: '6px',
        overflow: 'hidden',
        minWidth: 0,
      }}
    >
      <Typography
        sx={{
          fontSize: 11,
          lineHeight: T.lh,
          fontWeight: 700,
          color: T.ink3,
          padding: '4px 8px',
          background: T.surfaceSunk,
          borderBottom: `1px solid ${T.line}`,
        }}
      >
        {title}
      </Typography>
      <Box
        component='pre'
        sx={{
          margin: 0,
          padding: '6px 0',
          fontFamily: T.mono,
          fontSize: 12,
          lineHeight: 1.55,
          overflowX: 'auto',
          maxHeight: 320,
        }}
      >
        {lines.map((line, index) => {
          const marked = changedLine(line, changed);
          return (
            <Box
              component='span'
              key={index}
              sx={{
                display: 'block',
                padding: '0 8px',
                whiteSpace: 'pre',
                ...(marked
                  ? tone === 'del'
                    ? { background: T.badSoft, color: T.bad }
                    : { background: T.okSoft, color: T.ok }
                  : {}),
              }}
            >
              {line}
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}

function RevisionNote({
  event,
  spaceSlugById,
}: {
  event: AuditEventRead;
  spaceSlugById: ReadonlyMap<string, string>;
}) {
  const revisions = useListAllRevisionsQuery({
    where: `RevisionID = '${event.RevisionID}'`,
    select: 'RevisionID,RevisionNum,UnitID,SpaceID',
  });
  const revision = revisions.data?.[0]?.Revision;
  const name = subjectText(event, spaceSlugById);
  const href =
    revision?.SpaceID && revision.UnitID
      ? `/units/${revision.SpaceID}/${revision.UnitID}?tab=2`
      : undefined;
  return (
    <>
      <Typography sx={{ fontSize: 12, lineHeight: T.lh, color: T.ink2, marginBottom: '6px' }}>
        {revision?.RevisionNum !== undefined
          ? `Revision ${revision.RevisionNum}`
          : 'A Revision'}{' '}
        of{' '}
        <Box component='span' sx={MONO_SX}>
          {name}
        </Box>{' '}
        holds this change. The audit log does not copy Unit data.
      </Typography>
      {revisions.isLoading ? (
        <Typography sx={{ fontSize: 12, color: T.ink3 }}>Reading the Revision…</Typography>
      ) : null}
      {!revisions.isLoading && href ? (
        <Box component={RouterLink} to={href} sx={{ ...LINK_SX, fontSize: 12.5 }}>
          Open Revision {revision?.RevisionNum}
        </Box>
      ) : null}
      {!revisions.isLoading && !href ? (
        <Typography sx={{ fontSize: 12, color: T.ink3 }}>
          The Revision no longer exists, or you cannot read it.
        </Typography>
      ) : null}
    </>
  );
}

function WhatChanged({
  event,
  spaceSlugById,
}: {
  event: AuditEventRead;
  spaceSlugById: ReadonlyMap<string, string>;
}) {
  const changedFields = event.ChangedFields ?? [];
  const changed = new Set(changedFields);
  const hasDocuments = event.Before !== undefined || event.After !== undefined;
  const note = (text: string) => (
    <Typography sx={{ fontSize: 12, lineHeight: T.lh, color: T.ink2 }}>{text}</Typography>
  );

  let body: ReactNode;
  if (isFailure(event)) body = note('Nothing. The server did not do the action.');
  else if (event.RevisionID)
    body = <RevisionNote event={event} spaceSlugById={spaceSlugById} />;
  else if (hasDocuments)
    body = (
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: '10px',
        }}
      >
        <CodeBlock title='Before' lines={pretty(event.Before)} changed={changed} tone='del' />
        <CodeBlock title='After' lines={pretty(event.After)} changed={changed} tone='add' />
      </Box>
    );
  else if (event.HeadRevisionNum !== undefined && event.HeadRevisionNum !== null)
    body = note(`The Unit was at Revision ${event.HeadRevisionNum} when it was deleted.`);
  else if (changedFields.length === 0) body = note('This action changes no fields.');

  return (
    <Box>
      <Typography component='h4' sx={SECTION_HEAD_SX}>
        What changed
      </Typography>
      {changedFields.length > 0 && !isFailure(event) ? (
        <Stack direction='row' flexWrap='wrap' sx={{ gap: '6px', marginBottom: '10px' }}>
          {changedFields.map((field) => (
            <Box
              key={field}
              component='span'
              sx={{
                fontFamily: T.mono,
                fontSize: 11.5,
                lineHeight: T.lh,
                border: `1px solid ${T.lineStrong}`,
                borderRadius: '4px',
                padding: '0 6px',
                color: T.ink,
                background: T.surfaceSunk,
              }}
            >
              {field}
            </Box>
          ))}
        </Stack>
      ) : null}
      {body}
    </Box>
  );
}

export interface AuditEventDetailProps {
  event: AuditEventRead;
  spaceSlugById: ReadonlyMap<string, string>;
  spacesLoaded: boolean;
  principals: PrincipalNames;
  owner: OwnerLookup;
  /** Whether the list shows only this event's request already. */
  requestFiltered: boolean;
  /** How many loaded events have this event's RequestID. */
  requestCount: number;
  onShowRequest: (requestId: string) => void;
  id: string;
}

export function AuditEventDetail({
  event,
  spaceSlugById,
  spacesLoaded,
  principals,
  owner,
  requestFiltered,
  requestCount,
  onShowRequest,
  id,
}: AuditEventDetailProps) {
  const grants = event.Grants ?? [];
  const facts: [string, ReactNode][] = [];
  facts.push([
    'Occurred at',
    <Box component='span' sx={MONO_SX}>
      {event.OccurredAt}
    </Box>,
  ]);
  if (event.Error) {
    facts.push([
      'Error',
      <Box
        sx={{
          color: T.bad,
          background: T.badSoft,
          border: `1px solid ${T.badLine}`,
          borderRadius: '6px',
          padding: '5px 8px',
          fontFamily: T.mono,
          fontSize: 12,
        }}
      >
        {event.Error}
      </Box>,
    ]);
  }
  facts.push([
    'Role',
    event.Role ? (
      <>
        {orgRoleLabel(event.Role)}{' '}
        <Box component='span' sx={MUTED_SX}>
          (Organization role at the time)
        </Box>
      </>
    ) : (
      <Box component='span' sx={MUTED_SX}>
        None recorded
      </Box>
    ),
  ]);
  facts.push([
    'Grants',
    grants.length > 0 ? (
      <Stack sx={{ gap: '3px' }}>
        {grants.map((grant, index) => (
          <Stack
            key={index}
            direction='row'
            flexWrap='wrap'
            alignItems='baseline'
            sx={{ gap: '6px' }}
          >
            <Box
              component='span'
              sx={{
                fontSize: 10.5,
                fontWeight: 700,
                color: T.ink2,
                background: T.idleSoft,
                borderRadius: R_MICRO,
                padding: '0 5px',
              }}
            >
              {grant.Source ?? 'Grant'}
            </Box>
            <span>
              {grantText(grant, { event, spaceSlugById, spacesLoaded, principals, owner })}
            </span>
          </Stack>
        ))}
      </Stack>
    ) : (
      <Box component='span' sx={MUTED_SX}>
        {event.Outcome === 'Denied' ? 'None. No grant allows this action.' : 'None recorded'}
      </Box>
    ),
  ]);
  if (event.OnBehalfOfUserID)
    facts.push([
      'On behalf of',
      principalLabel(
        principals.user(event.OnBehalfOfUserID),
        principals.loaded,
        'A user who cannot be read',
      ),
    ]);
  facts.push([
    'Source IP',
    event.SourceIP ? (
      <Box component='span' sx={MONO_SX}>
        {event.SourceIP}
      </Box>
    ) : (
      <Box component='span' sx={MUTED_SX}>
        None (not an API request)
      </Box>
    ),
  ]);
  facts.push([
    'User agent',
    event.UserAgent ? (
      <Box component='span' sx={MONO_SX}>
        {event.UserAgent}
      </Box>
    ) : (
      <Box component='span' sx={MUTED_SX}>
        None
      </Box>
    ),
  ]);
  if (event.RequestID) {
    const requestId = event.RequestID;
    facts.push([
      'Request',
      <>
        {requestFiltered
          ? `${requestCount} ${requestCount === 1 ? 'event' : 'events'} in this request`
          : null}
        {!requestFiltered ? (
          <Box
            component='button'
            type='button'
            data-testid='audit-log-show-request'
            onClick={() => onShowRequest(requestId)}
            sx={{ all: 'unset', ...LINK_SX }}
          >
            Show all events in this request
          </Box>
        ) : null}
        <CopyButton text={requestId} label='Copy request ID' />
      </>,
    ]);
  }
  facts.push(['Origin', event.Origin ?? '']);

  return (
    <Box
      id={id}
      data-testid='audit-log-detail'
      sx={{
        borderBottom: `1px solid ${T.line}`,
        background: T.surface,
        padding: '14px 14px 16px 50px',
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)',
        gap: '18px 28px',
        '@media (max-width: 1000px)': {
          gridTemplateColumns: 'minmax(0, 1fr)',
          paddingLeft: '14px',
        },
      }}
    >
      <Box>
        <Typography component='h4' sx={SECTION_HEAD_SX}>
          Event
        </Typography>
        <Facts rows={facts} />
      </Box>
      <WhatChanged event={event} spaceSlugById={spaceSlugById} />
    </Box>
  );
}
