// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * How a ServiceAccount is being used, from its credentials: the keys it signs
 * assertions with and the long-lived tokens issued to it. Each records when it
 * was last used, so the latest of them is when the account last authenticated.
 */

import {
  confighubApi,
  type ListServiceAccountUserKeysApiResponse,
  type ListServiceAccountUserTokensApiResponse,
  type UserKeyRead,
  type UserTokenRead,
} from '@confighub/rtk-query';
import type { FetchBaseQueryError } from '@reduxjs/toolkit/query';

import { isSetTime, timeOf } from '@/components/console-detail/consoleDetailUtil';
import { consoleTokens as T } from '../change-orders/consoleStyle';

export interface Credentials {
  keys: UserKeyRead[];
  tokens: UserTokenRead[];
  /** The credentials could not be read, typically for want of View on the account. */
  failed: boolean;
}

/** Recent enough to call the account in use. */
export const ACTIVE_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

export type Activity = 'active' | 'idle' | 'unused' | 'none' | 'unknown';

export const ACTIVITY: Record<Activity, { label: string; color: string; hollow: boolean }> = {
  active: { label: 'Active', color: T.ok, hollow: false },
  idle: { label: 'Idle', color: T.wait, hollow: false },
  unused: { label: 'Never used', color: T.ink3, hollow: true },
  none: { label: 'No credentials', color: T.ink3, hollow: true },
  unknown: { label: 'Unknown', color: T.ink3, hollow: true },
};

export type TokenState = 'live' | 'revoked' | 'expired';

export function tokenState(token: UserTokenRead, now: number): TokenState {
  if (isSetTime(token.RevokedAt)) return 'revoked';
  const expires = timeOf(token.ExpiresAt);
  if (expires !== undefined && expires <= now) return 'expired';
  return 'live';
}

export function keyExpired(key: UserKeyRead, now: number): boolean {
  const expires = timeOf(key.ExpiresAt);
  return expires !== undefined && expires <= now;
}

export interface LastUse {
  at: string;
  via: 'key' | 'token';
  /** What the credential is known by: its description, or its key ID or slug. */
  name: string;
}

export interface Usage {
  activity: Activity;
  lastUse?: LastUse;
  liveKeys: number;
  liveTokens: number;
}

export function usageOf(credentials: Credentials | undefined, now: number): Usage {
  if (credentials === undefined || credentials.failed) return { activity: 'unknown', liveKeys: 0, liveTokens: 0 };
  let lastUse: LastUse | undefined;
  const consider = (at: string | undefined, via: LastUse['via'], name: string) => {
    if (!isSetTime(at)) return;
    if (lastUse === undefined || Date.parse(at) > Date.parse(lastUse.at)) lastUse = { at, via, name };
  };
  for (const key of credentials.keys) consider(key.LastUsedAt, 'key', key.Description || key.Kid || key.Slug);
  for (const token of credentials.tokens) consider(token.LastUsedAt, 'token', token.Description || token.Slug);

  const liveKeys = credentials.keys.filter((key) => !keyExpired(key, now)).length;
  const liveTokens = credentials.tokens.filter((token) => tokenState(token, now) === 'live').length;
  let activity: Activity;
  if (lastUse !== undefined && now - Date.parse(lastUse.at) <= ACTIVE_WINDOW_MS) activity = 'active';
  else if (liveKeys + liveTokens === 0) activity = 'none';
  else if (lastUse === undefined) activity = 'unused';
  else activity = 'idle';
  return { activity, lastUse, liveKeys, liveTokens };
}

export function lastUseText(lastUse: LastUse | undefined): string {
  if (lastUse === undefined) return '';
  return `${lastUse.via === 'key' ? 'key' : 'token'} ${lastUse.name}`;
}

const serviceAccountsApi = confighubApi.injectEndpoints({
  endpoints: (build) => ({
    /**
     * Every listed account's keys and tokens, read together so the list can count
     * and sort by them. An account whose credentials cannot be read is marked
     * `failed` rather than failing the list. Tagged ServiceAccount, which is what
     * issuing, revoking and removing credentials invalidate.
     */
    listServiceAccountCredentials: build.query<Record<string, Credentials>, { serviceAccountIds: string[] }>({
      queryFn: async ({ serviceAccountIds }, _api, _extra, baseQuery) => {
        const entries = await Promise.all(
          serviceAccountIds.map(async (id): Promise<[string, Credentials]> => {
            const [keys, tokens] = await Promise.all([
              baseQuery({ url: `/service_account/${id}/user_key` }),
              baseQuery({ url: `/service_account/${id}/user_token` }),
            ]);
            if (keys.error !== undefined || tokens.error !== undefined) return [id, { keys: [], tokens: [], failed: true }];
            return [
              id,
              {
                keys: ((keys.data ?? []) as ListServiceAccountUserKeysApiResponse).flatMap((entry) => (entry.UserKey ? [entry.UserKey] : [])),
                tokens: ((tokens.data ?? []) as ListServiceAccountUserTokensApiResponse).flatMap((entry) =>
                  entry.UserToken ? [entry.UserToken] : [],
                ),
                failed: false,
              },
            ];
          }),
        );
        return { data: Object.fromEntries(entries) } as { data: Record<string, Credentials> } | { error: FetchBaseQueryError };
      },
      providesTags: ['ServiceAccount'],
    }),
  }),
  overrideExisting: false,
});

export const { useListServiceAccountCredentialsQuery } = serviceAccountsApi;
