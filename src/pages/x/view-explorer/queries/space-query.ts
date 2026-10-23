// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import { LABEL_PREFIX } from '@/components/group-nav/types';

/**
 * Translation from a Space view's column name (as stored in View.Columns /
 * GroupBy / OrderBy) to the server `select` fields and `include` entities
 * needed to render it.
 */
interface ColumnMapping {
  select?: readonly string[];
  include?: readonly string[];
}

const SPACE_COLUMN_MAPPING: Record<string, ColumnMapping> = {
  Slug: { select: ['Slug'] },
  DisplayName: { select: ['DisplayName'] },
  CreatedAt: { select: ['CreatedAt'] },
  UpdatedAt: { select: ['UpdatedAt'] },
  OrganizationID: { select: ['OrganizationID'] },
  // The Component the Space is a Variant of, shown by its slug. The Space holds
  // only ComponentID; the Component arrives when the query includes it. Named
  // bare here and as the path `where` and the CLI use.
  Component: { select: ['ComponentID'], include: ['ComponentID'] },
  'Component.Slug': { select: ['ComponentID'], include: ['ComponentID'] },
  // Aggregate counts are computed by the server rather than selected, so these
  // contribute no fields. They arrive only when the query asks for the rollup
  // (see SPACE_COUNT_COLUMNS); without it every count reads back as zero.
  TotalUnitCount: {},
  TotalLinkCount: {},
  TotalFilterCount: {},
  TotalBridgeWorkerCount: {},
  TotalChangeSetCount: {},
  TotalTagCount: {},
  TotalViewCount: {},
  TotalAttributeCount: {},
  TotalInvocationCount: {},
  UnreleasedUnitCount: {},
  UnlinkedUnitCount: {},
  UpgradableUnitCount: {},
  GatedUnitCount: {},
};

/**
 * Space columns whose value is an aggregate the server computes on request,
 * rather than a field stored on the Space. Exactly the SPACE_COLUMN_MAPPING
 * entries that contribute no select fields.
 */
const SPACE_COUNT_COLUMNS = new Set(
  Object.entries(SPACE_COLUMN_MAPPING)
    .filter(([, mapping]) => !mapping.select && !mapping.include)
    .map(([name]) => name),
);

/** The parts of a Space list request that depend on the columns a view reads. */
export interface SpaceQueryFields {
  select: string;
  include?: string;
  summary?: true;
}

/**
 * The `select`, `include` and `summary` a Space list needs to answer the
 * referenced columns (a view's Columns, GroupBy and OrderBy).
 */
export function spaceQueryFields(referenced: readonly (string | undefined)[]): SpaceQueryFields {
  const select = new Set<string>(['SpaceID', 'Slug']);
  const include = new Set<string>();
  let summary = false;
  for (const col of referenced) {
    if (!col) continue;
    if (col.startsWith(LABEL_PREFIX)) {
      select.add('Labels');
      continue;
    }
    const mapping = SPACE_COLUMN_MAPPING[col];
    mapping?.select?.forEach((f) => select.add(f));
    mapping?.include?.forEach((f) => include.add(f));
    // The rollup counts across every entity in each space, which a view that
    // just lists slugs has no use for: ask only when a column shows one.
    if (SPACE_COUNT_COLUMNS.has(col)) summary = true;
  }
  return {
    select: Array.from(select).sort().join(','),
    include: include.size > 0 ? Array.from(include).sort().join(',') : undefined,
    summary: summary || undefined,
  };
}
