// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { useMemo } from 'react';

import { useListDraftLinksQuery } from './draftLinksApi';
import type { DraftReadStatus } from './draftTypes';
import { linkedSpacesOf, type DraftLinkedSpaces } from './draftUpdateTypes';
import { useRetry } from './useRetry';

export interface DraftLinkedSpacesRead {
  status: DraftReadStatus;
  /** The variants each update type's Links reach from the base. `undefined` unless `resolved`. */
  linkedSpaces: DraftLinkedSpaces | undefined;
  /** Ask again, after a failure. */
  retry: () => void;
}

/**
 * Which variants each update type's Links reach from the base Space: read once each time the
 * draft opens, since a Link made elsewhere changes what can be promoted.
 */
export function useDraftLinkedSpaces(baseSpaceId: string | undefined): DraftLinkedSpacesRead {
  const read = useListDraftLinksQuery(
    { baseSpaceIds: baseSpaceId === undefined ? [] : [baseSpaceId] },
    { skip: baseSpaceId === undefined, refetchOnMountOrArgChange: true },
  );
  const retry = useRetry([read]);
  const links = read.currentData;
  const linkedSpaces = useMemo(
    () =>
      links === undefined
        ? undefined
        : linkedSpacesOf(links.map((entry) => ({ spaceId: entry.Link?.SpaceID, updateType: entry.Link?.UpdateType }))),
    [links],
  );
  let status: DraftReadStatus = 'loading';
  if (read.isError) status = 'failed';
  else if (linkedSpaces !== undefined) status = 'resolved';
  return { status, linkedSpaces: status === 'resolved' ? linkedSpaces : undefined, retry };
}
