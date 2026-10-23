// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import type { Column } from '@confighub/rtk-query';

/**
 * The View Explorer's model: what a view is while it is being looked at and
 * changed. Everything under `model/` is pure (no React, no MUI, no RTK hooks),
 * so it is proven by `*.pure.spec.ts` specs that run without a browser.
 */

/** The entity a view lists. Resource rows come from the Resource entity. */
export type EntityKind = 'Unit' | 'Space' | 'Resource';

export const ENTITY_KINDS: readonly EntityKind[] = ['Unit', 'Space', 'Resource'];

/** How the results are drawn. Saved in the `ui.confighub.io/layout` annotation. */
export type Layout = 'table' | 'list' | 'board' | 'matrix';

export const LAYOUTS: readonly Layout[] = ['table', 'list', 'board', 'matrix'];

/**
 * The comparison a field lens makes. `is` and `isNot` with several values are
 * `IN` and `NOT IN`; `matches` takes one glob (`*` for any text), because
 * ConfigHub filters have no OR to join several patterns.
 */
export type FieldOp =
  | 'is'
  | 'isNot'
  | 'matches'
  | 'empty'
  | 'notEmpty'
  | 'gt'
  | 'lt'
  | 'gte'
  | 'lte';

export const FIELD_OPS: readonly FieldOp[] = [
  'is',
  'isNot',
  'matches',
  'empty',
  'notEmpty',
  'gt',
  'lt',
  'gte',
  'lte',
];

/**
 * A computed state of a Unit, written as a fixed group of WHERE conjuncts.
 * One status per lens: two statuses are two lenses, joined with AND.
 */
export type StatusKind = 'unreleased' | 'upgradable' | 'released' | 'untargeted';

export const STATUS_KINDS: readonly StatusKind[] = [
  'unreleased',
  'upgradable',
  'released',
  'untargeted',
];

export interface FieldLens {
  id: string;
  enabled: boolean;
  kind: 'field';
  /** A field id from `fields.ts`, such as `Space` or `Labels.app`. */
  field: string;
  op: FieldOp;
  /** Values as text. Empty for `empty` / `notEmpty`; one for comparisons and `matches`. */
  values: string[];
}

export interface StatusLens {
  id: string;
  enabled: boolean;
  kind: 'status';
  status: StatusKind;
}

/** One valid WHERE conjunct that no field or status lens can show, kept as written. */
export interface CustomLens {
  id: string;
  enabled: boolean;
  kind: 'custom';
  where: string;
}

export type Lens = FieldLens | StatusLens | CustomLens;

/** A lens before it is given an id and an enabled state. */
export type LensSpec =
  | Omit<FieldLens, 'id' | 'enabled'>
  | Omit<StatusLens, 'id' | 'enabled'>
  | Omit<CustomLens, 'id' | 'enabled'>;

export type SortDir = 'ASC' | 'DESC';

export interface SortState {
  column: string;
  dir: SortDir;
}

/**
 * How the server computes a column that is not a plain field (a data path or
 * expression): the View column's own definition, without its name.
 */
export type ColumnSourceDef = Omit<Column, 'Name' | 'GroupBy'>;

export interface ColumnState {
  /** A field id (the name stored in `View.Columns`). */
  name: string;
  /** Width in pixels chosen by the viewer; absent means the field's default. */
  width?: number;
  /**
   * The saved definition of a computed column, kept with the column so a copy
   * of the view (Save as new, Duplicate, Pin as draft) saves it again.
   */
  source?: ColumnSourceDef;
}

/**
 * How the values along a matrix axis are ordered: by name, by their row total,
 * or by how many rows have a status. For Spaces a status counts Spaces with
 * such Units (`released`: every Unit released).
 */
export type MatrixSortKey = 'name' | 'total' | StatusKind;

export interface MatrixSort {
  key: MatrixSortKey;
  dir: SortDir;
}

export interface MatrixAxes {
  rows: string;
  cols: string;
  /** Absent means by name, ascending (the group order). */
  rowSort?: MatrixSort;
  colSort?: MatrixSort;
}

/** Everything that defines what a view shows. Saved views and drafts are both ViewDefs. */
export interface ViewDef {
  entity: EntityKind;
  lenses: Lens[];
  /** `Filter.ResourceType`, Units only. */
  resourceType: string;
  /** `Filter.WhereData`, Units only. */
  whereData: string;
  /** Group levels, outermost first. Field ids. */
  groupBy: string[];
  sort: SortState | null;
  /** Visible columns, in order. */
  columns: ColumnState[];
  layout: Layout;
  matrix: MatrixAxes;
  /**
   * Saved definitions of computed columns that are not visible (only a group
   * level or the sort), so a save writes them back unchanged. Visible columns
   * keep theirs in `columns[].source`.
   */
  extraColumnSources?: Record<string, ColumnSourceDef>;
}

/**
 * - `builtin`: "All units"; never dirty, a change forks a temporary tab.
 * - `saved`: backed by a View; `baseline` is what was saved.
 * - `temp`: only in this browser until it is named and saved; `baseline` is null.
 */
export type TabKind = 'builtin' | 'saved' | 'temp';

/** The lens states to put back when a solo (⌥-click) is undone. */
export interface SoloState {
  lensId: string;
  previous: Record<string, boolean>;
}

export interface TabState {
  id: string;
  kind: TabKind;
  viewId?: string;
  filterId?: string;
  spaceId?: string;
  name: string;
  baseline: ViewDef | null;
  work: ViewDef;
  /** Earlier `work` values, oldest first, for undo. */
  history: ViewDef[];
  pinned: boolean;
  solo?: SoloState;
}

export type EditorMode = 'lenses' | 'text';

export interface ExplorerState {
  tabs: TabState[];
  activeId: string;
  mode: EditorMode;
  /** Counter for tab ids the reducer makes itself (a fork from the built-in tab). */
  seq: number;
  /**
   * Made once per page load: fork ids are `temp-<forkPrefix>-<n>`, so two
   * browser tabs that start from the same stored state never make one id.
   */
  forkPrefix?: string;
}

/** A WHERE error: a plain message and the character span it is about. */
export interface WhereError {
  message: string;
  start: number;
  end: number;
}
