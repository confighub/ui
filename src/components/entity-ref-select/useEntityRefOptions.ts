// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { useMemo } from 'react';

import {
  useListAllFiltersQuery,
  useListAllTargetsQuery,
  useListComponentsQuery,
} from '@confighub/rtk-query';

import type { EntityRefOption } from './EntityRefSelect';

/** Filters of one kind (From) across the organization, named <space>/<filter>. */
export const useFilterRefOptions = (from: 'Trigger' | 'Attribute', skip = false) => {
  const { data = [], isFetching } = useListAllFiltersQuery(
    { where: `From = '${from}'`, include: 'SpaceID' },
    { skip },
  );
  const options = useMemo<EntityRefOption[]>(
    () =>
      data
        .filter((f) => f.Filter?.FilterID)
        .map((f) => ({
          id: f.Filter!.FilterID!,
          label: f.Space?.Slug ? `${f.Space.Slug}/${f.Filter!.Slug}` : f.Filter!.Slug,
        }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    [data],
  );
  return { options, isFetching };
};

/** Targets across the organization, named <space>/<target>. */
export const useTargetRefOptions = (skip = false) => {
  const { data = [], isFetching } = useListAllTargetsQuery({ include: 'SpaceID' }, { skip });
  const options = useMemo<EntityRefOption[]>(
    () =>
      data
        .filter((t) => t.Target?.TargetID)
        .map((t) => ({
          id: t.Target!.TargetID!,
          label: t.Space?.Slug ? `${t.Space.Slug}/${t.Target!.Slug}` : t.Target!.Slug,
        }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    [data],
  );
  return { options, isFetching };
};

/** The organization's Components. */
export const useComponentRefOptions = (skip = false) => {
  const { data = [], isFetching } = useListComponentsQuery({}, { skip });
  const options = useMemo<EntityRefOption[]>(
    () =>
      data
        .filter((c) => c.Component?.ComponentID)
        .map((c) => ({ id: c.Component!.ComponentID!, label: c.Component!.Slug }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    [data],
  );
  return { options, isFetching };
};
