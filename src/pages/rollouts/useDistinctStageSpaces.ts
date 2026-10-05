// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * Stage-selector resolution for a surface that shows MANY ChangeOrders at once.
 *
 * `useWorkflowStageSpaces` resolves ONE ChangeOrder's stages, which is all the
 * detail page ever needs. The console renders a list, and calling a hook per
 * row inside a `.map()` is the variable-hook-count fault React forbids. So this
 * hook resolves the DISTINCT set instead, with a fixed number of hook calls no
 * matter how many rows there are:
 *
 *   useDistinctStageSpaces(orders) → Record<stage selector, ExtendedSpaceRead[]>
 *
 * A stage naming no selector is not among them: it takes every Space its
 * ChangeOrder is headed for, which the row already carries, so it costs no
 * request at all.
 *
 * KEYED BY THE CLAUSE SENT -- `stageWhereSpace(stage)`, the stage's own
 * selector -- not by stage name. Stage names are only unique within one
 * workflow, and a fleet-wide list holds many, so two workflows each having a
 * stage called `prod` must not collide. The clause depends on the stage alone,
 * so rollouts sharing a workflow share one request per stage; what differs
 * between them is their `InScopeSpaceIDs`, which `buildConsoleRow` applies per
 * row (`changeOrderStageMembers`) when it re-keys back to stage names.
 *
 * SHARED BY BOTH CONSUMERS RATHER THAN COPIED INTO EACH. The console reads the
 * org, the component tab reads one component, but the resolution is identical
 * and its two subtleties (the generation guard, and the resolved-key loading
 * flag below) are exactly the kind that get fixed in one copy and not the other.
 *
 * ⚠️ LOADING IS DERIVED FROM WHICH KEY THE STATE HOLDS, NOT FROM A `setState`
 * IN THE EFFECT. A boolean flag is only raised after the effect runs, so the
 * render that first produces a non-empty key set reports "not loading, nothing
 * resolved" — and every row on it renders as though its stages had failed to
 * resolve. Comparing the resolved key to the current one is true on the very
 * render the work becomes necessary.
 */

import { useEffect, useMemo, useRef, useState } from 'react';

import { useLazyListSpacesQuery, type ExtendedSpaceRead } from '@confighub/rtk-query';

import { stageSelectsWholeScope, stageWhereSpace } from '../x/apps/rollout/changeOrderWorkflow';
import { type ConsoleChangeOrder } from '../x/apps/rollout/rolloutsConsoleModel';

/**
 * Key separator, NUL.
 *
 * These joined strings are split back apart, so the separator must be a
 * character the parts cannot contain. A `whereSpace` is an arbitrary filter
 * expression -- it holds spaces, commas, quotes and pipes routinely -- which
 * rules out every readable candidate.
 */
const SEP = '\u0000';

const EMPTY_STAGE_SPACES: Record<string, ExtendedSpaceRead[]> = {};

interface Resolved<T> {
  /** The joined key set `value` was resolved from. */
  key: string;
  value: T;
}

export interface DistinctStageSpacesResult {
  /**
   * Keyed by the clause sent — `stageWhereSpace(stage)`. Not yet narrowed to any
   * ChangeOrder's `InScopeSpaceIDs`; a stage naming no selector has no entry.
   */
  stageSpacesByClause: Record<string, ExtendedSpaceRead[]>;
  isLoading: boolean;
}

/**
 * Resolve every distinct stage clause these rows need.
 *
 * Server-side, via the Space list's `where` query param. No client-side
 * expression evaluation, and one request per distinct clause rather than per
 * stage or per row.
 */
export function useDistinctStageSpaces(orders: ConsoleChangeOrder[]): DistinctStageSpacesResult {
  const [trigger] = useLazyListSpacesQuery();
  const [resolved, setResolved] = useState<Resolved<Record<string, ExtendedSpaceRead[]>>>({
    key: '',
    value: EMPTY_STAGE_SPACES,
  });
  const generationRef = useRef(0);

  const whereKey = useMemo(() => {
    const wheres = new Set<string>();
    for (const order of orders) {
      if (order.governing.state !== 'governed') continue;
      for (const stage of order.governing.workflow.Stages) {
        if (!stageSelectsWholeScope(stage)) wheres.add(stageWhereSpace(stage));
      }
    }
    return [...wheres].sort().join(SEP);
  }, [orders]);

  useEffect(() => {
    // Unconditional, for the same reason as above.
    const generation = ++generationRef.current;
    if (whereKey === '') {
      setResolved({ key: '', value: EMPTY_STAGE_SPACES });
      return;
    }
    const wheres = whereKey.split(SEP);

    const resolveOne = async (where: string): Promise<readonly [string, ExtendedSpaceRead[]]> => {
      try {
        // No `preferCacheValue` here, unlike the workflow chain above: which
        // Spaces an expression selects genuinely changes as Spaces are created
        // and relabelled, so a re-resolution must ask the server again.
        //
        // No `select` either -- `'*'` is not a REST wildcard here (the API
        // 400s on it, "field '*' does not exist"); omitting `select` is what
        // the OpenAPI spec defines as "all fields returned", the correct
        // equivalent of the CLI's own `apiListSpaces(..., "*")`, whose `"*"`
        // is a client-side sentinel expanded before the request is built,
        // never sent to the wire literally.
        return [where, await trigger({ where }).unwrap()] as const;
      } catch {
        // A clause that cannot be resolved yields no Spaces for its own stage,
        // and leaves every other stage's answer intact.
        return [where, []] as const;
      }
    };

    void Promise.all(wheres.map(resolveOne))
      .then((entries) => {
        if (generationRef.current !== generation) return;
        setResolved({ key: whereKey, value: Object.fromEntries(entries) });
      })
      // Unreachable for the same reason as above, and recorded anyway for the
      // same reason: a resolution that never lands is a skeleton that never
      // clears.
      .catch(() => {
        if (generationRef.current !== generation) return;
        setResolved({ key: whereKey, value: EMPTY_STAGE_SPACES });
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on whereKey, not the object identity
  }, [whereKey, trigger]);

  return { stageSpacesByClause: resolved.value, isLoading: resolved.key !== whereKey };
}
