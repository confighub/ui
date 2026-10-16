// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/** Reads the ChangeSets a ChangeOrder's change was made in (`changeOrderChangeSets.ts`). */

import { useMemo } from 'react';

import { useGetChangeOrderChangeSetRevisionsQuery } from './changeOrderImageDiffApi';
import {
  changeOrderChangeSetWhere,
  groupChangeSetRevisions,
  type ChangeOrderChangeSet,
} from './changeOrderChangeSets';

export interface ChangeOrderChangeSets {
  status: 'idle' | 'loading' | 'resolved' | 'failed';
  changeSets: ChangeOrderChangeSet[];
}

const EMPTY: ChangeOrderChangeSet[] = [];

export function useChangeOrderChangeSets(args: {
  changeOrderId?: string;
  baseSpaceId?: string;
  updateType?: string;
  ownSpaceReached: boolean;
  inScopeSpaceIds?: readonly string[];
  adoptedEndTagId?: string;
}): ChangeOrderChangeSets {
  const where = changeOrderChangeSetWhere(args);
  const { currentData, isError } = useGetChangeOrderChangeSetRevisionsQuery(
    { where: where ?? '' },
    { skip: where === undefined },
  );
  const { adoptedEndTagId } = args;
  const changeSets = useMemo(
    () => (currentData === undefined ? EMPTY : groupChangeSetRevisions(currentData, adoptedEndTagId)),
    [currentData, adoptedEndTagId],
  );
  if (where === undefined) return { status: 'idle', changeSets: EMPTY };
  if (isError) return { status: 'failed', changeSets: EMPTY };
  if (currentData === undefined) return { status: 'loading', changeSets: EMPTY };
  return { status: 'resolved', changeSets };
}
