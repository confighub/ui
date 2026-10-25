// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import { useMemo } from 'react';

import { useListGroupsQuery, useListServiceAccountsQuery } from '@confighub/rtk-query';

import { useUserInfo } from '@/components/authenticated-context/AuthenticatedContext';

import { useListUsersByIdChunkedQuery } from './chunkedQueriesApi';

export interface Principal {
  id: string;
  name: string;
  kind: 'user' | 'serviceAccount' | 'group';
  /** Where the principal's own page is, for a service account. */
  href?: string;
  isYou: boolean;
}

export interface PrincipalNames {
  user: (userId: string) => Principal;
  group: (groupId: string) => Principal;
  loaded: boolean;
}

/**
 * Names for the Users and Groups a page shows by ID: a token's issuer, a
 * CommandRun's caller, the subjects of a Permissions map.
 *
 * A User a ServiceAccount acts as is named by the ServiceAccount's slug and links
 * to its page, since that is how people know it; other Users by their display
 * name or username. An ID nothing resolves is shown shortened rather than hidden,
 * so a deleted or invisible subject still reads as someone.
 */
export function usePrincipalNames(userIds: readonly string[], groupIds: readonly string[] = []): PrincipalNames {
  const { userInfo } = useUserInfo();
  const viewerUserId = userInfo?.UserID;
  const serviceAccounts = useListServiceAccountsQuery({ select: 'ServiceAccountID,Slug,UserID' });
  const accountByUser = useMemo(() => {
    const map = new Map<string, string>();
    for (const entry of serviceAccounts.data ?? []) {
      const sa = entry.ServiceAccount;
      if (sa?.UserID) map.set(sa.UserID, sa.Slug);
    }
    return map;
  }, [serviceAccounts.data]);

  const humanIds = useMemo(
    () => [...new Set(userIds.filter((id) => id !== '' && !accountByUser.has(id)))].sort(),
    [userIds, accountByUser],
  );
  const users = useListUsersByIdChunkedQuery({ userIds: humanIds }, { skip: humanIds.length === 0 || serviceAccounts.isLoading });
  const userNames = useMemo(() => {
    const map = new Map<string, string>();
    for (const entry of users.data ?? []) {
      const name = entry.User?.DisplayName || entry.User?.Username;
      if (entry.User?.UserID && name) map.set(entry.User.UserID, name);
    }
    return map;
  }, [users.data]);

  const groups = useListGroupsQuery({}, { skip: groupIds.length === 0 });
  const groupNames = useMemo(() => {
    const map = new Map<string, string>();
    for (const entry of groups.data ?? []) {
      const group = entry.Group;
      if (group?.GroupID) map.set(group.GroupID, group.DisplayName || group.Slug);
    }
    return map;
  }, [groups.data]);

  return useMemo(
    () => ({
      user: (userId: string): Principal => {
        const slug = accountByUser.get(userId);
        if (slug !== undefined) {
          return { id: userId, name: slug, kind: 'serviceAccount', href: serviceAccountPath(slug), isYou: false };
        }
        return { id: userId, name: userNames.get(userId) ?? shortId(userId), kind: 'user', isYou: userId === viewerUserId };
      },
      group: (groupId: string): Principal => ({
        id: groupId,
        name: groupNames.get(groupId) ?? shortId(groupId),
        kind: 'group',
        isYou: false,
      }),
      loaded: !serviceAccounts.isLoading && !users.isLoading && !groups.isLoading,
    }),
    [accountByUser, userNames, groupNames, viewerUserId, serviceAccounts.isLoading, users.isLoading, groups.isLoading],
  );
}

export const SERVICE_ACCOUNTS_PATH = '/service-accounts';
export const serviceAccountPath = (slug: string) => `${SERVICE_ACCOUNTS_PATH}/${encodeURIComponent(slug)}`;

export const shortId = (id: string) => (id.length > 8 ? `${id.slice(0, 8)}…` : id);
