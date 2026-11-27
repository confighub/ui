// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
// What one Unit has staged: upstream upgrades the person ticked, manual edits, and Keep on
// merge changes. It lives above the field view (one store per Unit in the side pane), so a
// scope switch or a remount of the view loses nothing.
//
// Keys are stage keys (`docStageKey`). Nothing here writes: the commit reads the state and
// builds the write, and the store is told `committed` afterwards.
import { STAGED_DELETE_SENTINEL } from './types';

export interface StagingState {
  /** Upstream upgrades ticked by the person, or by entering Incoming. */
  upgrades: ReadonlySet<string>;
  /** Manual edits: stage key → the value typed, or STAGED_DELETE_SENTINEL for a removal. */
  edits: ReadonlyMap<string, string>;
  /** Keys a manual edit adds (absent in the Unit before). A subset of `edits`. */
  adds: ReadonlySet<string>;
  /** Keep on merge changes: stage key → keep (true) or let merges update it (false). */
  protection: ReadonlyMap<string, boolean>;
}

export const EMPTY_STAGING: StagingState = {
  upgrades: new Set(),
  edits: new Map(),
  adds: new Set(),
  protection: new Map(),
};

export type StagingAction =
  /** Stage a manual edit (an edit only stages; the commit writes). `add` marks a key the Unit does not hold. */
  | { type: 'stageEdit'; key: string; value: string; add?: boolean }
  | { type: 'stageRemove'; key: string }
  | { type: 'unstageEdit'; key: string }
  | { type: 'stageUpgrade'; key: string; on: boolean }
  /** Entering Incoming ticks every upgradable key, so a person starts from the whole upgrade. Guarded keys are never in `keys`. */
  | { type: 'stageAll'; keys: Iterable<string> }
  /** Leaving Incoming drops the upgrade picks only; edits and keeps stay, as they are the person's own work. */
  | { type: 'clearUpgradeOnly' }
  /** Keep on merge, or let merges update it. `committed` is what the Unit holds now. */
  | { type: 'setProtection'; key: string; keep: boolean; committed: boolean }
  /** Stop keeping every key in `keys` (the Kept on merge scope's footer action). */
  | { type: 'stopKeepingAll'; keys: Iterable<string> }
  | { type: 'discardAll' }
  /** After a Keep on merge write: drop the staged keeps. */
  | { type: 'protectionCommitted' }
  /**
   * After a value write: drop the staged values. The staged keeps stay until their own write
   * succeeds (`protectionCommitted`), so a failed guard write can be tried again. `withheldKeys`
   * are the keys a guard withheld (offered again, unticked).
   */
  | { type: 'committed'; withheldKeys?: Iterable<string> };

function without<K>(set: ReadonlySet<K>, key: K): Set<K> {
  const next = new Set(set);
  next.delete(key);
  return next;
}

function withoutKey<K, V>(map: ReadonlyMap<K, V>, key: K): Map<K, V> {
  const next = new Map(map);
  next.delete(key);
  return next;
}

export function stagingReducer(state: StagingState, action: StagingAction): StagingState {
  switch (action.type) {
    case 'stageEdit': {
      const edits = new Map(state.edits);
      edits.set(action.key, action.value);
      const adds = action.add ? new Set(state.adds).add(action.key) : state.adds;
      return { ...state, edits, adds };
    }
    case 'stageRemove': {
      // Removing a key this person added only takes the add back.
      if (state.adds.has(action.key)) {
        return {
          ...state,
          edits: withoutKey(state.edits, action.key),
          adds: without(state.adds, action.key),
        };
      }
      const edits = new Map(state.edits);
      edits.set(action.key, STAGED_DELETE_SENTINEL);
      return { ...state, edits };
    }
    case 'unstageEdit':
      if (!state.edits.has(action.key)) return state;
      return {
        ...state,
        edits: withoutKey(state.edits, action.key),
        adds: without(state.adds, action.key),
      };
    case 'stageUpgrade': {
      if (state.upgrades.has(action.key) === action.on) return state;
      const upgrades = new Set(state.upgrades);
      if (action.on) upgrades.add(action.key);
      else upgrades.delete(action.key);
      return { ...state, upgrades };
    }
    case 'stageAll': {
      const upgrades = new Set(state.upgrades);
      for (const key of action.keys) upgrades.add(key);
      return upgrades.size === state.upgrades.size ? state : { ...state, upgrades };
    }
    case 'clearUpgradeOnly':
      return state.upgrades.size === 0 ? state : { ...state, upgrades: new Set() };
    case 'setProtection': {
      // A keep that returns to what the Unit holds is no change any more.
      if (action.keep === action.committed) {
        return state.protection.has(action.key)
          ? { ...state, protection: withoutKey(state.protection, action.key) }
          : state;
      }
      const protection = new Map(state.protection);
      protection.set(action.key, action.keep);
      return { ...state, protection };
    }
    case 'stopKeepingAll': {
      const protection = new Map(state.protection);
      for (const key of action.keys) protection.set(key, false);
      return { ...state, protection };
    }
    case 'protectionCommitted':
      return state.protection.size === 0 ? state : { ...state, protection: new Map() };
    case 'discardAll':
      return EMPTY_STAGING;
    case 'committed':
      // Every staged value is written or was withheld. A change a guard withheld is still
      // incoming (the Unit keeps what it held), so it is offered again, unticked.
      return state.protection.size === 0
        ? EMPTY_STAGING
        : { ...EMPTY_STAGING, protection: state.protection };
  }
}

/** Whether nothing is staged: no upgrade ticked, no edit, no Keep on merge change. */
export function isEmptyStaging(state: StagingState): boolean {
  return state.upgrades.size === 0 && state.edits.size === 0 && state.protection.size === 0;
}

/** Keys with a staged value change: edits win over upgrades of the same key: the person typed it. */
export function stagedValueKeys(state: StagingState): Set<string> {
  return new Set([...state.upgrades, ...state.edits.keys()]);
}

/** What the commit writes for each key: the edit if there is one, else the upgrade. */
export function commitPlan(state: StagingState): {
  edits: Map<string, string>;
  upgrades: Set<string>;
} {
  const upgrades = new Set([...state.upgrades].filter((k) => !state.edits.has(k)));
  return { edits: new Map(state.edits), upgrades };
}

export interface StagedCounts {
  /** Manual edits, adds and removals. */
  edits: number;
  /** Upstream changes ticked. */
  upgrades: number;
  /** Keep on merge changes. */
  keeps: number;
}

export function stagedCounts(state: StagingState): StagedCounts {
  const plan = commitPlan(state);
  // The keys of one list item this person adds (an env var's name and value) are one edit.
  const edits = new Set<string>();
  for (const key of plan.edits.keys()) {
    const element = state.adds.has(key) ? /^(.*\.\d+)\.[^.]+$/.exec(key)?.[1] : undefined;
    edits.add(element !== undefined ? `\u0000${element}` : key);
  }
  return {
    edits: edits.size,
    upgrades: plan.upgrades.size,
    keeps: state.protection.size,
  };
}

/**
 * The footer verb: any staged edit, add, remove or Keep on merge change writes with
 * "Update"; only upstream changes merge with "Upgrade". N is the edits, or the keep changes
 * when there is no edit, or the upgrades.
 */
export function footerVerb(counts: StagedCounts): {
  verb: 'Update' | 'Upgrade';
  count: number;
} {
  if (counts.edits > 0) return { verb: 'Update', count: counts.edits };
  if (counts.keeps > 0) return { verb: 'Update', count: counts.keeps };
  return { verb: 'Upgrade', count: counts.upgrades };
}
