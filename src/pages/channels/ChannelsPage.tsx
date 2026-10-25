// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * `/channels`: every Channel. `/channels/:space/:slug`: one, with its connection,
 * commands, subscriptions and recent runs.
 */

import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';

import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';

import { useListAllChannelsQuery } from '@confighub/rtk-query';

import { BackLink } from '@/components/console-detail/ConsoleDetail';
import { CONSOLE_PAGE_SX } from '@/components/console-detail/consoleDetailUtil';
import { OrganizationRow } from '@/components/organization-switcher/OrganizationRow';

import { consoleTokens as T } from '../change-orders/consoleStyle';
import { CHANNELS_PATH } from './channelAddress';
import { ChannelDetailView } from './ChannelDetailView';
import { ChannelList } from './ChannelList';

/** A connected bot renews its lease on every poll; reading this often shows it leave within a TTL or so. */
const POLL_MS = 15_000;

const quote = (value: string) => `'${value.replace(/'/g, "''")}'`;

function ChannelPage({ space, slug }: { space: string; slug: string }) {
  const { data, isLoading, isError } = useListAllChannelsQuery({ where: `Slug = ${quote(slug)}` }, { pollingInterval: POLL_MS });
  const channel = (data ?? []).find((entry) => entry.Channel?.SpaceSlug === space)?.Channel;
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 5_000);
    return () => window.clearInterval(id);
  }, []);

  return (
    <>
      <BackLink to={CHANNELS_PATH}>All Channels</BackLink>
      {isLoading ? <Typography sx={{ fontSize: 13.5 }}>Loading…</Typography> : null}
      {isError && channel === undefined ? (
        <Typography role='alert' sx={{ fontSize: 13.5, color: T.bad }}>
          The Channel could not be read.
        </Typography>
      ) : null}
      {!isLoading && !isError && channel === undefined ? (
        <Box role='region' aria-label='Channel not found'>
          <Typography component='h1' sx={{ fontSize: 18, fontWeight: 650, mb: 0.5 }}>
            No Channel matches “{space}/{slug}”
          </Typography>
          <Typography sx={{ fontSize: 13.5, color: T.ink2 }}>It may have been deleted, or you may not be allowed to see it.</Typography>
        </Box>
      ) : null}
      {channel ? <ChannelDetailView channel={channel} now={now} /> : null}
    </>
  );
}

export default function ChannelsPage() {
  const { space, slug } = useParams<{ space?: string; slug?: string }>();
  return (
    <Box data-testid='channels-root' sx={CONSOLE_PAGE_SX}>
      <OrganizationRow />
      {space && slug ? <ChannelPage space={space} slug={slug} /> : <ChannelList />}
    </Box>
  );
}
