// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { useCallback, useMemo } from 'react';

import { useUserInfo } from '@/components/authenticated-context/AuthenticatedContext';
import { useListUsersByIdChunkedQuery } from '@/hooks/chunkedQueriesApi';

import { AUTOMATED_USER_ID } from '../../x/apps/appTypes';
import { type HistoryPerson, type HistoryUser, resolvePerson } from '../changeOrderHistory';

export interface DraftPeople {
  /** The person a UserID names, as the ChangeOrder history names people: a name, Automation, or Unknown user. */
  personOf: (userId: string | undefined) => HistoryPerson;
  isLoading: boolean;
}

/**
 * The people some UserIDs name, read in one batched `ListUsers`, resolved by the history card's
 * `resolvePerson` so the draft and the detail view name a person the same way. A UserID the read
 * has not answered for yet is `loading`, never "Unknown user".
 */
export function useDraftPeople(userIds: readonly (string | undefined)[]): DraftPeople {
  const { userInfo } = useUserInfo();
  const currentUserId = userInfo?.UserID;
  const ids = useMemo(
    () =>
      [
        ...new Set(userIds.filter((id): id is string => !!id && id !== AUTOMATED_USER_ID)),
      ].sort(),
    [userIds],
  );
  const users = useListUsersByIdChunkedQuery({ userIds: ids }, { skip: ids.length === 0 });
  const userById = useMemo(() => {
    const map = new Map<string, HistoryUser>();
    for (const entry of users.data ?? []) {
      if (entry.User?.UserID) map.set(entry.User.UserID, entry.User);
    }
    return map;
  }, [users.data]);
  const fetching = users.isFetching || users.isUninitialized;
  const personOf = useCallback(
    (userId: string | undefined) =>
      resolvePerson(
        userId,
        userById,
        currentUserId,
        fetching && userId !== undefined && !userById.has(userId),
      ),
    [userById, currentUserId, fetching],
  );
  return { personOf, isLoading: ids.length > 0 && users.data === undefined && !users.isError };
}
