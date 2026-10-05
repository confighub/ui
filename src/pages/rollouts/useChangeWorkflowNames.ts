// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * What to call the ChangeWorkflow a rollout is governed by.
 *
 * The copy a ChangeOrder carries is a `ChangeWorkflowSpec`: stages, final gates
 * and declared prerequisites, and nothing else. It has no `Slug`, no
 * `DisplayName` and no id of its own, so a screen that says "governed by
 * staged-rollout" cannot get that name from the rollout. It reads the
 * `ChangeWorkflowID` beside the copy and looks the entity up.
 *
 * ONE UNPARAMETERISED, ORG-WIDE LIST, and that is deliberate. A
 * `where ChangeWorkflowID IN (…)` keyed on the rows currently visible mints a
 * new cache entry on every filter, every sort and every navigation, and no two
 * of those entries can be reused for each other. The unparameterised list is a
 * SINGLE cache entry that every view of every row already answers from, so
 * paging, filtering and sorting cost nothing.
 *
 * An org's workflows are few — they are definitions, not rollouts — so reading
 * all of them is cheaper than reading the right subset repeatedly.
 */

import { useMemo } from 'react';

import { useListAllChangeWorkflowsQuery } from '@confighub/rtk-query';

export interface ChangeWorkflowNames {
  /**
   * `ChangeWorkflowID` → the workflow's `Slug`. A missing key is a workflow
   * that is no longer there, which is expected: the id is provenance and no
   * foreign key backs it.
   */
  byId: ReadonlyMap<string, string>;
  isLoading: boolean;
  /**
   * True when the lookup failed. Callers degrade to raw ids rather than hiding
   * rows: a name that could not be read is a display limitation, never a reason
   * to withhold a rollout.
   */
  failed: boolean;
}

const NO_NAMES: ReadonlyMap<string, string> = new Map();

export function useChangeWorkflowNames(skip = false): ChangeWorkflowNames {
  const { data, isLoading, error } = useListAllChangeWorkflowsQuery({}, { skip });

  /*
   * MEMOISED ON `data`, not rebuilt inline at the call site. The consoles hold
   * their rows in a `useMemo` keyed on this; a map whose identity changed every
   * render would re-run `buildConsoleRow` for every row on every render, which
   * is worse than not having the names at all.
   */
  const byId = useMemo(() => {
    if (data === undefined) return NO_NAMES;
    const index = new Map<string, string>();
    for (const entry of data) {
      const workflow = entry.ChangeWorkflow;
      if (workflow?.ChangeWorkflowID === undefined || workflow.Slug === undefined) continue;
      index.set(workflow.ChangeWorkflowID, workflow.Slug);
    }
    return index;
  }, [data]);

  return { byId, isLoading, failed: error !== undefined };
}

/**
 * How a rollout's workflow is labelled, given what the lookup found.
 *
 * Three answers, and they must stay distinct. A rollout nothing governs is not
 * one whose workflow was deleted, and neither is one whose name simply has not
 * arrived — presenting any of them as another tells a reader to go looking for
 * the wrong thing.
 */
export function changeWorkflowLabel(
  changeWorkflowId: string | undefined,
  names: ChangeWorkflowNames,
): string {
  if (changeWorkflowId === undefined) return changeWorkflowNameCopy.ungoverned;
  const slug = names.byId.get(changeWorkflowId);
  if (slug !== undefined) return slug;
  if (names.isLoading) return changeWorkflowNameCopy.loading;
  // The id outlives the workflow by design, so this is an ordinary state and
  // not an error. The rollout still has its rules: they travelled with it.
  return names.failed
    ? changeWorkflowNameCopy.unnamed(changeWorkflowId)
    : changeWorkflowNameCopy.deleted;
}

/**
 * Where a rollout's workflow is viewed and edited: its page in the workflow
 * builder. `null` when there is nothing to open — nothing governs the rollout,
 * or the lookup succeeded and the workflow is not there any more.
 *
 * A lookup that failed or has not arrived still links: nothing says the
 * workflow is gone, and the builder answers that itself.
 */
export function changeWorkflowHref(
  changeWorkflowId: string | undefined,
  names: ChangeWorkflowNames,
): string | null {
  if (changeWorkflowId === undefined) return null;
  if (!names.byId.has(changeWorkflowId) && !names.isLoading && !names.failed) return null;
  return `/x/workflow-builder/${encodeURIComponent(changeWorkflowId)}`;
}

export const changeWorkflowNameCopy = {
  ungoverned: 'No workflow',
  loading: 'Loading…',
  deleted: 'Workflow deleted',
  /** The lookup failed, so the id is the most specific thing that can be said. */
  unnamed: (changeWorkflowId: string) => `Workflow ${changeWorkflowId.slice(0, 8)}`,
} as const;
