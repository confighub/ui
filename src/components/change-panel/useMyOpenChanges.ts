// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * The person's open changes (State New or Open), newest first (D33): what the change menu and
 * the no-change panel offer to work in.
 */
import { useMemo } from 'react';
import { useListAllChangeSetsQuery } from '@confighub/rtk-query';
import { useUserInfo } from '@/components/authenticated-context/AuthenticatedContext';

export interface OpenChange {
  id: string;
  slug: string;
  space: string;
  createdAt?: string;
}

export function useMyOpenChanges(): { changes: OpenChange[]; isLoading: boolean } {
  const { userInfo } = useUserInfo();
  const me = userInfo?.UserID;
  const read = useListAllChangeSetsQuery({ where: `UserID = '${me ?? ''}' AND State IN ('New', 'Open')` }, { skip: !me });
  const changes = useMemo(
    () =>
      (read.data ?? [])
        .flatMap((e) => (e.ChangeSet ? [{ id: e.ChangeSet.ChangeSetID ?? '', slug: e.ChangeSet.Slug, space: e.ChangeSet.SpaceSlug ?? e.Space?.Slug ?? '', createdAt: e.ChangeSet.CreatedAt }] : []))
        .sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? '')),
    [read.data],
  );
  return { changes, isLoading: read.isLoading };
}
