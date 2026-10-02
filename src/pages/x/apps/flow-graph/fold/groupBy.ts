// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import type { ComponentDeployment } from '../../componentTypes';
import { DERIVED_GROUP_KEYS, type GroupCell, derivedGroupKey } from './derivedGroupKeys';
import { DEFAULT_GROUP_KEYS, SINGLES_MERGE_MIN, STAGE_LABEL_KEY } from './foldConstants';

/** One choice in the Group by menu. */
export interface GroupByOption {
  /**
   * The Space label key, as spelled in the data, or a derived key
   * (`@revision`, `@k8s`, `@released`).
   */
  key: string;
  /** What the menu shows. */
  label: string;
  /** Distinct values over the Component's Deployments; "no value" counts as one. */
  valueCount: number;
  isDefault: boolean;
}

/**
 * One cell of a Base's fold.
 * - `stack`: two or more quiet members that share a label value.
 * - `loose`: a group of 1, shown as a plain quiet card, never as a stack.
 * - `other`: four or more groups of 1 merged into one stack.
 */
export interface QuietGroup {
  id: string;
  kind: 'stack' | 'loose' | 'other';
  /**
   * The value the members share: a label value, or a derived value (the
   * revisions behind, the Kubernetes minor version, the release bucket). Null for "no value" and
   * for merged or ungrouped stacks.
   */
  value: string | null;
  label: string;
  /** Sorted by display name. */
  memberIds: string[];
  /**
   * For `other`: the labels of the groups of 1 it holds, in their sorted
   * order. The stack previews them and the fold header lists them.
   */
  mergedLabels?: string[];
}

/** The Space label `Stage`, as any spelling of it; not the DAG depth. */
const isStageLabel = (key: string): boolean =>
  key.toLowerCase() === STAGE_LABEL_KEY.toLowerCase();

const byText = (a: string, b: string): number => a.localeCompare(b);

/**
 * A member's value for a key. An empty or blank value is no value, so no
 * stack has a blank name; surrounding spaces are not part of a value.
 */
function labelValue(m: ComponentDeployment, key: string): string | null {
  const value = m.labels[key]?.trim();
  return value === undefined || value === '' ? null : value;
}

/**
 * What decides that two members share a value: "Retail" and "retail" are one
 * value, so one stack, shown with the spelling met first.
 */
const sameValueKey = (cell: GroupCell | null): string | null =>
  cell === null ? null : cell.value.toLowerCase();

/** A member's cell for any Group by key; null is "no value". */
function groupCell(m: ComponentDeployment, key: string): GroupCell | null {
  const derived = derivedGroupKey(key);
  if (derived) return derived.cell(m);
  const value = labelValue(m, key);
  return value === null ? null : { value, label: value, rank: 0 };
}

/** How a Group by key splits the members. */
interface KeySplit {
  /** Distinct values, "no value" counted as one. */
  valueCount: number;
  /**
   * Two or more members of one Base share a value (or "no value"), so the
   * key makes at least one stack. Stacks never cross a Base.
   */
  stacks: boolean;
  /** Every Base's members share one value: the key only repeats the Base split. */
  repeatsBases: boolean;
}

/** How each candidate key (every label key, and every derived key) splits the members. */
function keySplits(members: readonly ComponentDeployment[]): Map<string, KeySplit> {
  const keys = new Set<string>();
  for (const m of members) {
    for (const [key, value] of Object.entries(m.labels)) {
      if (value.trim() !== '') keys.add(key);
    }
  }
  if (members.length > 0) for (const d of DERIVED_GROUP_KEYS) keys.add(d.key);
  const splits = new Map<string, KeySplit>();
  for (const key of keys) {
    const values = new Set<string | null>();
    const inBase = new Map<string, number>();
    const perBase = new Map<string | null, Set<string | null>>();
    for (const m of members) {
      const value = sameValueKey(groupCell(m, key));
      values.add(value);
      const cell = JSON.stringify([m.parentDeploymentId, value]);
      inBase.set(cell, (inBase.get(cell) ?? 0) + 1);
      let baseValues = perBase.get(m.parentDeploymentId);
      if (!baseValues) {
        baseValues = new Set();
        perBase.set(m.parentDeploymentId, baseValues);
      }
      baseValues.add(value);
    }
    splits.set(key, {
      valueCount: values.size,
      stacks: [...inBase.values()].some((n) => n >= 2),
      repeatsBases: [...perBase.values()].every((baseValues) => baseValues.size === 1),
    });
  }
  return splits;
}

/** The first preferred default key among the usable ones, as spelled in the data. */
function preferredDefault(usable: readonly string[]): string | null {
  for (const wanted of DEFAULT_GROUP_KEYS) {
    const key = usable.find((k) => k.toLowerCase() === wanted.toLowerCase());
    if (key) return key;
  }
  return null;
}

/** The name shown for a Group by key: the label key as spelled, or a derived key's name. */
export function groupKeyLabel(key: string): string {
  return derivedGroupKey(key)?.label ?? key;
}

/** One value's worth of a key, in lower case: "department", "upstream revision". */
export function groupKeyNoun(key: string): string {
  return derivedGroupKey(key)?.noun ?? key.toLowerCase();
}

/**
 * The plural used in merged-stack labels: "departments", "regions", "cities",
 * "upstream revisions".
 */
export function groupKeyPlural(key: string): string {
  const derived = derivedGroupKey(key);
  if (derived) return derived.plural;
  const lower = key.toLowerCase();
  if (/[^aeiou]y$/.test(lower)) return `${lower.slice(0, -1)}ies`;
  return `${lower}s`;
}

/**
 * The Group by choices for a Component: every Space label key on its
 * Deployments that splits them (more than one value), without keys whose
 * every value is on one Deployment (Cluster, Variant): those make only
 * "1 each" stacks, and without keys that only repeat the Base split
 * (Environment): those give one stack per Base, which the Bases already show.
 * The Stage label is the exception: the user asked for it by name, so it is
 * offered whenever the Spaces have it, even when it gives one stack per Base,
 * but it is never the default. A derived key (Upstream revision, Kubernetes
 * version, Last released, Cloud provider) is offered by the same rule as a
 * label key, and is never the default. The default comes first, then the
 * other label keys by label, then the derived keys.
 *
 * @param members the leaf Deployments of the Component
 */
export function groupByOptions(members: readonly ComponentDeployment[]): GroupByOption[] {
  const listed = [...keySplits(members)].filter(
    ([key, split]) =>
      isStageLabel(key) || (split.valueCount > 1 && split.stacks && !split.repeatsBases),
  );
  const defaultCandidates = listed
    .map(([key]) => key)
    .filter((key) => !isStageLabel(key) && !derivedGroupKey(key))
    .sort(byText);
  const def = preferredDefault(defaultCandidates) ?? defaultCandidates[0] ?? null;
  const derivedRank = (key: string): number =>
    DERIVED_GROUP_KEYS.findIndex((d) => d.key === key);
  return listed
    .map(
      ([key, split]): GroupByOption => ({
        key,
        label: groupKeyLabel(key),
        valueCount: split.valueCount,
        isDefault: key === def,
      }),
    )
    .sort(
      (a, b) =>
        Number(b.isDefault) - Number(a.isDefault) ||
        derivedRank(a.key) - derivedRank(b.key) ||
        byText(a.label, b.label),
    );
}

/** The menu's line under a key: "4 values, 15 stacks", "1 value, 1 stack". */
export function drawnCountsText(values: number, stacks: number): string {
  return `${values} ${values === 1 ? 'value' : 'values'}, ${stacks} ${stacks === 1 ? 'stack' : 'stacks'}`;
}

/**
 * What the Group by button shows: `Off` when the graph does not fold, the key
 * it folds by, or `None` when it folds and no label splits the Deployments.
 * The button always works in Auto mode, so there is no disabled state.
 */
export function groupByButtonLabel(folding: boolean, groupKey: string | null): string {
  if (!folding) return 'Off';
  return groupKey === null ? 'None' : groupKeyLabel(groupKey);
}

/**
 * The fixed Group by key for a Component: Department when it has two or more
 * values, else Region, else the first option other than Stage, else null.
 * The choice never depends on fit or health, so the stacks a user learned do
 * not change shape between visits.
 */
export function defaultGroupKey(members: readonly ComponentDeployment[]): string | null {
  return groupByOptions(members).find((o) => o.isDefault)?.key ?? null;
}

/** The requested key when it is an option (for example from `?graphGroup=`), else the fallback. */
export function resolveGroupKey(
  requested: string | null | undefined,
  options: readonly GroupByOption[],
  fallback: string | null,
): string | null {
  if (requested && options.some((o) => o.key === requested)) return requested;
  return fallback;
}

const byDisplayName = (a: ComponentDeployment, b: ComponentDeployment): number =>
  byText(a.displayName, b.displayName);

/**
 * Put a Base's quiet members into cells by one key. Cells sort by rank (a
 * derived key's order, such as revisions behind), then A-Z by the name they
 * show, with "no value" last. A group of 1 is never a stack: up to three of them
 * are plain quiet cards in their sorted place; four or more merge into one
 * stack, so a key with many one-off values does not fill the fold with
 * single cards.
 */
export function groupQuiet(
  baseId: string,
  quiet: readonly ComponentDeployment[],
  key: string | null,
): QuietGroup[] {
  if (quiet.length === 0) return [];
  const idFor = (suffix: string) => `stack:${baseId}:${suffix}`;

  if (key === null) {
    const members = [...quiet].sort(byDisplayName);
    return [
      {
        id: idFor('__quiet'),
        kind: members.length === 1 ? 'loose' : 'stack',
        value: null,
        label: 'Quiet',
        memberIds: members.map((m) => m.deploymentId),
      },
    ];
  }

  const byValue = new Map<
    string | null,
    { cell: GroupCell | null; members: ComponentDeployment[] }
  >();
  for (const m of quiet) {
    const cell = groupCell(m, key);
    const same = sameValueKey(cell);
    const entry = byValue.get(same);
    if (entry) entry.members.push(m);
    else byValue.set(same, { cell, members: [m] });
  }

  const noValueLabel = derivedGroupKey(key)?.noValueLabel ?? `No ${key.toLowerCase()}`;
  const groups: QuietGroup[] = [...byValue.values()]
    .sort(({ cell: a }, { cell: b }) => {
      if (a === null) return b === null ? 0 : 1;
      if (b === null) return -1;
      return a.rank - b.rank || byText(a.label, b.label) || byText(a.value, b.value);
    })
    .map(({ cell, members }) => {
      members.sort(byDisplayName);
      return {
        // A value's id carries a prefix no reserved id has, so a value that
        // is spelled `__other` never meets the merged stack's id.
        id: idFor(
          cell === null ? '__none' : `v:${encodeURIComponent(sameValueKey(cell) ?? '')}`,
        ),
        kind: 'stack',
        value: cell?.value ?? null,
        label: cell === null ? noValueLabel : cell.label,
        memberIds: members.map((m) => m.deploymentId),
      };
    });

  const singles = groups.filter((g) => g.memberIds.length === 1);
  if (singles.length >= SINGLES_MERGE_MIN) {
    const plural = groupKeyPlural(key);
    const allSingles = singles.length === groups.length;
    const byId = new Map(quiet.map((m) => [m.deploymentId, m]));
    const merged = singles
      .map((g) => byId.get(g.memberIds[0]))
      .filter((m): m is ComponentDeployment => m !== undefined)
      .sort(byDisplayName);
    return [
      ...groups.filter((g) => g.memberIds.length > 1),
      {
        id: idFor('__other'),
        kind: 'other',
        value: null,
        label: allSingles ? `${singles.length} ${plural}, 1 each` : `Other ${plural}`,
        memberIds: merged.map((m) => m.deploymentId),
        mergedLabels: singles.map((g) => g.label),
      },
    ];
  }
  return groups.map((g) => (g.memberIds.length === 1 ? { ...g, kind: 'loose' } : g));
}
