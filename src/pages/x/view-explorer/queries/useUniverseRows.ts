// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import { useMemo } from 'react';

import {
  type Column,
  type ExtendedSpaceRead,
  type ExtendedUnitRead,
  type ViewColumn,
  useListAllUnitsQuery,
  useListSpacesQuery,
} from '@confighub/rtk-query';

import type { ResourceViewRow } from '../adapters/resource-row';
import { useResourceViewRows } from './useResourceViewRows';
import { fieldById, LABEL_PREFIX, SPACE_LABEL_PREFIX, UNIT_LABEL_PREFIX, type EntityRow } from '../model/fields';
import type { EntityKind, ViewDef } from '../model/types';
import { spaceQueryFields } from './space-query';
import type { SavedView } from './useViews';

/**
 * Every row of the view's entity, unfiltered (the "universe"): lens counts
 * ("alone 17", "−34") and value counts are set arithmetic over it, so it is
 * fetched once per entity and the filters run on the client.
 *
 * A column the server computes from configuration (a data path or an
 * expression) is not on the unfiltered rows, because the server only
 * computes View columns when the request names the View, and naming the View
 * also applies its Filter. So for a saved View with such columns there is a
 * second request with `view=<ViewID>`, and its values are joined onto the
 * universe rows by id. A row outside that View's saved filter has no value:
 * its cell shows "—" until the view is saved.
 */

/** The Unit fields lenses and cells read, always fetched so a new lens needs no new request. */
const UNIT_SELECT = [
  'UnitID',
  'Slug',
  'DisplayName',
  'SpaceID',
  'TargetID',
  'ToolchainType',
  'ProviderType',
  'Labels',
  'HeadRevisionNum',
  'LastReleasedRevisionNum',
  'UpstreamRevisionNum',
  'UpstreamUnitID',
  'UpstreamSpaceID',
  'ChangeSetID',
  'CreatedAt',
  'UpdatedAt',
  'LastChangeDescription',
].join(',');

const UNIT_INCLUDE_BASE = ['SpaceID', 'TargetID', 'UpstreamUnitID', 'UpstreamSpaceID'];

export function rowIdOf(entity: EntityKind, row: EntityRow): string {
  switch (entity) {
    case 'Unit':
      return (row as ExtendedUnitRead).Unit?.UnitID ?? '';
    case 'Space':
      return (row as ExtendedSpaceRead).Space?.SpaceID ?? '';
    case 'Resource':
      return (row as ResourceViewRow).id;
  }
}

/** Every field name a view reads: columns, group levels, sort, matrix axes and field lenses. */
export function referencedFields(def: ViewDef): string[] {
  const names = new Set<string>(def.columns.map((c) => c.name));
  def.groupBy.forEach((g) => names.add(g));
  if (def.sort) names.add(def.sort.column);
  names.add(def.matrix.rows);
  names.add(def.matrix.cols);
  for (const l of def.lenses) if (l.kind === 'field') names.add(l.field);
  return [...names];
}

/** Columns of a saved View that only the server can answer (data paths, expressions). */
export function serverColumns(entity: EntityKind, saved: SavedView | undefined, def: ViewDef): string[] {
  if (!saved || entity === 'Space') return [];
  const visible = new Set(def.columns.map((c) => c.name));
  return (saved.view.Columns ?? [])
    .filter((c): c is Column => !!c?.Name && visible.has(c.Name) && !fieldById(entity, c.Name))
    .filter((c) => !!c.ColumnSource || !!c.ColumnType)
    .map((c) => c.Name);
}

export interface UniverseResult {
  entity: EntityKind;
  rows: EntityRow[];
  /** Server-computed columns of the saved View, and the rows it has no value for. */
  serverColumns: string[];
  rowsWithoutServerColumns: ReadonlySet<string>;
  isLoading: boolean;
  isFetching: boolean;
  isError: boolean;
  error: unknown;
  refetch: () => void;
}

function resourceInclude(fields: readonly string[]): string {
  const includes = new Set<string>();
  for (const f of fields) {
    if (f.startsWith(UNIT_LABEL_PREFIX) || f.startsWith(LABEL_PREFIX) || (f.startsWith('Unit.') && f !== 'Unit.Slug')) includes.add('UnitID');
    if (f.startsWith(SPACE_LABEL_PREFIX)) includes.add('SpaceID');
  }
  return [...includes].sort().join(',');
}

export function useUniverseRows(def: ViewDef, saved: SavedView | undefined): UniverseResult {
  const entity = def.entity;
  const fields = referencedFields(def);
  const fieldsKey = fields.join('|');
  const usesChangeSet = fields.some((f) => f.startsWith('ChangeSet'));
  const serverCols = serverColumns(entity, saved, def);
  const viewId = serverCols.length ? saved?.viewId : undefined;

  const units = useListAllUnitsQuery(
    { select: UNIT_SELECT, include: [...UNIT_INCLUDE_BASE, ...(usesChangeSet ? ['ChangeSetID'] : [])].join(',') },
    { skip: entity !== 'Unit' },
  );
  const unitColumns = useListAllUnitsQuery(
    { view: viewId, select: 'UnitID', include: '' },
    { skip: entity !== 'Unit' || !viewId },
  );

  // Labels always: they are small, and the board's default lanes and the label fields offered come from them.
  const spaceFields = useMemo(
    () => spaceQueryFields(['Slug', 'DisplayName', 'UpdatedAt', 'CreatedAt', 'Component', 'Labels.*', ...fields]),
    // fieldsKey stands for `fields`, which is a new array on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [fieldsKey],
  );
  const spaces = useListSpacesQuery(spaceFields, { skip: entity !== 'Space' });

  const include = useMemo(() => resourceInclude(fields), [fieldsKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const resources = useResourceViewRows({ include, skip: entity !== 'Resource' });
  const resourceColumns = useResourceViewRows({ include, viewId, skip: entity !== 'Resource' || !viewId });

  const active = entity === 'Unit' ? units : entity === 'Space' ? spaces : resources;
  const columnsSource = entity === 'Unit' ? unitColumns : entity === 'Resource' ? resourceColumns : null;

  const rows = useMemo((): EntityRow[] => {
    const base = (active.data ?? []) as EntityRow[];
    if (!viewId || !columnsSource?.data) return base;
    const byId = new Map<string, ViewColumn[] | undefined>();
    for (const r of columnsSource.data as EntityRow[]) {
      byId.set(rowIdOf(entity, r), (r as { ViewColumns?: ViewColumn[] }).ViewColumns);
    }
    return base.map((r) => {
      const cols = byId.get(rowIdOf(entity, r));
      return cols ? ({ ...r, ViewColumns: cols } as EntityRow) : r;
    });
  }, [active.data, columnsSource?.data, viewId, entity]);

  const rowsWithoutServerColumns = useMemo(() => {
    const missing = new Set<string>();
    if (!viewId || !columnsSource?.data) return missing;
    const has = new Set((columnsSource.data as EntityRow[]).map((r) => rowIdOf(entity, r)));
    for (const r of rows) {
      const id = rowIdOf(entity, r);
      if (!has.has(id)) missing.add(id);
    }
    return missing;
  }, [rows, columnsSource?.data, viewId, entity]);

  return {
    entity,
    rows,
    serverColumns: serverCols,
    rowsWithoutServerColumns,
    isLoading: active.isLoading,
    isFetching: active.isFetching || !!columnsSource?.isFetching,
    isError: active.isError,
    error: 'error' in active ? active.error : undefined,
    refetch: () => {
      void active.refetch();
    },
  };
}
