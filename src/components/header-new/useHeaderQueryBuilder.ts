// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { useMemo } from 'react';

import { extractLabelOptions, useQueryBuilder } from '@/components/query-builder';
import {
  useListAllTargetsQuery,
  useListAllUnitsQuery,
  useListSpacesQuery,
} from '@confighub/rtk-query';

const TOOLCHAIN_TYPES = [
  'Kubernetes/YAML',
  'Terraform',
  'Helm',
  'Kustomize',
  'CloudFormation',
  'Pulumi',
];

/**
 * Builds and returns the QueryBuilder element with spaces, targets, and label
 * options sourced from the API.
 */
export const useHeaderQueryBuilder = () => {
  const { spaces = [] } = useListSpacesQuery(
    {},
    {
      selectFromResult: (result) => ({
        spaces: result?.data?.map((space) => space.Space).filter(Boolean),
      }),
    },
  );

  const { data: targetsData } = useListAllTargetsQuery({});

  const { data: units = [] } = useListAllUnitsQuery({
    include: 'SpaceID,TargetID,UpstreamUnitID,UnitEventID',
  });

  const queryBuilderTargets = useMemo(
    () =>
      targetsData?.map((t) => ({
        id: t.Target?.TargetID || '',
        name: t.Target?.DisplayName || t.Target?.Slug || '',
      })) ?? [],
    [targetsData],
  );

  const queryBuilderSpaces = useMemo(
    () =>
      spaces.map((s) => ({
        id: s?.SpaceID || '',
        name: s?.DisplayName || s?.Slug || '',
      })),
    [spaces],
  );

  const labelOptions = useMemo(
    () => extractLabelOptions(units.map((u) => u.Unit)),
    [units],
  );

  const slugOptions = useMemo(
    () => units.map((u) => ({
      slug: u.Unit?.Slug || '',
      spaceName: u.Space?.DisplayName || u.Space?.Slug || '',
    })).filter((s) => s.slug),
    [units],
  );

  const { QueryBuilderElement } = useQueryBuilder({
    entityType: 'Unit',
    spaces: queryBuilderSpaces,
    targets: queryBuilderTargets,
    toolchainTypes: TOOLCHAIN_TYPES,
    slugs: slugOptions,
    labelOptions,
    syncToUrl: true,
    showViewSelector: false,
  });

  return { QueryBuilderElement } as const;
};
