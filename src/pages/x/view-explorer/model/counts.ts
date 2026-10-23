// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import type { EntityKind } from './types';

/**
 * Counts for the lens column, computed from match sets: for each lens, the ids
 * of the rows it lets through, taken over the whole unfiltered row set (the
 * universe). Everything here is set arithmetic on row ids, so the numbers are
 * the same whichever way a set was found (client evaluation or a server call).
 *
 * - result: rows every enabled lens lets through.
 * - effect of an enabled lens: how many rows it removes given the others,
 *   |∩ others| − |result| (the "−N" on the lens row).
 * - effect of a disabled lens: how many rows it would remove if shown,
 *   |result| − |result ∩ set| ("off · would −N").
 * - alone: |set| (what the lens matches on its own).
 */

/**
 * Above this many rows the live counts are switched off: each lens's −N and
 * "alone N", the value counts in a lens popover and the "19 → 7" of each
 * suggestion. That work is redone on every keystroke and grows with rows ×
 * lenses (and × suggestions or values), and 5,000 rows is the largest size
 * measured to stay smooth. The row count of the result and the group counts
 * are a single pass over the rows, so they stay on at any size.
 */
export const LIVE_COUNT_ROW_LIMIT = 5000;

/** Whether the live counts are computed for a universe of this many rows. */
export function liveCountsEnabled(universeSize: number): boolean {
  return universeSize <= LIVE_COUNT_ROW_LIMIT;
}

const ROW_NOUN: Record<EntityKind, string> = {
  Unit: 'units',
  Space: 'spaces',
  Resource: 'resources',
};

/** The one sentence that says why the live counts are off, for every place that hides them. */
export function liveCountsOffText(entity: EntityKind): string {
  return `Counts are off for views over ${LIVE_COUNT_ROW_LIMIT.toLocaleString('en-US')} ${ROW_NOUN[entity]}, to keep typing fast.`;
}

export interface LensMatch {
  lensId: string;
  enabled: boolean;
  /** The ids the lens lets through; null while it is still being fetched. */
  set: ReadonlySet<string> | null;
}

export interface LensCount {
  /** Rows removed (enabled) or that would be removed (disabled); null if unknown. */
  effect: number | null;
  /** Rows matched on its own; null if unknown. */
  alone: number | null;
}

export interface CountsResult {
  /** Ids of the rows shown, in universe order. */
  result: string[];
  resultSet: ReadonlySet<string>;
  perLens: Map<string, LensCount>;
  /** True when a set was still loading: the result treats it as matching everything. */
  partial: boolean;
}

/**
 * One pass over the universe: a row in the result fails no enabled lens; a row
 * failing exactly one enabled lens is what that lens alone removes.
 */
export interface CountsOptions {
  /**
   * Compute each lens's effect and "alone" count (default true). Off above
   * LIVE_COUNT_ROW_LIMIT: those are a pass over the rows per lens, redone on
   * every keystroke, while the result needs only the one pass.
   */
  perLens?: boolean;
}

export function computeCounts(
  universe: readonly string[],
  matches: readonly LensMatch[],
  { perLens: withPerLens = true }: CountsOptions = {},
): CountsResult {
  const enabled = matches.filter((m) => m.enabled && m.set !== null);
  const onlyFail = new Map<string, number>(enabled.map((m) => [m.lensId, 0]));
  const result: string[] = [];
  for (const id of universe) {
    let fails = 0;
    let failed: string | null = null;
    for (const m of enabled) {
      if (!m.set!.has(id)) {
        fails++;
        failed = m.lensId;
        if (fails > 1) break;
      }
    }
    if (fails === 0) result.push(id);
    else if (fails === 1 && failed) onlyFail.set(failed, (onlyFail.get(failed) ?? 0) + 1);
  }
  const resultSet = new Set(result);
  const perLens = new Map<string, LensCount>();
  for (const m of matches) {
    if (m.set === null || !withPerLens) {
      perLens.set(m.lensId, { effect: null, alone: null });
      continue;
    }
    const alone = countIn(universe, m.set);
    if (m.enabled) {
      perLens.set(m.lensId, { effect: onlyFail.get(m.lensId) ?? 0, alone });
    } else {
      perLens.set(m.lensId, { effect: result.length - countIn(result, m.set), alone });
    }
  }
  return {
    result,
    resultSet,
    perLens,
    partial: matches.some((m) => m.enabled && m.set === null),
  };
}

function countIn(ids: readonly string[], set: ReadonlySet<string>): number {
  let n = 0;
  for (const id of ids) if (set.has(id)) n++;
  return n;
}

/** Rows let through by every enabled lens except `exceptLensId`: the base for value counts. */
export function resultWithout(
  universe: readonly string[],
  matches: readonly LensMatch[],
  exceptLensId: string | null,
): string[] {
  const sets = matches
    .filter((m) => m.enabled && m.set !== null && m.lensId !== exceptLensId)
    .map((m) => m.set!);
  return universe.filter((id) => sets.every((s) => s.has(id)));
}

/**
 * How many rows have each value, counted against the other lenses: the lens
 * being edited is left out, so its popover shows what each choice would give.
 * The value function returns one key per row (null counts as the empty value).
 */
export function valueCounts<R>(
  rows: readonly R[],
  rowId: (row: R) => string,
  base: ReadonlySet<string>,
  value: (row: R) => string | null,
): Map<string | null, number> {
  const counts = new Map<string | null, number>();
  for (const r of rows) {
    if (!base.has(rowId(r))) continue;
    const v = value(r);
    counts.set(v, (counts.get(v) ?? 0) + 1);
  }
  return counts;
}

/** A suggestion's "19 → 7": the result now, and the result with the suggested lens added. */
export function suggestionCount(
  result: ReadonlySet<string>,
  set: ReadonlySet<string>,
): { from: number; to: number } {
  let to = 0;
  for (const id of result) if (set.has(id)) to++;
  return { from: result.size, to };
}

/** The ids of the rows a predicate lets through, for building a match set. */
export function matchSet<R>(
  rows: readonly R[],
  rowId: (row: R) => string,
  predicate: (row: R) => boolean,
): Set<string> {
  const s = new Set<string>();
  for (const r of rows) if (predicate(r)) s.add(rowId(r));
  return s;
}
