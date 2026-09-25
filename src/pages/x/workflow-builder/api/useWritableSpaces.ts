// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * Which Spaces a new ChangeWorkflow could be written into.
 *
 * Deliberately its own small hook rather than a reuse of `useWorkflowSpaces`. That
 * hook answers a different question -- which Spaces a chosen COMPONENT'S label
 * selects, scoped to a preview -- and merging the two would make one hook answer
 * on behalf of two callers who need different things from it: this one wants every
 * Space regardless of label, that one wants none until a component is named.
 *
 * `summary` is left off deliberately: it costs the server roughly eighteen COUNT
 * queries per Space, and a picker reads only `SpaceID` and `Slug`.
 */

import { useMemo } from 'react';

import { useListSpacesQuery } from '@confighub/rtk-query';

import type { SpaceOption } from '../components/SpacePicker';

const SPACE_SELECT = 'SpaceID,Slug';

const NO_SPACES: SpaceOption[] = [];

export interface WritableSpaces {
  spaces: SpaceOption[];
  status: 'loading' | 'ready' | 'failed';
}

export function useWritableSpaces(skip = false): WritableSpaces {
  const { data, isLoading, error } = useListSpacesQuery(
    { select: SPACE_SELECT },
    { skip },
  );

  const spaces = useMemo(() => {
    if (!Array.isArray(data)) return NO_SPACES;
    return data.flatMap((extended) => {
      const space = extended?.Space;
      if (!space?.SpaceID || !space.Slug) return [];
      return [{ spaceId: space.SpaceID, slug: space.Slug }];
    });
  }, [data]);

  const status: WritableSpaces['status'] = error !== undefined ? 'failed' : isLoading ? 'loading' : 'ready';

  return { spaces, status };
}
