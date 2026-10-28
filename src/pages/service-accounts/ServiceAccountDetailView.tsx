// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * One ServiceAccount: whether it is in use and how, the keys and tokens it
 * authenticates with (each with when it was last used, and by whom a token was
 * issued), what it has been granted, and who controls it.
 *
 * What it can reach is its organization role, its Groups, and every entity whose
 * Permissions name it or one of its Groups.
 */

import { useMemo, useState } from 'react';
import { Link as RouterLink, useNavigate } from 'react-router-dom';

import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import BadgeOutlinedIcon from '@mui/icons-material/BadgeOutlined';
import CalendarTodayOutlinedIcon from '@mui/icons-material/CalendarTodayOutlined';
import FingerprintOutlinedIcon from '@mui/icons-material/FingerprintOutlined';
import HistoryOutlinedIcon from '@mui/icons-material/HistoryOutlined';

import {
  useDeleteServiceAccountUserKeyMutation,
  useDeleteServiceAccountUserTokenMutation,
  useGetUserQuery,
  useListServiceAccountUserKeysQuery,
  useListServiceAccountUserTokensQuery,
  useRevokeServiceAccountUserTokenMutation,
  type ServiceAccountRead,
  type UserKeyRead,
  type UserTokenRead,
} from '@confighub/rtk-query';

import {
  Cell,
  DetailRow,
  DetailTable,
  RowAction,
  SectionCard,
  StatusDot,
  When,
} from '@/components/console-detail/ConsoleDetail';
import { isSetTime, permissionSubjects, type DetailColumn } from '@/components/console-detail/consoleDetailUtil';
import { PermissionsList, PrincipalChip } from '@/components/console-detail/PermissionsList';
import { CopyToClipboard } from '@/components/copy-to-clipboard/CopyToClipboard';
import { SERVICE_ACCOUNTS_PATH, shortId, usePrincipalNames } from '@/hooks/usePrincipalNames';

import { Fact, OpenedAt, StateChip, SummaryCard } from '../change-orders/components/SummaryFacts';
import { consoleTokens as T, controlSx } from '../change-orders/consoleStyle';
import { CONNECTION, connectionOf } from '../channels/channelConnection';
import { ConfirmCredentialDialog, IssueTokenDialog, RegisterKeyDialog } from './CredentialDialogs';
import { orgRoleLabel } from './orgRoles';
import { DeleteServiceAccountDialog, EditServiceAccountDialog } from './ServiceAccountForms';
import { groupGrants, visibleGrants, type GrantGroup } from './grantGroups';
import { useListGrantsToQuery, type Grant } from './serviceAccountGrants';
import { ACTIVITY, keyExpired, lastUseText, tokenState, usageOf, type TokenState } from './serviceAccountUsage';

const KEY_COLUMNS: DetailColumn[] = [
  { label: 'Key', width: 'minmax(180px, 2fr)' },
  { label: 'Registered', width: 'minmax(90px, 1fr)' },
  { label: 'Last used', width: 'minmax(90px, 1fr)' },
  { label: 'Expires', width: 'minmax(80px, .8fr)' },
  { label: '', width: '70px', align: 'right' },
];

const TOKEN_COLUMNS: DetailColumn[] = [
  { label: 'Token', width: 'minmax(180px, 2fr)' },
  { label: 'Issued by', width: 'minmax(110px, 1fr)' },
  { label: 'Issued', width: 'minmax(90px, .9fr)' },
  { label: 'Last used', width: 'minmax(90px, .9fr)' },
  { label: 'Expires', width: 'minmax(80px, .8fr)' },
  { label: 'State', width: '76px' },
  { label: '', width: '70px', align: 'right' },
];

const TOKEN_STATE: Record<TokenState, { label: string; color: string; hollow: boolean }> = {
  live: { label: 'Live', color: T.ok, hollow: false },
  revoked: { label: 'Revoked', color: T.bad, hollow: true },
  expired: { label: 'Expired', color: T.ink3, hollow: true },
};

const SERVICE_ACCOUNT_ACTIONS: Record<string, string> = {
  Impersonate: 'Act as it: register keys, issue tokens',
  Manage: 'Change it and who controls it',
  Edit: 'Change its name and labels',
  View: 'See it and its credentials',
};

type Pending =
  | { kind: 'removeKey'; key: UserKeyRead }
  | { kind: 'revokeToken'; token: UserTokenRead }
  | { kind: 'deleteToken'; token: UserTokenRead };

export function ServiceAccountDetailView({ serviceAccount, now }: { serviceAccount: ServiceAccountRead; now: number }) {
  const navigate = useNavigate();
  const id = serviceAccount.ServiceAccountID ?? '';
  const userId = serviceAccount.UserID ?? '';
  const keysQuery = useListServiceAccountUserKeysQuery({ serviceAccountId: id }, { skip: id === '' });
  const tokensQuery = useListServiceAccountUserTokensQuery({ serviceAccountId: id }, { skip: id === '' });
  const keys = useMemo(() => (keysQuery.data ?? []).flatMap((entry) => (entry.UserKey ? [entry.UserKey] : [])), [keysQuery.data]);
  const tokens = useMemo(
    () =>
      (tokensQuery.data ?? [])
        .flatMap((entry) => (entry.UserToken ? [entry.UserToken] : []))
        .sort((a, b) => {
          const order = { live: 0, expired: 1, revoked: 2 };
          return order[tokenState(a, now)] - order[tokenState(b, now)] || (b.CreatedAt ?? '').localeCompare(a.CreatedAt ?? '');
        }),
    [tokensQuery.data, now],
  );
  const credentialsFailed = keysQuery.isError || tokensQuery.isError;
  const credentialsLoaded = keysQuery.data !== undefined && tokensQuery.data !== undefined;
  const usage = usageOf(credentialsLoaded ? { keys, tokens, failed: credentialsFailed } : undefined, now);
  const activity = ACTIVITY[usage.activity];

  const user = useGetUserQuery({ userId }, { skip: userId === '' });
  const groupIds = useMemo(() => user.data?.User?.GroupIDs ?? [], [user.data]);
  const grantsQuery = useListGrantsToQuery({ userId, groupIds, excludeId: id }, { skip: userId === '' || user.isLoading });

  const subjects = permissionSubjects(serviceAccount.Permissions);
  const names = usePrincipalNames(
    [...subjects.userIds, ...tokens.flatMap((token) => (token.CreatedByUserID ? [token.CreatedByUserID] : []))],
    [...subjects.groupIds, ...groupIds],
  );

  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [registering, setRegistering] = useState(false);
  const [issuing, setIssuing] = useState(false);
  const [pending, setPending] = useState<Pending>();
  const [removeKey] = useDeleteServiceAccountUserKeyMutation();
  const [revokeToken] = useRevokeServiceAccountUserTokenMutation();
  const [deleteToken] = useDeleteServiceAccountUserTokenMutation();

  const pendingDialog = (() => {
    if (pending === undefined) return null;
    if (pending.kind === 'removeKey') {
      const name = pending.key.Description || pending.key.Kid || pending.key.Slug;
      return {
        title: `Remove key ${name}?`,
        body: `Whatever signs with this key can no longer authenticate as ${serviceAccount.Slug}. ${
          isSetTime(pending.key.LastUsedAt) ? 'It was last used ' + new Date(pending.key.LastUsedAt).toLocaleString() + '.' : 'It has never been used.'
        }`,
        confirmLabel: 'Remove key',
        run: () => removeKey({ serviceAccountId: id, userKeyId: pending.key.UserKeyID ?? '' }).unwrap().then(() => undefined),
      };
    }
    if (pending.kind === 'revokeToken') {
      return {
        title: `Revoke token ${pending.token.Description || pending.token.Slug}?`,
        body: `The system holding it can no longer authenticate as ${serviceAccount.Slug}, within a minute. The record stays, marked revoked.`,
        confirmLabel: 'Revoke token',
        run: () => revokeToken({ serviceAccountId: id, userTokenId: pending.token.UserTokenID ?? '' }).unwrap().then(() => undefined),
      };
    }
    return {
      title: `Delete the record of ${pending.token.Description || pending.token.Slug}?`,
      body: 'The token no longer works; deleting its record removes it from this list.',
      confirmLabel: 'Delete record',
      run: () => deleteToken({ serviceAccountId: id, userTokenId: pending.token.UserTokenID ?? '' }).unwrap().then(() => undefined),
    };
  })();

  return (
    <>
      <SummaryCard label='Service account summary'>
        <Box sx={{ padding: '18px 20px', display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 200px', gap: '0 32px' }}>
          <Box sx={{ minWidth: 0 }}>
            <Stack direction='row' alignItems='center' sx={{ gap: '10px', flexWrap: 'wrap' }}>
              <Box component='h1' sx={{ fontSize: 21, lineHeight: 1.25, fontWeight: 650, fontFamily: T.mono, letterSpacing: '-0.015em', margin: 0, color: T.ink, overflowWrap: 'anywhere' }}>
                {serviceAccount.Slug}
              </Box>
              {credentialsLoaded ? <StateChip label={activity.label} tone={activity.color} /> : null}
            </Stack>
            {serviceAccount.DisplayName && serviceAccount.DisplayName !== serviceAccount.Slug ? (
              <Typography sx={{ fontSize: 13.5, color: T.ink2, marginTop: '6px' }}>{serviceAccount.DisplayName}</Typography>
            ) : null}
            <Box component='dl' sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '14px', margin: '16px 0 0' }}>
              <Fact term='Last used' icon={HistoryOutlinedIcon}>
                <span data-testid='service-account-last-used'>
                  {usage.lastUse ? (
                    <>
                      <When value={usage.lastUse.at} />
                      <Box component='span' sx={{ color: T.ink3 }}>
                        {' '}
                        by {lastUseText(usage.lastUse)}
                      </Box>
                    </>
                  ) : credentialsLoaded ? (
                    'Never'
                  ) : (
                    '—'
                  )}
                </span>
              </Fact>
              <Fact term='Org role' icon={BadgeOutlinedIcon}>
                {orgRoleLabel(serviceAccount.OrgRole)}
              </Fact>
              <Fact term='Created' icon={CalendarTodayOutlinedIcon}>
                <OpenedAt value={serviceAccount.CreatedAt} />
              </Fact>
              <Fact term='User ID' icon={FingerprintOutlinedIcon}>
                <Stack direction='row' alignItems='center' sx={{ gap: '2px' }}>
                  <Box component='span' title={userId} sx={{ fontFamily: T.mono, fontSize: 12.5 }}>
                    {shortId(userId)}
                  </Box>
                  {userId ? <CopyToClipboard text={userId} title='Copy the User ID that Permissions name it by' /> : null}
                </Stack>
              </Fact>
            </Box>
          </Box>
          <Stack sx={{ gap: '8px' }}>
            <Button variant='outlined' size='small' onClick={() => setEditing(true)} data-testid='service-account-edit'>
              Edit
            </Button>
            <Button variant='outlined' size='small' color='error' onClick={() => setDeleting(true)} data-testid='service-account-delete'>
              Delete
            </Button>
          </Stack>
        </Box>
      </SummaryCard>

      {credentialsFailed ? (
        <Box role='alert' sx={{ marginTop: '16px', border: `1px solid ${T.badLine}`, background: T.badSoft, borderRadius: '8px', padding: '10px 12px', fontSize: 12.5, color: T.bad }}>
          Its keys and tokens could not be read. Seeing them requires View on the service account.
        </Box>
      ) : null}

      <SectionCard
        title='Keys'
        testId='service-account-keys'
        subtitle='Public keys whose private halves sign the assertions it logs in with. Preferred over tokens wherever the holder can sign.'
        action={
          <Box component='button' type='button' onClick={() => setRegistering(true)} sx={controlSx('quiet', true)} data-testid='service-account-register-key'>
            Register key
          </Box>
        }
      >
        <DetailTable columns={KEY_COLUMNS} rowCount={keys.length} emptyText={keysQuery.isLoading ? 'Loading…' : 'No keys registered.'}>
          {keys.map((key) => {
            const expired = keyExpired(key, now);
            return (
              <DetailRow key={key.UserKeyID} columns={KEY_COLUMNS} muted={expired} testId='service-account-key-row'>
                <Box sx={{ minWidth: 0 }}>
                  <Cell title={key.Description}>{key.Description || 'No description'}</Cell>
                  <Box sx={{ display: 'block' }}>
                    <Cell mono muted title={key.Kid}>
                      {key.Kid}
                    </Cell>
                  </Box>
                </Box>
                <Cell>
                  <When value={key.CreatedAt} never='—' />
                </Cell>
                <Cell>
                  <When value={key.LastUsedAt} />
                </Cell>
                <Cell muted={!isSetTime(key.ExpiresAt)}>
                  {expired ? 'Expired' : <When value={key.ExpiresAt} never='Never' />}
                </Cell>
                <Box sx={{ textAlign: 'right' }}>
                  <RowAction danger onClick={() => setPending({ kind: 'removeKey', key })} testId='service-account-remove-key'>
                    Remove
                  </RowAction>
                </Box>
              </DetailRow>
            );
          })}
        </DetailTable>
      </SectionCard>

      <SectionCard
        title='Tokens'
        testId='service-account-tokens'
        subtitle='Long-lived tokens for systems that can hold only a static secret. ConfigHub keeps a record of each. Tokens are not stored by ConfigHub.'
        action={
          <Box component='button' type='button' onClick={() => setIssuing(true)} sx={controlSx('quiet', true)} data-testid='service-account-issue-token'>
            Issue token
          </Box>
        }
      >
        <DetailTable columns={TOKEN_COLUMNS} rowCount={tokens.length} emptyText={tokensQuery.isLoading ? 'Loading…' : 'No tokens issued.'}>
          {tokens.map((token) => {
            const state = tokenState(token, now);
            const stateStyle = TOKEN_STATE[state];
            const issuer = token.CreatedByUserID ? names.user(token.CreatedByUserID) : undefined;
            return (
              <DetailRow key={token.UserTokenID} columns={TOKEN_COLUMNS} muted={state !== 'live'} testId='service-account-token-row'>
                <Box sx={{ minWidth: 0 }}>
                  <Cell title={token.Description}>{token.Description || 'No description'}</Cell>
                  <Box sx={{ display: 'block' }}>
                    <Cell mono muted title={token.Jti}>
                      {token.Jti ? shortId(token.Jti) : token.Slug}
                    </Cell>
                  </Box>
                </Box>
                <Cell title={issuer?.id}>{issuer ? `${issuer.name}${issuer.isYou ? ' (you)' : ''}` : '—'}</Cell>
                <Cell>
                  <When value={token.CreatedAt} never='—' />
                </Cell>
                <Cell>
                  <When value={token.LastUsedAt} />
                </Cell>
                <Cell muted={!isSetTime(token.ExpiresAt)}>
                  <When value={token.ExpiresAt} never='Never' />
                </Cell>
                <StatusDot color={stateStyle.color} hollow={stateStyle.hollow} label={stateStyle.label} />
                <Box sx={{ textAlign: 'right' }}>
                  {state === 'live' ? (
                    <RowAction danger onClick={() => setPending({ kind: 'revokeToken', token })} testId='service-account-revoke-token'>
                      Revoke
                    </RowAction>
                  ) : (
                    <RowAction onClick={() => setPending({ kind: 'deleteToken', token })} testId='service-account-delete-token'>
                      Delete
                    </RowAction>
                  )}
                </Box>
              </DetailRow>
            );
          })}
        </DetailTable>
      </SectionCard>

      <SectionCard
        title='What it can reach'
        testId='service-account-access'
        subtitle='Its organization role, its Groups, and everything whose Permissions name it or one of its Groups, as far as you can see.'
      >
        <Stack sx={{ gap: '14px' }}>
          <AccessLine label='Org role'>
            <Typography sx={{ fontSize: 12.5, color: T.ink }}>
              {orgRoleLabel(serviceAccount.OrgRole)}
              {(serviceAccount.OrgRole || 'none') === 'none' ? (
                <Box component='span' sx={{ color: T.ink3 }}>
                  {' '}
                  · only what is granted to it
                </Box>
              ) : null}
            </Typography>
          </AccessLine>
          <AccessLine label='Groups'>
            {groupIds.length === 0 ? (
              <Typography sx={{ fontSize: 12.5, color: T.ink3 }}>{user.isLoading ? '…' : 'None'}</Typography>
            ) : (
              <Stack direction='row' flexWrap='wrap' useFlexGap sx={{ gap: '6px' }}>
                {groupIds.map((groupId) => (
                  <PrincipalChip key={groupId} principal={names.group(groupId)} />
                ))}
              </Stack>
            )}
          </AccessLine>
          <AccessLine label='Granted on'>
            <GrantsTable grants={grantsQuery.data} loading={grantsQuery.isLoading} failed={grantsQuery.isError} names={names} now={now} />
          </AccessLine>
        </Stack>
      </SectionCard>

      <SectionCard title='Who controls it' testId='service-account-permissions' subtitle='Permissions on the service account itself. Impersonate is what lets someone act as it.'>
        <PermissionsList permissions={serviceAccount.Permissions} names={names} describe={SERVICE_ACCOUNT_ACTIONS} />
      </SectionCard>

      <RegisterKeyDialog serviceAccountId={id} slug={serviceAccount.Slug} open={registering} onClose={() => setRegistering(false)} />
      <IssueTokenDialog serviceAccountId={id} slug={serviceAccount.Slug} open={issuing} onClose={() => setIssuing(false)} />
      <EditServiceAccountDialog serviceAccount={serviceAccount} open={editing} onClose={() => setEditing(false)} />
      <DeleteServiceAccountDialog
        serviceAccount={serviceAccount}
        credentialCount={usage.liveKeys + usage.liveTokens}
        open={deleting}
        onClose={() => setDeleting(false)}
        onDeleted={() => navigate(SERVICE_ACCOUNTS_PATH)}
      />
      {pendingDialog ? (
        <ConfirmCredentialDialog
          open
          title={pendingDialog.title}
          body={pendingDialog.body}
          confirmLabel={pendingDialog.confirmLabel}
          onClose={() => setPending(undefined)}
          onConfirm={pendingDialog.run}
        />
      ) : null}
    </>
  );
}

function AccessLine({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: '150px minmax(0, 1fr)', gap: '12px', alignItems: 'baseline' }}>
      <Typography sx={{ fontSize: 12.5, fontWeight: 650, color: T.ink }}>{label}</Typography>
      <Box sx={{ minWidth: 0 }}>{children}</Box>
    </Box>
  );
}

const GRANT_COLUMNS: DetailColumn[] = [
  { label: 'Type', width: 'minmax(90px, .7fr)' },
  { label: 'Entity', width: 'minmax(180px, 2fr)' },
  { label: 'Permissions', width: 'minmax(220px, 2.4fr)' },
];

/**
 * The entities whose Permissions name the account, with what they grant it and which of that comes through a Group.
 * Past a few, similar grants (see `grantGroups.ts`) are counted in a row that shows them all.
 */
function GrantsTable({
  grants,
  loading,
  failed,
  names,
  now,
}: {
  grants: { grants: Grant[]; unreadable: string[]; searchedOnly?: string[] } | undefined;
  loading: boolean;
  failed: boolean;
  names: ReturnType<typeof usePrincipalNames>;
  now: number;
}) {
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set());
  const groups = useMemo(() => groupGrants(grants?.grants ?? []), [grants]);
  if (loading) return <Typography sx={{ fontSize: 12.5, color: T.ink3 }}>…</Typography>;
  if (failed || grants === undefined) return <Typography sx={{ fontSize: 12.5, color: T.bad }}>The grants could not be read.</Typography>;

  // A permission held only through Groups says which; one granted directly needs no note.
  const permissionsOf = (grant: Grant) =>
    grant.actions.map((a) => (a.direct ? a.action : `${a.action} via ${a.groupIds.map((groupId) => names.group(groupId).name).join(', ')}`)).join(' · ');

  const grantRow = (grant: Grant) => {
    const permissions = permissionsOf(grant);
    const connection = grant.entityType === 'Channel' ? CONNECTION[connectionOf(grant.entity as ChannelLike, now)] : undefined;
    return (
      <DetailRow key={`${grant.entityType}:${grant.id}`} columns={GRANT_COLUMNS} testId='service-account-grant-row'>
        <Cell muted>{grant.entityType}</Cell>
        <Box sx={{ minWidth: 0, display: 'flex', alignItems: 'center', gap: '10px' }}>
          {grant.href ? (
            <Box
              component={RouterLink}
              to={grant.href}
              title={grant.displayName ?? grant.name}
              sx={{ fontFamily: T.mono, fontSize: 12.5, fontWeight: 600, color: T.action, textDecoration: 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', '&:hover': { textDecoration: 'underline' } }}
            >
              {grant.name}
            </Box>
          ) : (
            <Cell mono title={grant.displayName ?? grant.name}>
              {grant.name}
            </Cell>
          )}
          {connection ? <StatusDot color={connection.color} hollow={connection.hollow} label={connection.label} /> : null}
        </Box>
        <Cell title={permissions}>{permissions}</Cell>
      </DetailRow>
    );
  };

  const moreRow = (group: GrantGroup, hidden: number) => {
    const permissions = permissionsOf(group.grants[0]);
    return (
      <DetailRow key={`more:${group.key}`} columns={GRANT_COLUMNS} testId='service-account-grant-more' muted>
        <Cell muted>{group.entityType}</Cell>
        <Box sx={{ minWidth: 0, display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Cell muted>
            {hidden} more{group.spaceSlug ? ` in ${group.spaceSlug}` : ''}
          </Cell>
          <RowAction onClick={() => setExpanded((keys) => new Set(keys).add(group.key))} testId='service-account-grant-show-all'>
            Show all
          </RowAction>
        </Box>
        <Cell muted title={permissions}>
          {permissions}
        </Cell>
      </DetailRow>
    );
  };

  return (
    <Stack sx={{ gap: '6px' }}>
      <DetailTable columns={GRANT_COLUMNS} rowCount={grants.grants.length} emptyText='Nothing names it in its Permissions.' testId='service-account-grants'>
        {groups.flatMap((group) => {
          const { shown, hidden } = visibleGrants(group, expanded.has(group.key));
          return hidden > 0 ? [...shown.map(grantRow), moreRow(group, hidden)] : shown.map(grantRow);
        })}
      </DetailTable>
      {grants.searchedOnly ? (
        <Typography sx={{ fontSize: 11.5, color: T.ink3 }} data-testid='service-account-grants-partial'>
          Only {pluralList(grants.searchedOnly)} are searched. This server cannot yet search the other entity types by who they grant.
        </Typography>
      ) : null}
      {grants.unreadable.length > 0 ? (
        <Typography sx={{ fontSize: 11.5, color: T.ink3 }}>Could not read: {grants.unreadable.join(', ')}.</Typography>
      ) : null}
    </Stack>
  );
}

type ChannelLike = Parameters<typeof connectionOf>[0];

/** "Spaces, Components and Channels". */
function pluralList(labels: string[]): string {
  const plurals = labels.map((label) => `${label}s`);
  return plurals.length < 2 ? plurals.join('') : `${plurals.slice(0, -1).join(', ')} and ${plurals[plurals.length - 1]}`;
}
