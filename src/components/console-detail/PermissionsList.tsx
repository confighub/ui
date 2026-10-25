// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import { Link as RouterLink } from 'react-router-dom';

import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';

import type { Permissions } from '@confighub/rtk-query';

import type { Principal, PrincipalNames } from '@/hooks/usePrincipalNames';
import { consoleTokens as T } from '@/pages/change-orders/consoleStyle';

const KIND_LABEL: Record<Principal['kind'], string> = { user: 'user', serviceAccount: 'service account', group: 'group' };

export function PrincipalChip({ principal }: { principal: Principal }) {
  const body = (
    <>
      <Box component='span' sx={{ fontWeight: 600, color: T.ink }}>
        {principal.name}
        {principal.isYou ? ' (you)' : ''}
      </Box>
      <Box component='span' sx={{ color: T.ink3, marginLeft: '5px' }}>
        {KIND_LABEL[principal.kind]}
      </Box>
    </>
  );
  const sx = {
    display: 'inline-flex',
    alignItems: 'baseline',
    padding: '2px 8px',
    border: `1px solid ${T.line}`,
    borderRadius: '6px',
    background: T.surface,
    fontSize: 12,
    lineHeight: T.lh,
    textDecoration: 'none',
    whiteSpace: 'nowrap',
  } as const;
  if (principal.href === undefined) {
    return (
      <Box component='span' title={principal.id} sx={sx}>
        {body}
      </Box>
    );
  }
  return (
    <Box
      component={RouterLink}
      to={principal.href}
      title={principal.id}
      sx={{ ...sx, transition: 'border-color .12s, background .12s', '&:hover': { borderColor: T.accent, background: T.accentSoft } }}
    >
      {body}
    </Box>
  );
}

/**
 * Who holds each action of a Permissions map, one line per action. `describe`
 * says what an action lets its holder do, for the actions a page knows about.
 */
export function PermissionsList({
  permissions,
  names,
  describe,
  testId,
}: {
  permissions: Permissions | undefined;
  names: PrincipalNames;
  describe?: Record<string, string>;
  testId?: string;
}) {
  const actions = Object.entries(permissions ?? {})
    .map(([action, subjects]) => ({
      action,
      principals: [
        ...Object.entries(subjects.UserIDs ?? {}).flatMap(([id, on]) => (on ? [names.user(id)] : [])),
        ...Object.entries(subjects.GroupIDs ?? {}).flatMap(([id, on]) => (on ? [names.group(id)] : [])),
      ],
    }))
    .filter((entry) => entry.principals.length > 0)
    .sort((a, b) => a.action.localeCompare(b.action));

  if (actions.length === 0) {
    return (
      <Typography data-testid={testId} sx={{ fontSize: 12.5, lineHeight: T.lh, color: T.ink3 }}>
        No one is granted access here; organization roles decide who can use it.
      </Typography>
    );
  }
  return (
    <Stack data-testid={testId} sx={{ gap: '10px' }}>
      {actions.map(({ action, principals }) => (
        <Box key={action} sx={{ display: 'grid', gridTemplateColumns: '150px minmax(0, 1fr)', gap: '12px', alignItems: 'baseline' }}>
          <Box>
            <Typography sx={{ fontSize: 12.5, fontWeight: 650, color: T.ink }}>{action}</Typography>
            {describe?.[action] ? <Typography sx={{ fontSize: 11.5, lineHeight: T.lh, color: T.ink3 }}>{describe[action]}</Typography> : null}
          </Box>
          <Stack direction='row' flexWrap='wrap' useFlexGap sx={{ gap: '6px' }}>
            {principals.map((principal) => (
              <PrincipalChip key={`${principal.kind}:${principal.id}`} principal={principal} />
            ))}
          </Stack>
        </Box>
      ))}
    </Stack>
  );
}
