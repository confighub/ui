// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import type { ColumnGroup } from '@/components/entity-data-grid/column-groups-types';
import { UNIT_COLUMN_GROUPS } from '@/components/unit-data-grid/unit-column-groups';
import { SPACE_COLUMN_GROUPS } from '@/pages/space-list/components/spaces-table/space-column-groups';

import type { FieldCategory, FieldDef } from '../model/fields';
import type { EntityKind } from '../model/types';

/**
 * The sections of the Add column list. Units and Spaces use the groups of
 * their list pages' Columns panel, by header and order, so a field is found
 * under the same heading on both pages. The explorer has some fields the
 * list grids do not; those are added to the group they belong to here, not
 * in the list pages' groups, which name the grids' own columns.
 */

export interface AddColumnSection {
  title: string;
  fields: FieldDef[];
}

type ExtraColumns = Partial<Record<string, readonly string[]>>;

const UNIT_EXTRA: ExtraColumns = {
  'Core Identity': ['DisplayName', 'ProviderType'],
  'Status & Health': ['Status'],
  // The upstream Unit's revision this Unit was last merged from: only a clone has one.
  'Clone/Upstream': ['UpstreamRevisionNum'],
};

const SPACE_EXTRA: ExtraColumns = {
  'Core Identity': ['DisplayName'],
};

const withExtra = (groups: readonly ColumnGroup[], extra: ExtraColumns): ColumnGroup[] =>
  groups.map((g) => ({
    header: g.header,
    columns: [...g.columns, ...(extra[g.header] ?? [])],
  }));

/** Resources have no list page; their groups follow what each field describes. */
const RESOURCE_GROUPS: ColumnGroup[] = [
  { header: 'Core Identity', columns: ['ResourceName', 'ResourceType'] },
  { header: 'Status & Health', columns: ['Status'] },
  {
    header: 'Unit',
    columns: ['Unit.Slug', 'Unit.Target', 'Unit.ToolchainType', 'Unit.HeadRevisionNum'],
  },
  { header: 'Space', columns: ['Space.Slug'] },
];

export const ADD_COLUMN_GROUPS: Record<EntityKind, readonly ColumnGroup[]> = {
  Unit: withExtra(UNIT_COLUMN_GROUPS, UNIT_EXTRA),
  Space: withExtra(SPACE_COLUMN_GROUPS, SPACE_EXTRA),
  Resource: RESOURCE_GROUPS,
};

/** Where a field no group names goes, and the label sections, in the order they follow the groups. */
const CATEGORY_TITLE: Record<FieldCategory, string> = {
  computed: 'Computed',
  field: 'Other',
  label: 'Labels',
  'space-label': 'Space labels',
};
const CATEGORY_ORDER: FieldCategory[] = ['computed', 'field', 'label', 'space-label'];

/**
 * The fields in sections: the entity's groups first, then the fields no
 * group names, then labels and Space labels. Fields keep their catalog order
 * within a section, and empty sections are left out, so a search shows only
 * the headings that have a match.
 */
export function addColumnSections(
  entity: EntityKind,
  fields: readonly FieldDef[],
): AddColumnSection[] {
  const groups = ADD_COLUMN_GROUPS[entity];
  const groupOf = new Map<string, string>();
  for (const g of groups)
    for (const id of g.columns) if (!groupOf.has(id)) groupOf.set(id, g.header);

  // Label fields are always in their own sections, whatever their id.
  const grouped = (f: FieldDef) =>
    f.category !== 'label' && f.category !== 'space-label' ? groupOf.get(f.id) : undefined;

  return [
    ...groups.map((g) => ({
      title: g.header,
      fields: fields.filter((f) => grouped(f) === g.header),
    })),
    ...CATEGORY_ORDER.map((c) => ({
      title: CATEGORY_TITLE[c],
      fields: fields.filter((f) => f.category === c && !grouped(f)),
    })),
  ].filter((s) => s.fields.length > 0);
}
