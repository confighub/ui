// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * Whether a client is connected to a Channel, from its lease. A client claims the
 * Channel and then polls it; each poll stamps LastSeenAt and renews the lease. A
 * lease whose LastSeenAt is older than its TTL has expired even while Condition
 * still says Claimed, until the next claim or a release clears it: that is a
 * client that went away without releasing, which is worth telling apart.
 */

import type { ChannelRead } from '@confighub/rtk-query';

import { timeOf } from '@/components/console-detail/consoleDetailUtil';
import type { PrincipalNames } from '@/hooks/usePrincipalNames';

import { consoleTokens as T } from '../change-orders/consoleStyle';

export type Connection = 'connected' | 'lapsed' | 'disconnected' | 'never';

export const CONNECTION: Record<Connection, { label: string; color: string; hollow: boolean; hint: string }> = {
  connected: { label: 'Connected', color: T.ok, hollow: false, hint: 'a client holds the lease and is polling' },
  lapsed: { label: 'Lease lapsed', color: T.bad, hollow: false, hint: 'claimed, but the client stopped polling' },
  disconnected: { label: 'Disconnected', color: T.ink3, hollow: false, hint: 'a client has connected before, none now' },
  never: { label: 'Never connected', color: T.ink3, hollow: true, hint: 'no client has claimed it' },
};

/** Slack for the poll that is renewing the lease while the page reads it. */
const GRACE_MS = 10_000;

export function connectionOf(channel: ChannelRead, now: number): Connection {
  const lastSeen = timeOf(channel.LastSeenAt);
  if (lastSeen === undefined) return 'never';
  if (channel.Condition !== 'Claimed') return 'disconnected';
  const ttlMs = (channel.ClaimTTLSeconds ?? 60) * 1000;
  return now - lastSeen <= ttlMs + GRACE_MS ? 'connected' : 'lapsed';
}

/** The subscriptions, in a few words: "release.published, unit.applied" or "all events". */
export function subscriptionSummary(channel: ChannelRead): string {
  const subscriptions = channel.Subscriptions ?? [];
  if (subscriptions.length === 0) return 'No subscriptions';
  const types = new Set<string>();
  let all = false;
  for (const subscription of subscriptions) {
    if ((subscription.EventTypes ?? []).length === 0) all = true;
    for (const type of subscription.EventTypes ?? []) types.add(type);
  }
  if (all) return 'All events';
  return [...types].sort().join(', ');
}

/** Who holds Claim, by name. Usually one service account: the bot. */
export function claimantsOf(channel: ChannelRead, names: PrincipalNames): string[] {
  const claim = channel.Permissions?.Claim;
  return [
    ...Object.entries(claim?.UserIDs ?? {}).flatMap(([id, on]) => (on ? [names.user(id).name] : [])),
    ...Object.entries(claim?.GroupIDs ?? {}).flatMap(([id, on]) => (on ? [`${names.group(id).name} (group)`] : [])),
  ];
}
