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
 *   useDistinctStageSpaces(orders, spaces) → Record<resolved where clause, ExtendedSpaceRead[]>
 *
 * A stage naming no selector is not among them: it takes every Space of its
 * component, which the caller's own Space index already answers, so it costs no
 * request at all.
 *
 * KEYED BY THE RESOLVED CLAUSE -- `stageWhereSpace(stage, component)`, the
 * string actually sent -- not by stage name and not by the stage's raw
 * selector. Stage names are only unique within one workflow, and a fleet-wide
 * list holds many, so two workflows each having a stage called `prod` must not
 * collide. The raw selector is no better a key: a stage selects within ONE
 * component, and which one is the ChangeOrder's, so two rollouts of different
 * components sharing a workflow resolve the same selector to different Spaces.
 * Keying by the clause that was sent keeps the dedup (one request per distinct
 * query, whoever asked for it) without merging two components' answers.
 * `buildConsoleRow` re-keys back to stage names per row, where the row's own
 * workflow makes that unambiguous.
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

import {
  stageSelectsWholeComponent,
  stageWhereSpace,
} from '../x/apps/rollout/changeOrderWorkflow';
import {
  orderComponent,
  type ConsoleChangeOrder,
  type ConsoleSpace,
} from '../x/apps/rollout/rolloutsConsoleModel';

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
  /** Keyed by the resolved clause — `stageWhereSpace(stage, component)`, the string sent. */
  stageSpacesByClause: Record<string, ExtendedSpaceRead[]>;
  isLoading: boolean;
}

/**
 * Resolve every distinct stage clause these rows need.
 *
 * Server-side, via the same `where` query param `apiListSpaces` sends in
 * `variant_promote.go`. No client-side expression evaluation, and one request
 * per distinct clause rather than per stage or per row.
 *
 * READS EACH ROW'S OWN WORKFLOW, because a clause is not a property of a
 * workflow alone: it is the stage's selector conjoined with the component of the
 * ChangeOrder being resolved (`stageWhereSpace`). Two rollouts governed by one
 * workflow but based in different components therefore ask two different
 * questions of the same stage, and answering either one for both would put
 * another component's Spaces in this rollout's stage.
 *
 * `spaces` is the display index the caller already holds; only the `Component`
 * label of each ChangeOrder's own base Space is read from it.
 */
export function useDistinctStageSpaces(
  orders: ConsoleChangeOrder[],
  spaces: ConsoleSpace[],
): DistinctStageSpacesResult {
  const [trigger] = useLazyListSpacesQuery();
  const [resolved, setResolved] = useState<Resolved<Record<string, ExtendedSpaceRead[]>>>({
    key: '',
    value: EMPTY_STAGE_SPACES,
  });
  const generationRef = useRef(0);

  /**
   * The clauses that have to be asked for, and the ones already answerable.
   *
   * A stage naming no selector takes every Space of its component, and this
   * hook's callers hand it the Space index those rows are drawn from — so that
   * clause is resolved from memory and never reaches the server. Asking for it
   * would be one request per such stage for a list already on the page.
   */
  const { whereKey, inMemory } = useMemo(() => {
    const bySpaceId = new Map(spaces.map((s) => [s.spaceId, s]));
    const wheres = new Set<string>();
    const answered: Record<string, ExtendedSpaceRead[]> = {};
    for (const order of orders) {
      if (order.governing.state !== 'governed') continue;
      // No component, no clause: a stage cannot be resolved without one, and
      // `buildConsoleRow` reports such a row rather than showing it stages
      // resolved some other way.
      const component = orderComponent(order, bySpaceId);
      if (component === undefined) continue;
      for (const stage of order.governing.workflow.Stages) {
        const clause = stageWhereSpace(stage, component);
        if (stageSelectsWholeComponent(stage)) {
          answered[clause] = spaces
            .filter((space) => space.component?.ComponentID === component.ComponentID)
            .map((space) => ({ Space: { SpaceID: space.spaceId } }) as ExtendedSpaceRead);
          continue;
        }
        wheres.add(clause);
      }
    }
    return { whereKey: [...wheres].sort().join(SEP), inMemory: answered };
  }, [orders, spaces]);

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

  const stageSpacesByClause = useMemo(
    () => ({ ...inMemory, ...resolved.value }),
    [inMemory, resolved.value],
  );

  return { stageSpacesByClause, isLoading: resolved.key !== whereKey };
}
