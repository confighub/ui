// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * One Channel: whether a bot is connected to it now, when it last polled, from
 * where and what it last reported; who may claim it and run commands on it; the
 * commands it declares and the events it subscribes to; and the commands run on
 * it this week, with who ran them and how each ended.
 *
 * Commands and Subscriptions are edited as the Channel's document, the YAML that
 * `cub channel edit` opens, so the page and the CLI change the same thing.
 */

import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import CalendarTodayOutlinedIcon from '@mui/icons-material/CalendarTodayOutlined';
import FolderOutlinedIcon from '@mui/icons-material/FolderOutlined';
import HistoryOutlinedIcon from '@mui/icons-material/HistoryOutlined';
import LanOutlinedIcon from '@mui/icons-material/LanOutlined';
import TimerOutlinedIcon from '@mui/icons-material/TimerOutlined';

import {
  useGetChannelDocumentQuery,
  useListAllTargetsQuery,
  useListCommandRunsQuery,
  useListSpacesQuery,
  useUpdateChannelDocumentMutation,
  type ChannelRead,
  type CommandRunRead,
} from '@confighub/rtk-query';

import { CodeEditor } from '@/components/code-editor/CodeEditor';
import { Cell, DetailRow, DetailTable, SectionCard, StatusDot, When } from '@/components/console-detail/ConsoleDetail';
import { isSetTime, permissionSubjects, timeOf, type DetailColumn } from '@/components/console-detail/consoleDetailUtil';
import { PermissionsList } from '@/components/console-detail/PermissionsList';
import { usePrincipalNames } from '@/hooks/usePrincipalNames';
import { getApiErrorMessage } from '@/utility/error-functions';

import { Fact, FactLink, OpenedAt, StateChip, SummaryCard } from '../change-orders/components/SummaryFacts';
import { consoleTokens as T, elapsed } from '../change-orders/consoleStyle';
import { CHANNELS_PATH } from './channelAddress';
import { CONNECTION, connectionOf } from './channelConnection';
import { DeleteChannelDialog } from './ChannelForms';

const RUN_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const RUNS_SHOWN = 25;

const CHANNEL_ACTIONS: Record<string, string> = {
  Claim: 'Connect as its bot: take the lease and poll',
  Use: 'Run its commands',
  Manage: 'Change it and who may claim it',
  Edit: 'Change its commands and subscriptions',
  View: 'See it',
};

const COMMAND_COLUMNS: DetailColumn[] = [
  { label: 'Command', width: 'minmax(180px, 1.2fr)' },
  { label: 'Description', width: 'minmax(200px, 2fr)' },
  { label: 'Options', width: 'minmax(140px, 1.2fr)' },
];

const SUBSCRIPTION_COLUMNS: DetailColumn[] = [
  { label: 'Events', width: 'minmax(200px, 2fr)' },
  { label: 'Space', width: 'minmax(120px, 1fr)' },
  { label: 'Target', width: 'minmax(120px, 1fr)' },
];

const RUN_COLUMNS: DetailColumn[] = [
  { label: 'Command', width: 'minmax(160px, 1.3fr)' },
  { label: 'Status', width: '110px' },
  { label: 'Run by', width: 'minmax(110px, 1fr)' },
  { label: 'Started', width: 'minmax(90px, .8fr)' },
  { label: 'Took', width: '60px', align: 'right' },
  { label: 'Error', width: 'minmax(140px, 1.6fr)' },
];

const RUN_STATUS_COLOR: Record<string, string> = {
  Completed: T.ok,
  Pending: T.accent,
  Delivered: T.accent,
  Failed: T.bad,
  Rejected: T.bad,
  TimedOut: T.bad,
  Expired: T.wait,
  Canceled: T.ink3,
};

function tookText(run: CommandRunRead): string {
  const started = timeOf(run.CreatedAt);
  const ended = timeOf(run.CompletedAt);
  if (started === undefined || ended === undefined) return '';
  const ms = ended - started;
  return ms < 60_000 ? `${Math.max(0, Math.round(ms / 1000))}s` : elapsed(ms);
}

export function ChannelDetailView({ channel, now }: { channel: ChannelRead; now: number }) {
  const navigate = useNavigate();
  const spaceId = channel.SpaceID ?? '';
  const channelId = channel.ChannelID ?? '';
  const connection = connectionOf(channel, now);
  const style = CONNECTION[connection];

  // Fixed for the page's life, so the runs read is one cache entry rather than one per tick.
  const [since] = useState(() => new Date(Date.now() - RUN_WINDOW_MS).toISOString());
  const runsQuery = useListCommandRunsQuery(
    { spaceId, where: `ChannelID = '${channelId}' AND CreatedAt > '${since}'` },
    { skip: spaceId === '' || channelId === '', pollingInterval: 30_000 },
  );
  const runs = useMemo(
    () =>
      (runsQuery.data ?? [])
        .flatMap((entry) => (entry.CommandRun ? [entry.CommandRun] : []))
        .sort((a, b) => (b.CreatedAt ?? '').localeCompare(a.CreatedAt ?? '')),
    [runsQuery.data],
  );

  const subscriptions = channel.Subscriptions ?? [];
  const needsNames = subscriptions.some((s) => s.SpaceID || s.TargetID);
  const spaces = useListSpacesQuery({ select: 'SpaceID,Slug' }, { skip: !needsNames });
  const targets = useListAllTargetsQuery({}, { skip: !subscriptions.some((s) => s.TargetID) });
  const spaceName = (id: string) => spaces.data?.find((entry) => entry.Space?.SpaceID === id)?.Space?.Slug ?? id;
  const targetName = (id: string) => {
    const target = targets.data?.find((entry) => entry.Target?.TargetID === id);
    return target?.Target ? `${target.Space?.Slug ? `${target.Space.Slug}/` : ''}${target.Target.Slug}` : id;
  };

  const subjects = permissionSubjects(channel.Permissions);
  const names = usePrincipalNames(
    [...subjects.userIds, ...runs.flatMap((run) => (run.CreatedBy ? [run.CreatedBy] : []))],
    subjects.groupIds,
  );

  const runCounts = useMemo(() => {
    const counts = { ok: 0, failed: 0, open: 0 };
    for (const run of runs) {
      if (run.Status === 'Completed') counts.ok += 1;
      else if (run.Status === 'Pending' || run.Status === 'Delivered') counts.open += 1;
      else counts.failed += 1;
    }
    return counts;
  }, [runs]);

  const commands = Object.entries(channel.Commands ?? {}).sort(([a], [b]) => a.localeCompare(b));
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);

  return (
    <>
      <SummaryCard label='Channel summary'>
        <Box sx={{ padding: '18px 20px', display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 200px', gap: '0 32px' }}>
          <Box sx={{ minWidth: 0 }}>
            <Stack direction='row' alignItems='center' sx={{ gap: '10px', flexWrap: 'wrap' }}>
              <Box component='h1' sx={{ fontSize: 21, lineHeight: 1.25, fontWeight: 650, fontFamily: T.mono, letterSpacing: '-0.015em', margin: 0, color: T.ink, overflowWrap: 'anywhere' }}>
                {channel.Slug}
              </Box>
              <Box data-testid='channel-connection'>
                <StateChip label={style.label} tone={style.color} />
              </Box>
            </Stack>
            {channel.DisplayName && channel.DisplayName !== channel.Slug ? (
              <Typography sx={{ fontSize: 13.5, color: T.ink2, marginTop: '6px' }}>{channel.DisplayName}</Typography>
            ) : null}
            <Box component='dl' sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '14px', margin: '16px 0 0' }}>
              <Fact term='Space' icon={FolderOutlinedIcon}>
                <FactLink href={`/spaces/${spaceId}`}>{channel.SpaceSlug ?? spaceId}</FactLink>
              </Fact>
              <Fact term='Last poll' icon={HistoryOutlinedIcon}>
                <span data-testid='channel-last-seen'>
                  <When value={channel.LastSeenAt} />
                </span>
              </Fact>
              <Fact term='Polling from' icon={LanOutlinedIcon}>
                <Box component='span' sx={{ fontFamily: T.mono, fontSize: 12.5 }}>
                  {channel.IPAddress || '—'}
                </Box>
              </Fact>
              <Fact term='Lease' icon={TimerOutlinedIcon}>
                {channel.Condition === 'Claimed' ? 'Claimed' : 'Not claimed'}
                <Box component='span' sx={{ color: T.ink3 }}>
                  {` · ${channel.ClaimTTLSeconds ?? 60}s TTL`}
                </Box>
              </Fact>
              <Fact term='Created' icon={CalendarTodayOutlinedIcon}>
                <OpenedAt value={channel.CreatedAt} />
              </Fact>
            </Box>
            {channel.LastMessage ? (
              <Box sx={{ marginTop: '14px', padding: '8px 12px', background: T.surfaceSunk, border: `1px solid ${T.line}`, borderRadius: '8px' }}>
                <Typography sx={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: T.ink3 }}>Last message from the bot</Typography>
                <Typography data-testid='channel-last-message' sx={{ fontSize: 12.5, color: T.ink, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
                  {channel.LastMessage}
                </Typography>
              </Box>
            ) : null}
            {connection === 'lapsed' ? (
              <Alert severity='warning' sx={{ marginTop: '14px' }}>
                The lease is held but the bot has not polled for {isSetTime(channel.LastSeenAt) ? elapsed(now - Date.parse(channel.LastSeenAt)) : 'a while'}. It
                stopped without releasing the lease; the next claim takes it over.
              </Alert>
            ) : null}
          </Box>
          <Stack sx={{ gap: '8px' }}>
            <Button variant='outlined' size='small' onClick={() => setEditing(true)} data-testid='channel-edit-document'>
              Edit document
            </Button>
            <Button variant='outlined' size='small' color='error' onClick={() => setDeleting(true)} data-testid='channel-delete'>
              Delete
            </Button>
          </Stack>
        </Box>
      </SummaryCard>

      <SectionCard
        title='Who connects'
        testId='channel-permissions'
        subtitle='Holders of Claim may connect as its bot, normally one service account. ConfigHub records where the bot polls from, not which holder it is.'
      >
        <PermissionsList permissions={channel.Permissions} names={names} describe={CHANNEL_ACTIONS} />
      </SectionCard>

      <SectionCard
        title='Commands run this week'
        testId='channel-runs'
        subtitle={
          runs.length === 0
            ? undefined
            : `${runCounts.ok} completed, ${runCounts.failed} did not${runCounts.open > 0 ? `, ${runCounts.open} waiting for the bot` : ''}.${
                runs.length > RUNS_SHOWN ? ` The latest ${RUNS_SHOWN} are shown.` : ''
              }`
        }
      >
        <DetailTable columns={RUN_COLUMNS} rowCount={runs.length} emptyText={runsQuery.isLoading ? 'Loading…' : 'No commands were run on it in the last 7 days.'}>
          {runs.slice(0, RUNS_SHOWN).map((run) => {
            const caller = run.CreatedBy ? names.user(run.CreatedBy) : undefined;
            return (
              <DetailRow key={run.CommandRunID} columns={RUN_COLUMNS} testId='channel-run-row'>
                <Cell mono title={run.Command}>
                  {run.Command}
                </Cell>
                <StatusDot color={RUN_STATUS_COLOR[run.Status ?? ''] ?? T.ink3} label={run.Status ?? '—'} />
                <Cell title={caller?.id}>{caller ? `${caller.name}${caller.isYou ? ' (you)' : ''}` : '—'}</Cell>
                <Cell>
                  <When value={run.CreatedAt} never='—' />
                </Cell>
                <Cell align='right' muted>
                  {tookText(run)}
                </Cell>
                <Cell title={run.ErrorMessage} muted={!run.ErrorMessage}>
                  {run.ErrorMessage || ''}
                </Cell>
              </DetailRow>
            );
          })}
        </DetailTable>
      </SectionCard>

      <SectionCard title='Commands' testId='channel-commands' subtitle='What callers can run on it. The bot checks its handlers against these when it connects.'>
        <DetailTable columns={COMMAND_COLUMNS} rowCount={commands.length} emptyText='It declares no commands.'>
          {commands.map(([name, signature]) => {
            const options = signature.Options ?? [];
            const optionText = options.map((option) => `${option.Name ?? ''}${option.Required ? '*' : ''}`).join(', ');
            return (
              <DetailRow key={name} columns={COMMAND_COLUMNS}>
                <Cell mono title={name}>
                  {name}
                </Cell>
                <Cell title={signature.Description}>{signature.Description || ''}</Cell>
                <Cell mono muted={options.length === 0} title={options.map((o) => `${o.Name}: ${o.DataType ?? ''}${o.Required ? ' (required)' : ''}${o.Description ? ` — ${o.Description}` : ''}`).join('\n')}>
                  {options.length === 0 ? 'None' : optionText}
                </Cell>
              </DetailRow>
            );
          })}
        </DetailTable>
      </SectionCard>

      <SectionCard
        title='Subscriptions'
        testId='channel-subscriptions'
        subtitle={`Events delivered to the bot. It has read the event log up to position ${channel.EventPosition}.`}
      >
        <DetailTable columns={SUBSCRIPTION_COLUMNS} rowCount={subscriptions.length} emptyText='It subscribes to no events.'>
          {subscriptions.map((subscription, index) => (
            <DetailRow key={index} columns={SUBSCRIPTION_COLUMNS}>
              <Cell mono title={(subscription.EventTypes ?? []).join(', ')}>
                {(subscription.EventTypes ?? []).length === 0 ? 'All events' : (subscription.EventTypes ?? []).join(', ')}
              </Cell>
              <Cell mono muted={!subscription.SpaceID}>
                {subscription.SpaceID ? spaceName(subscription.SpaceID) : 'Any'}
              </Cell>
              <Cell mono muted={!subscription.TargetID}>
                {subscription.TargetID ? targetName(subscription.TargetID) : 'Any'}
              </Cell>
            </DetailRow>
          ))}
        </DetailTable>
      </SectionCard>

      {editing ? <ChannelDocumentDialog channel={channel} onClose={() => setEditing(false)} /> : null}
      <DeleteChannelDialog
        channel={channel}
        connected={connection === 'connected'}
        open={deleting}
        onClose={() => setDeleting(false)}
        onDeleted={() => navigate(CHANNELS_PATH)}
      />
    </>
  );
}

/**
 * The Channel's document in an editor. Saving sends the document as read with
 * the edit, so a change someone made meanwhile is refused rather than overwritten.
 */
function ChannelDocumentDialog({ channel, onClose }: { channel: ChannelRead; onClose: () => void }) {
  const ids = { spaceId: channel.SpaceID ?? '', channelId: channel.ChannelID ?? '' };
  const documentQuery = useGetChannelDocumentQuery(ids, { refetchOnMountOrArgChange: true });
  const [save, { isLoading }] = useUpdateChannelDocumentMutation();
  const [draft, setDraft] = useState<string>();
  const [error, setError] = useState<string>();
  const base = documentQuery.data?.Document;
  const text = draft ?? base ?? '';

  const submit = async () => {
    if (base === undefined || documentQuery.data === undefined) return;
    setError(undefined);
    try {
      await save({ ...ids, entityDocumentEdit: { Base: base, Document: text, Version: documentQuery.data.Version } }).unwrap();
      onClose();
    } catch (e: unknown) {
      setError(getApiErrorMessage(e) || 'The document could not be saved.');
    }
  };

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth='lg'>
      <DialogTitle>
        Edit {channel.SpaceSlug}/{channel.Slug}
      </DialogTitle>
      <DialogContent>
        <Typography variant='body2' color='text.secondary' sx={{ mb: 1.5 }}>
          The same document <code>cub channel edit</code> opens: its Commands, Subscriptions, Permissions, Labels and Annotations.
        </Typography>
        {documentQuery.isError ? <Alert severity='error'>{getApiErrorMessage(documentQuery.error) || 'The document could not be read.'}</Alert> : null}
        {base !== undefined ? (
          <Box sx={{ border: `1px solid ${T.line}`, borderRadius: '8px', overflow: 'hidden' }} data-testid='channel-document-editor'>
            <CodeEditor value={base} language='yaml' height='55vh' canEdit showMinimap={false} onCodeChanged={setDraft} />
          </Box>
        ) : (
          !documentQuery.isError && <Typography sx={{ fontSize: 12.5, color: T.ink3 }}>Loading…</Typography>
        )}
        {error ? (
          <Alert severity='error' sx={{ mt: 2, whiteSpace: 'pre-wrap' }}>
            {error}
          </Alert>
        ) : null}
      </DialogContent>
      <DialogActions>
        <Button variant='outlined' onClick={onClose}>
          Cancel
        </Button>
        <Button
          variant='contained'
          onClick={() => void submit()}
          disabled={isLoading || base === undefined || draft === undefined || draft === base}
          data-testid='channel-document-save'
        >
          Save
        </Button>
      </DialogActions>
    </Dialog>
  );
}
