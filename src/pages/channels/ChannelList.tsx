// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * Every Channel the viewer can see, as the ChangeSets list shows ChangeSets.
 *
 * A row says whether a bot is connected to the Channel now, when it last polled
 * and from where, what it last reported, and who may claim it, so a bot that has
 * gone quiet stands out. Lapsed leases come first, as the ones to look at, then
 * connected Channels, then the rest, until a column head is clicked to sort by it.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link as RouterLink, useNavigate } from 'react-router-dom';

import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';

import { useListAllChannelsQuery, type ChannelRead } from '@confighub/rtk-query';

import { StatusDot, When } from '@/components/console-detail/ConsoleDetail';
import { ConsoleTable, type ConsoleTableColumn } from '@/components/console-table/ConsoleTable';
import { usePrincipalNames } from '@/hooks/usePrincipalNames';

import {
  ConsoleClearButton,
  ConsoleEmpty,
  ConsoleFilterBar,
  ConsoleFooter,
  ConsoleIntro,
  ConsoleSearch,
  ConsoleSelectFilter,
  ConsoleTitleRow,
} from '../change-orders/components/ConsoleParts';
import { KpiStrip, type KpiCard } from '../change-orders/components/KpiStrip';
import {
  KPI_ACTIVE_CARD_SX,
  KPI_CARD_SX,
  KPI_HINT_SX,
  KPI_LABEL_SX,
  KPI_NUM_SX,
  KPI_PARTIAL_CARD_SX,
  ABOVE_ROW_LINK_SX,
  ROW_LINK_SX,
  consoleTokens as T,
  controlSx,
  freshnessFrom,
} from '../change-orders/consoleStyle';
import { channelPath } from './channelAddress';
import { CONNECTION, claimantsOf, connectionOf, subscriptionSummary, type Connection } from './channelConnection';
import { CreateChannelDialog } from './ChannelForms';

/** A connected client renews its lease every poll, so the list reads again often enough to notice one leaving. */
const POLL_MS = 30_000;

const GRID = {
  gap: '0 14px',
  padding: '0 14px',
  display: 'grid',
  alignItems: 'center',
  gridTemplateColumns: 'minmax(170px, 1.2fr) minmax(220px, 1.6fr) minmax(140px, 1fr) minmax(150px, 1fr) minmax(70px, .4fr) 76px',
  '@media (max-width: 1200px)': {
    gridTemplateColumns: 'minmax(170px, 1fr) minmax(200px, 1.4fr) minmax(130px, 1fr) 76px',
  },
} as const;
const HIDE_NARROW = { '@media (max-width: 1200px)': { display: 'none' } } as const;

interface ChannelItem {
  channel: ChannelRead;
  connection: Connection;
  claimants: string[];
}

const CONNECTION_ORDER: Record<Connection, number> = { lapsed: 0, connected: 1, disconnected: 2, never: 3 };
const CONNECTION_KEYS: Connection[] = ['connected', 'lapsed', 'disconnected', 'never'];
const CONNECTION_FILTERS = CONNECTION_KEYS.map((key) => CONNECTION[key].label);
const RIGHT_NARROW = { ...HIDE_NARROW, textAlign: 'right' } as const;

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const commandsOf = (channel: ChannelRead) => Object.keys(channel.Commands ?? {}).sort();

function ConnectionCell({ channel, connection }: ChannelItem) {
  const style = CONNECTION[connection];
  const detail = [channel.IPAddress ? `from ${channel.IPAddress}` : '', channel.LastMessage ?? ''].filter(Boolean).join(' · ');
  return (
    <>
      <StatusDot
        color={style.color}
        hollow={style.hollow}
        testId='channels-row-connection'
        label={
          connection === 'never' ? (
            style.label
          ) : (
            <>
              {style.label}
              <Box component='span' sx={{ fontWeight: 400, color: T.ink3 }}>
                {' · seen '}
                <When value={channel.LastSeenAt} />
              </Box>
            </>
          )
        }
      />
      <Typography
        component='span'
        title={detail}
        sx={{ ...ABOVE_ROW_LINK_SX, fontSize: 11.5, lineHeight: T.lh, color: T.ink3, display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', paddingLeft: '14px' }}
      >
        {detail || ' '}
      </Typography>
    </>
  );
}

const CHANNEL_COLUMNS: ConsoleTableColumn<ChannelItem>[] = [
  {
    id: 'name',
    header: 'Channel',
    sortValue: ({ channel }) => channel.Slug,
    cell: ({ channel }) => (
      <>
        <Typography
          component={RouterLink}
          to={channelPath(channel.SpaceSlug ?? '', channel.Slug)}
          aria-label={`Open Channel ${channel.SpaceSlug}/${channel.Slug}`}
          title={channel.Slug}
          sx={{ ...ROW_LINK_SX, fontFamily: T.mono, fontSize: 13.5, lineHeight: T.lh, fontWeight: 600, color: T.ink, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
        >
          {channel.Slug}
        </Typography>
        <Typography component='span' sx={{ fontSize: 11.5, lineHeight: T.lh, color: T.ink3, display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {channel.SpaceSlug}
        </Typography>
      </>
    ),
  },
  {
    id: 'connection',
    header: 'Connection',
    // Lapsed first, as in the console's own order; within a state, that order (most recently seen first) holds.
    sortValue: ({ connection }) => CONNECTION_ORDER[connection],
    cell: (item) => <ConnectionCell {...item} />,
  },
  {
    id: 'claim',
    header: 'Claimed by',
    sortValue: ({ claimants }) => (claimants.length > 0 ? claimants.join(', ') : undefined),
    cell: ({ claimants }) => (
      <Typography
        data-testid='channels-row-claimants'
        title={claimants.join(', ')}
        sx={{ ...ABOVE_ROW_LINK_SX, fontFamily: claimants.length > 0 ? T.mono : undefined, fontSize: 12.5, lineHeight: T.lh, color: claimants.length > 0 ? T.ink2 : T.ink3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
      >
        {claimants.length > 0 ? claimants.join(', ') : 'No one'}
      </Typography>
    ),
  },
  {
    id: 'subscriptions',
    header: 'Subscribes to',
    sx: HIDE_NARROW,
    sortValue: ({ channel }) => subscriptionSummary(channel),
    cell: ({ channel }) => {
      const subscriptions = subscriptionSummary(channel);
      return (
        <Typography title={subscriptions} sx={{ ...ABOVE_ROW_LINK_SX, fontSize: 12.5, lineHeight: T.lh, color: T.ink2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {subscriptions}
        </Typography>
      );
    },
  },
  {
    id: 'commands',
    header: 'Commands',
    sx: RIGHT_NARROW,
    sortValue: ({ channel }) => commandsOf(channel).length,
    cell: ({ channel }) => {
      const commands = commandsOf(channel);
      return (
        <Typography title={commands.join('\n')} sx={{ ...ABOVE_ROW_LINK_SX, marginLeft: 'auto', fontFamily: T.mono, fontSize: 12.5, lineHeight: T.lh, color: T.ink2 }}>
          {commands.length}
        </Typography>
      );
    },
  },
  {
    id: 'action',
    header: '',
    cell: () => (
      <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
        {/* The row's link covers it, so it is a picture of a control, not a second one. */}
        <Box component='span' aria-hidden='true' sx={controlSx('quiet', true)}>
          Open
        </Box>
      </Box>
    ),
  },
];

const channelRowId = ({ channel }: ChannelItem) => channel.ChannelID ?? `${channel.SpaceSlug}/${channel.Slug}`;
const channelRowAttributes = ({ channel, connection }: ChannelItem) => ({
  'data-testid': 'channels-row',
  'data-slug': channel.Slug,
  'data-connection': connection,
});

export function ChannelList() {
  const navigate = useNavigate();
  const { data, isLoading, isFetching, isError, fulfilledTimeStamp, refetch } = useListAllChannelsQuery({}, { pollingInterval: POLL_MS });
  const channels = useMemo(() => (data ?? []).flatMap((entry) => (entry.Channel ? [entry.Channel] : [])), [data]);

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 15_000);
    return () => window.clearInterval(id);
  }, []);

  const claimUserIds = useMemo(() => channels.flatMap((c) => Object.keys(c.Permissions?.Claim?.UserIDs ?? {})), [channels]);
  const claimGroupIds = useMemo(() => channels.flatMap((c) => Object.keys(c.Permissions?.Claim?.GroupIDs ?? {})), [channels]);
  const names = usePrincipalNames(claimUserIds, claimGroupIds);

  const [search, setSearch] = useState('');
  const [connectionFilter, setConnectionFilter] = useState<string>('all');
  const [spaceFilter, setSpaceFilter] = useState<string>('all');
  const [creating, setCreating] = useState(false);
  const filtersActive = search !== '' || connectionFilter !== 'all' || spaceFilter !== 'all';
  const clearFilters = useCallback(() => {
    setSearch('');
    setConnectionFilter('all');
    setSpaceFilter('all');
  }, []);

  const spaceSlugs = useMemo(() => [...new Set(channels.flatMap((c) => (c.SpaceSlug ? [c.SpaceSlug] : [])))].sort(), [channels]);

  const matched = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return channels
      .map((channel) => ({ channel, connection: connectionOf(channel, now), claimants: claimantsOf(channel, names) }))
      .filter(({ channel, connection, claimants }) => {
        if (connectionFilter !== 'all' && CONNECTION[connection].label !== connectionFilter) return false;
        if (spaceFilter !== 'all' && channel.SpaceSlug !== spaceFilter) return false;
        if (needle === '') return true;
        return [channel.Slug, channel.SpaceSlug ?? '', channel.DisplayName ?? '', channel.LastMessage ?? '', channel.IPAddress ?? '', ...claimants, ...Object.keys(channel.Commands ?? {})].some(
          (field) => field.toLowerCase().includes(needle),
        );
      })
      .sort(
        (a, b) =>
          CONNECTION_ORDER[a.connection] - CONNECTION_ORDER[b.connection] ||
          (b.channel.LastSeenAt ?? '').localeCompare(a.channel.LastSeenAt ?? '') ||
          `${a.channel.SpaceSlug}/${a.channel.Slug}`.localeCompare(`${b.channel.SpaceSlug}/${b.channel.Slug}`),
      );
  }, [channels, search, connectionFilter, spaceFilter, now, names]);

  const cards: KpiCard[] = CONNECTION_KEYS.map((key) => ({
    key,
    label: CONNECTION[key].label,
    hint: CONNECTION[key].hint,
    count: channels.filter((channel) => connectionOf(channel, now) === key).length,
    status: connectionFilter === CONNECTION[key].label ? 'on' : 'off',
    tone: key === 'connected' ? T.ok : key === 'lapsed' ? T.bad : T.ink2,
  }));
  const selectCard = (key: string) => {
    const label = CONNECTION[key as Connection].label;
    setConnectionFilter((current) => (current === label ? 'all' : label));
  };

  return (
    <Box component='section' role='region' aria-label='Channels console' data-testid='channels-console' sx={{ fontFamily: T.sans, color: T.ink, minWidth: 0 }}>
      <ConsoleTitleRow
        title='Channels'
        headingId='channels-console-heading'
        count={matched.length}
        freshness={freshnessFrom(fulfilledTimeStamp ?? null, now)}
        refreshing={isFetching}
        onRefresh={() => void refetch()}
        actions={
          <Box component='button' type='button' data-testid='channels-create' onClick={() => setCreating(true)} sx={controlSx('primary', true)}>
            New Channel
          </Box>
        }
      />
      <ConsoleIntro>
        A Channel is the mailbox between ConfigHub and one bot. The bot claims it, then polls it for the events it subscribes to and the commands run on
        it. Connected means a bot is polling it now.
      </ConsoleIntro>
      <Box role='group' aria-label='Channel triage'>
        <KpiStrip
          cards={cards}
          onSelect={selectCard}
          testIdPrefix='channels-card'
          numSx={KPI_NUM_SX}
          labelSx={KPI_LABEL_SX}
          hintSx={KPI_HINT_SX}
          cardSx={KPI_CARD_SX}
          activeCardSx={KPI_ACTIVE_CARD_SX}
          partialCardSx={KPI_PARTIAL_CARD_SX}
        />
      </Box>
      <ConsoleFilterBar>
        <ConsoleSearch value={search} onChange={setSearch} placeholder='Search Channels' />
        <ConsoleSelectFilter label='Connection' value={connectionFilter} onChange={setConnectionFilter} allLabel='All' options={CONNECTION_FILTERS} />
        <ConsoleSelectFilter label='Space' value={spaceFilter} onChange={setSpaceFilter} allLabel='All Spaces' options={spaceSlugs} />
        <ConsoleClearButton onClick={clearFilters} disabled={!filtersActive}>
          Clear filters
        </ConsoleClearButton>
      </ConsoleFilterBar>

      {isError ? (
        <Box role='alert' sx={{ border: `1px solid ${T.badLine}`, background: T.badSoft, padding: '10px 12px', fontSize: 12.5, lineHeight: T.lh, color: T.bad }}>
          {channels.length === 0 ? 'The Channels could not be read.' : 'The Channels could not be read again. The list shows the last read.'}
        </Box>
      ) : null}

      <ConsoleTable
        label='Channels'
        data={matched}
        columns={CHANNEL_COLUMNS}
        grid={GRID}
        getRowId={channelRowId}
        isLoading={isLoading}
        loadingTestId='channels-loading'
        rowAttributes={channelRowAttributes}
        empty={
          <ConsoleEmpty
            message={channels.length === 0 ? 'No Channels yet.' : 'No Channel matches these filters.'}
            action={
              channels.length > 0 && filtersActive ? (
                <ConsoleClearButton onClick={clearFilters} disabled={false}>
                  Clear filters
                </ConsoleClearButton>
              ) : null
            }
          />
        }
        footer={<ConsoleFooter countTestId='channels-count' count={plural(matched.length, 'Channel')} hint='Select a row to see its commands, recent runs and access.' />}
      />
      <CreateChannelDialog
        open={creating}
        onClose={() => setCreating(false)}
        onCreated={(channel) => {
          setCreating(false);
          navigate(channelPath(channel.SpaceSlug ?? '', channel.Slug));
        }}
      />
    </Box>
  );
}
