// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import type { Column, FilterRead, ViewRead } from '@confighub/rtk-query';

import {
  COLUMN_WIDTHS_ANNOTATION,
  GROUP_BY_ANNOTATION_KEY,
  LAYOUT_ANNOTATION,
  LEGACY_VIEW_TARGET_ANNOTATION,
  MATRIX_AXES_ANNOTATION,
  MAX_HIDDEN_LENSES,
  decodeColumns,
  decodeHiddenLens,
  encodeHiddenLens,
  fitColumnsAnnotation,
  fitsAnnotation,
  hiddenLensKey,
} from './annotations';
import { describeLens } from './auto-name';
import { defaultViewDef, fieldById } from './fields';
import {
  type IdGen,
  compileWhere,
  lensConjuncts,
  lensProblem,
  lensSignature,
  stableLensIds,
  whereToLenses,
} from './lens-compile';
import {
  cleanMatrixSort,
  decodeMatrixAxes,
  describeMatrixSort,
  encodeMatrixAxes,
  normalizeMatrixAxes,
  sameMatrixSort,
} from './matrix-axes';
import {
  type ColumnSourceDef,
  ENTITY_KINDS,
  type EntityKind,
  FIELD_OPS,
  LAYOUTS,
  type Layout,
  type Lens,
  STATUS_KINDS,
  type ViewDef,
} from './types';

/**
 * A ViewDef and what is saved for it: a Filter (the enabled lenses as WHERE,
 * plus ResourceType and WhereData for Units), a View (columns, grouping,
 * sort), and annotations for the rest. Loading reads the same places back.
 */

/* ------------------------------------------------------------------------ */
/* Load                                                                      */
/* ------------------------------------------------------------------------ */

/** The entity of a saved View: Filter.From, then View.Of, then the legacy annotation. */
export function entityOfSaved(
  view: ViewRead | undefined,
  filter: FilterRead | undefined,
): EntityKind {
  const from = filter?.From ?? view?.Of;
  if (from === 'Space') return 'Space';
  if (from === 'Resource') return 'Resource';
  if (view?.Annotations?.[LEGACY_VIEW_TARGET_ANNOTATION] === 'Resource') return 'Resource';
  return 'Unit';
}

/** Group levels: the Units page's annotation first, then View.GroupBy and the GroupBy columns in order. */
export function groupByOfSaved(view: ViewRead | undefined): string[] {
  const annotation = view?.Annotations?.[GROUP_BY_ANNOTATION_KEY];
  if (annotation && annotation.trim()) {
    const parts = annotation
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (parts.length) return parts;
  }
  const out: string[] = [];
  if (view?.GroupBy) out.push(view.GroupBy);
  for (const c of view?.Columns ?? []) {
    if (c.GroupBy && c.Name && !out.includes(c.Name)) out.push(c.Name);
  }
  return out;
}

export interface LoadedView {
  def: ViewDef;
  /** Things that could not be read as written, in plain words. */
  warnings: string[];
}

function isLayout(v: string | undefined): v is Layout {
  return !!v && (LAYOUTS as readonly string[]).includes(v);
}

/**
 * A saved View (and its Filter) as a ViewDef. Lens ids come from the lens
 * content (`stableLensIds`), so loading the same View twice gives the same ids;
 * `idGen` is only used for the ids of lenses while they are being read.
 */
export function viewDefFromSaved(
  view: ViewRead,
  filter: FilterRead | undefined,
  idGen: IdGen,
): LoadedView {
  const entity = entityOfSaved(view, filter);
  const def = defaultViewDef(entity);
  const warnings: string[] = [];
  const annotations = view.Annotations ?? {};

  const where = filter?.Where ?? '';
  const parsed = whereToLenses(entity, where, idGen, true);
  let lenses: Lens[];
  if (parsed.ok) {
    lenses = parsed.lenses;
  } else {
    lenses = where.trim()
      ? [{ id: idGen(), enabled: true, kind: 'custom', where: where.trim() }]
      : [];
    warnings.push(
      `The saved filter could not be read as separate conditions: ${parsed.error.message}`,
    );
  }

  const hidden: Array<{ position: number; lenses: Lens[] }> = [];
  for (let n = 1; n <= MAX_HIDDEN_LENSES; n++) {
    const value = annotations[hiddenLensKey(n)];
    if (!value) continue;
    const decoded = decodeHiddenLens(value);
    if (!decoded) continue;
    const read = whereToLenses(entity, decoded.where, idGen, false);
    if (read.ok) hidden.push({ position: decoded.position, lenses: read.lenses });
    else warnings.push(`A hidden filter could not be read: ${read.error.message}`);
  }
  hidden.sort((a, b) => a.position - b.position);
  for (const h of hidden) lenses.splice(Math.min(h.position, lenses.length), 0, ...h.lenses);
  def.lenses = stableLensIds(entity, lenses);

  if (entity === 'Unit') {
    def.resourceType = filter?.ResourceType ?? '';
    def.whereData = filter?.WhereData ?? '';
  }
  def.groupBy = groupByOfSaved(view);
  def.sort = view.OrderBy
    ? {
        column: view.OrderBy,
        dir: view.OrderByDirection?.toUpperCase() === 'DESC' ? 'DESC' : 'ASC',
      }
    : null;

  const columns = decodeColumns(annotations[COLUMN_WIDTHS_ANNOTATION]);
  if (columns) def.columns = columns;
  else if (view.Columns?.length)
    def.columns = view.Columns.filter((c) => !c.GroupBy && c.Name).map((c) => ({
      name: c.Name,
    }));
  const sources = new Map((view.Columns ?? []).map((c) => [c.Name, sourceOf(c)]));
  def.columns = def.columns.map((c) => {
    const source = sources.get(c.name);
    return source ? { ...c, source } : c;
  });
  const visible = new Set(def.columns.map((c) => c.name));
  const extra: Record<string, ColumnSourceDef> = {};
  for (const [name, source] of sources) if (source && !visible.has(name)) extra[name] = source;
  if (Object.keys(extra).length) def.extraColumnSources = extra;

  const layout = annotations[LAYOUT_ANNOTATION];
  if (isLayout(layout)) def.layout = layout;
  const axes = decodeMatrixAxes(annotations[MATRIX_AXES_ANNOTATION]);
  if (axes) def.matrix = axes;

  return { def, warnings };
}

/* ------------------------------------------------------------------------ */
/* Save                                                                      */
/* ------------------------------------------------------------------------ */

export interface FilterFields {
  From: EntityKind;
  Where: string | null;
  WhereData: string | null;
  ResourceType: string | null;
}

export interface ViewFields {
  Of: EntityKind;
  Columns: Column[] | null;
  GroupBy: string | null;
  OrderBy: string | null;
  OrderByDirection: 'ASC' | 'DESC' | null;
}

export type SaveFields =
  | {
      ok: true;
      filter: FilterFields;
      view: ViewFields;
      annotations: Record<string, string | null>;
    }
  | { ok: false; error: string };

/** A View column's definition without its name and grouping, or undefined for a plain field. */
function sourceOf(column: Column): ColumnSourceDef | undefined {
  const source: Partial<Column> = { ...column };
  delete source.Name;
  delete source.GroupBy;
  return Object.keys(source).length ? (source as ColumnSourceDef) : undefined;
}

/**
 * View.Columns for a ViewDef. The server needs every grouped and sorted
 * column listed; the visible ones come first, then the first group level and
 * the sort column when they are not visible, then group levels 2 and on with
 * `GroupBy: true`, in level order (that order is how levels are read back).
 * Properties of a column saved before (such as a data path) are kept.
 */
export function columnsForSave(def: ViewDef, previous: readonly Column[] = []): Column[] {
  const prev = new Map(previous.map((c) => [c.Name, c]));
  const kept = new Map<string, ColumnSourceDef | undefined>(
    Object.entries(def.extraColumnSources ?? {}),
  );
  for (const c of def.columns) if (c.source) kept.set(c.name, c.source);
  const base = (name: string): Column => {
    const p = prev.get(name);
    const source = p ? sourceOf(p) : kept.get(name);
    return source ? { Name: name, ...source } : { Name: name };
  };
  const levelTwoOn = def.groupBy.slice(1);
  const names: string[] = def.columns.map((c) => c.name);
  for (const extra of [def.groupBy[0], def.sort?.column]) {
    if (extra && !names.includes(extra)) names.push(extra);
  }
  const display = names.filter((n) => !levelTwoOn.includes(n)).map(base);
  const grouped = levelTwoOn.map((n) => ({ ...base(n), GroupBy: true }));
  return [...display, ...grouped];
}

/**
 * Everything to write for a ViewDef. Annotations the explorer owns are always
 * all present: a key with null clears a value saved before. Refuses (with a
 * message for the save area) what cannot be stored.
 */
export function viewDefToSave(
  def: ViewDef,
  previousColumns: readonly Column[] = [],
): SaveFields {
  const isUnit = def.entity === 'Unit';
  const where = compileWhere(def.entity, def.lenses);

  const annotations: Record<string, string | null> = {
    [LAYOUT_ANNOTATION]: def.layout === 'table' ? null : def.layout,
    [LEGACY_VIEW_TARGET_ANNOTATION]: null,
  };
  const defaults = defaultViewDef(def.entity);
  const axes = encodeMatrixAxes(def.matrix, defaults.matrix);
  if (axes !== null && !fitsAnnotation(axes)) {
    return { ok: false, error: 'The matrix axes are too long to save.' };
  }
  annotations[MATRIX_AXES_ANNOTATION] = axes;
  annotations[COLUMN_WIDTHS_ANNOTATION] = fitColumnsAnnotation(def.columns);
  const groupBy = def.groupBy.join(',');
  if (!fitsAnnotation(groupBy))
    return { ok: false, error: 'There are too many group levels to save.' };
  annotations[GROUP_BY_ANNOTATION_KEY] = groupBy || null;

  // A lens that is not finished is not saved; one that cannot be written stops the save.
  for (const lens of def.lenses) {
    const problem = lensProblem(def.entity, lens);
    if (problem?.kind === 'invalid')
      return { ok: false, error: `${describeLens(def.entity, lens)}: ${problem.message}` };
  }
  // Positions count only the lenses that are saved, which are the lenses a load gives back.
  const hidden = def.lenses
    .map((lens) => ({ lens, conjuncts: lensConjuncts(def.entity, lens) }))
    .filter((x): x is { lens: Lens; conjuncts: string[] } => x.conjuncts !== null)
    .map(({ lens, conjuncts }, position) => ({ lens, conjuncts, position }))
    .filter(({ lens }) => !lens.enabled);
  if (hidden.length > MAX_HIDDEN_LENSES) {
    return {
      ok: false,
      error: `A view can keep at most ${MAX_HIDDEN_LENSES} hidden filters. Remove or show ${hidden.length - MAX_HIDDEN_LENSES}.`,
    };
  }
  for (let n = 1; n <= MAX_HIDDEN_LENSES; n++) {
    const h = hidden[n - 1];
    const value = h ? encodeHiddenLens(h.position, h.conjuncts.join(' AND ')) : null;
    if (value !== null && !fitsAnnotation(value)) {
      return {
        ok: false,
        error: 'A hidden filter is too long to save. Show it or shorten it.',
      };
    }
    annotations[hiddenLensKey(n)] = value;
  }

  const columns = columnsForSave(def, previousColumns);
  return {
    ok: true,
    filter: {
      From: def.entity,
      Where: where || null,
      WhereData: isUnit && def.whereData.trim() ? def.whereData.trim() : null,
      ResourceType: isUnit && def.resourceType.trim() ? def.resourceType.trim() : null,
    },
    view: {
      Of: def.entity,
      Columns: columns.length ? columns : null,
      GroupBy: def.groupBy[0] ?? null,
      OrderBy: def.sort?.column ?? null,
      OrderByDirection: def.sort?.dir ?? null,
    },
    annotations,
  };
}

/* ------------------------------------------------------------------------ */
/* URL `d=` parameter                                                        */
/* ------------------------------------------------------------------------ */

/** Above this the link still works in most browsers, but Copy link warns. */
export const DRAFT_PARAM_MAX = 6 * 1024;

function toBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(param: string): string | null {
  try {
    const b64 = param.replace(/-/g, '+').replace(/_/g, '/');
    const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}

/** A ViewDef as a URL parameter, so Copy link opens the same draft. */
export function encodeDraftParam(def: ViewDef): string {
  return toBase64Url(JSON.stringify(def));
}

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const isString = (v: unknown): v is string => typeof v === 'string';

const isOneOf = <T extends string>(list: readonly T[], v: unknown): v is T =>
  isString(v) && (list as readonly string[]).includes(v);

function isLens(v: unknown): v is Lens {
  if (!isObject(v) || !isString(v.id) || typeof v.enabled !== 'boolean') return false;
  switch (v.kind) {
    case 'field':
      return (
        isString(v.field) &&
        isOneOf(FIELD_OPS, v.op) &&
        Array.isArray(v.values) &&
        v.values.every(isString)
      );
    case 'status':
      return isOneOf(STATUS_KINDS, v.status);
    case 'custom':
      return isString(v.where);
    default:
      return false;
  }
}

/** The ViewDef in a `d=` parameter, or null if it is not one (a broken or edited link). */
export function decodeDraftParam(param: string): ViewDef | null {
  const text = fromBase64Url(param);
  if (text === null) return null;
  let v: unknown;
  try {
    v = JSON.parse(text);
  } catch {
    return null;
  }
  if (!isObject(v)) return null;
  if (!isString(v.entity) || !(ENTITY_KINDS as readonly string[]).includes(v.entity))
    return null;
  if (!Array.isArray(v.lenses) || !v.lenses.every(isLens)) return null;
  if (!Array.isArray(v.groupBy) || !v.groupBy.every(isString)) return null;
  const isColumn = (c: unknown) =>
    isObject(c) &&
    isString(c.name) &&
    (c.width === undefined ||
      (typeof c.width === 'number' && Number.isFinite(c.width) && c.width > 0));
  if (!Array.isArray(v.columns) || !v.columns.every(isColumn)) return null;
  if (!isString(v.layout)) return null;
  // A link made while a layout existed that no longer does (the List) opens as the table.
  const layout: Layout = isLayout(v.layout) ? v.layout : 'table';
  if (!isObject(v.matrix) || !isString(v.matrix.rows) || !isString(v.matrix.cols)) return null;
  // A bad sort in an edited link is dropped; the rest of the link still opens.
  const matrix = normalizeMatrixAxes({
    rows: v.matrix.rows,
    cols: v.matrix.cols,
    rowSort: cleanMatrixSort(v.matrix.rowSort),
    colSort: cleanMatrixSort(v.matrix.colSort),
  });
  if (
    v.sort !== null &&
    !(
      isObject(v.sort) &&
      isString(v.sort.column) &&
      (v.sort.dir === 'ASC' || v.sort.dir === 'DESC')
    )
  )
    return null;
  if (!isString(v.resourceType) || !isString(v.whereData)) return null;
  if (
    v.extraColumnSources !== undefined &&
    !(isObject(v.extraColumnSources) && Object.values(v.extraColumnSources).every(isObject))
  )
    return null;
  return { ...(v as unknown as ViewDef), layout, matrix };
}

/* ------------------------------------------------------------------------ */
/* Equality and changes                                                      */
/* ------------------------------------------------------------------------ */

/** A ViewDef with lens ids left out, for "is this a draft?". */
function normalized(def: ViewDef): string {
  return JSON.stringify({ ...def, lenses: def.lenses.map(lensSignature) });
}

export function viewDefsEqual(a: ViewDef, b: ViewDef): boolean {
  return normalized(a) === normalized(b);
}

function fieldLabel(entity: EntityKind, id: string): string {
  return fieldById(entity, id)?.label ?? id;
}

/**
 * What changed from `from` to `to`, one plain sentence per change, for the
 * "N unsaved changes" list. Lenses are matched by id, so editing a lens is one
 * change rather than a removal and an addition.
 */
export function diffViewDefs(from: ViewDef, to: ViewDef): string[] {
  const out: string[] = [];
  const e = to.entity;
  if (from.entity !== to.entity) out.push(`Shows ${to.entity}s instead of ${from.entity}s`);

  const before = new Map(from.lenses.map((l) => [l.id, l]));
  const after = new Map(to.lenses.map((l) => [l.id, l]));
  for (const l of to.lenses) {
    const old = before.get(l.id);
    if (!old) {
      out.push(`Added filter: ${describeLens(e, l)}`);
      continue;
    }
    const a = lensSignature({ ...old, enabled: true } as Lens);
    const b = lensSignature({ ...l, enabled: true } as Lens);
    if (a !== b)
      out.push(`Changed filter: ${describeLens(from.entity, old)} → ${describeLens(e, l)}`);
    if (old.enabled !== l.enabled)
      out.push(`${l.enabled ? 'Showed' : 'Hid'} filter: ${describeLens(e, l)}`);
  }
  for (const l of from.lenses)
    if (!after.has(l.id)) out.push(`Removed filter: ${describeLens(from.entity, l)}`);
  const orderBefore = from.lenses
    .filter((l) => after.has(l.id))
    .map((l) => l.id)
    .join();
  const orderAfter = to.lenses
    .filter((l) => before.has(l.id))
    .map((l) => l.id)
    .join();
  if (orderBefore !== orderAfter) out.push('Reordered filters');

  if (from.resourceType !== to.resourceType)
    out.push(
      to.resourceType ? `Resource type: ${to.resourceType}` : 'Removed the resource type',
    );
  if (from.whereData !== to.whereData)
    out.push(
      to.whereData ? `Config data filter: ${to.whereData}` : 'Removed the config data filter',
    );

  if (from.groupBy.join() !== to.groupBy.join()) {
    out.push(
      to.groupBy.length
        ? `Grouped by ${to.groupBy.map((g) => fieldLabel(e, g)).join(' › ')}`
        : 'Removed grouping',
    );
  }
  const sortText = (d: ViewDef) => (d.sort ? `${d.sort.column} ${d.sort.dir}` : '');
  if (sortText(from) !== sortText(to)) {
    out.push(
      to.sort
        ? `Sorted by ${fieldLabel(e, to.sort.column)}, ${to.sort.dir === 'ASC' ? 'ascending' : 'descending'}`
        : 'Removed sorting',
    );
  }

  const namesBefore = from.columns.map((c) => c.name);
  const namesAfter = to.columns.map((c) => c.name);
  for (const n of namesAfter)
    if (!namesBefore.includes(n)) out.push(`Added column ${fieldLabel(e, n)}`);
  for (const n of namesBefore)
    if (!namesAfter.includes(n)) out.push(`Hid column ${fieldLabel(e, n)}`);
  const kept = (names: string[], other: string[]) =>
    names.filter((n) => other.includes(n)).join();
  if (kept(namesBefore, namesAfter) !== kept(namesAfter, namesBefore))
    out.push('Moved columns');
  const widthsBefore = new Map(from.columns.map((c) => [c.name, c.width]));
  if (to.columns.some((c) => widthsBefore.has(c.name) && widthsBefore.get(c.name) !== c.width))
    out.push('Resized columns');

  if (from.layout !== to.layout) out.push(`Layout: ${to.layout}`);
  else if (
    to.layout === 'matrix' &&
    (from.matrix.rows !== to.matrix.rows || from.matrix.cols !== to.matrix.cols)
  ) {
    out.push(`Matrix: ${fieldLabel(e, to.matrix.rows)} by ${fieldLabel(e, to.matrix.cols)}`);
  }
  if (to.layout === 'matrix') {
    if (!sameMatrixSort(from.matrix.rowSort, to.matrix.rowSort))
      out.push(`Matrix rows sorted by ${describeMatrixSort(to.matrix.rowSort)}`);
    if (!sameMatrixSort(from.matrix.colSort, to.matrix.colSort))
      out.push(`Matrix columns sorted by ${describeMatrixSort(to.matrix.colSort)}`);
  }
  return out;
}
