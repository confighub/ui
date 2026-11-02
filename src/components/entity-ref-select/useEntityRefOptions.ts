// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { useMemo } from 'react';

import {
  useListAllFiltersQuery,
  useListAllInvocationsQuery,
  useListAllTargetsQuery,
  useListComponentsQuery,
} from '@confighub/rtk-query';

import type { EntityRefOption } from './EntityRefSelect';

/** Filters of one kind (From) across the organization, named <space>/<filter>. */
export const useFilterRefOptions = (from: 'Trigger' | 'Attribute' | 'Unit', skip = false) => {
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

/**
 * Invocations of one toolchain across the organization, named <space>/<invocation>, that a Trigger
 * can run: a Trigger fires with no caller to supply parameter values, so one that declares
 * parameters is left out.
 */
export const useTriggerInvocationRefOptions = (toolchainType: string, skip = false) => {
  const { data = [], isFetching } = useListAllInvocationsQuery(
    { where: `ToolchainType = '${toolchainType}'`, include: 'SpaceID' },
    { skip: skip || !toolchainType },
  );
  const options = useMemo<EntityRefOption[]>(
    () =>
      data
        .filter((i) => i.Invocation?.InvocationID && !(i.Invocation.Parameters?.length))
        .map((i) => ({
          id: i.Invocation!.InvocationID!,
          label: i.Space?.Slug ? `${i.Space.Slug}/${i.Invocation!.Slug}` : i.Invocation!.Slug,
        }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    [data],
  );
  return { options, isFetching };
};
