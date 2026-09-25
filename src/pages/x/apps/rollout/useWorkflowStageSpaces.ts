// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * Resolves each ChangeWorkflow stage's `WhereSpace` to the Spaces it
 * currently selects -- server-side, via the same `where` query param
 * `apiListSpaces` sends in `public/cmd/cub/variant_promote.go`. No
 * client-side expression evaluation.
 *
 * The query is `stageWhereSpace(stage, component)`, not the stage's raw
 * selector: a stage selects within ONE component, and which one is the
 * ChangeOrder's rather than the definition's. Without that term every stage
 * would resolve to every component's Spaces at that stage, and the rollout
 * would gate on -- and promote into -- unrelated components.
 *
 * NO `select`, DELIBERATELY -- not the `"*"` the CLI's own `apiListSpaces`
 * calls pass. That `"*"` is a CLI-internal sentinel `handleSelectParameter`
 * expands into a real column list before the request is ever built
 * (`public/cmd/cub/space_list.go`); it is never sent to the wire as
 * `select=*`. This hook talks to the REST API directly, where `select` only
 * accepts a comma-separated field list or omission -- per the OpenAPI spec,
 * "if not specified, all fields are returned" -- so omitting it is the
 * correct equivalent, not a stand-in for the CLI's literal string.
 *
 * One imperative trigger call per stage rather than one `useListSpacesQuery`
 * hook call per stage: the number of stages varies across renders (a
 * different ChangeOrder, a workflow edit), and React forbids a variable
 * number of hook calls. RTK Query's normalized cache still dedupes identical
 * `{ where }` args across every rollout sharing a workflow revision, so this
 * costs one request per DISTINCT whereSpace string, not per ChangeOrder.
 *
 * ⚠️ LOADING IS DERIVED FROM WHICH KEY THE STATE HOLDS, NOT FROM A `setState`
 * IN THE EFFECT — the same rule `useDistinctStageSpaces` states at length.
 * A boolean raised inside the effect is only observable on the NEXT render, so
 * the render where `stages` first becomes non-empty reports "not loading, and
 * nothing resolved": `deriveConsoleState` reads a stage set that is entirely
 * empty as `no-stages`, and the pane flashes "No stage of this rollout selects
 * any Space" before correcting itself. Comparing the resolved key to the
 * current one is true on the very render the work becomes necessary.
 */

import { useEffect, useRef, useState } from 'react';

import {
  useLazyListSpacesQuery,
  type ChangeWorkflowStage,
  type ComponentRead,
  type ExtendedSpaceRead,
} from '@confighub/rtk-query';

import { stageSelectsWholeComponent, stageWhereSpace } from './changeOrderWorkflow';

/**
 * The key a resolution is recorded and compared under.
 *
 * ⚠️ IT IS EXACTLY `''` WHENEVER THERE IS NOTHING TO RESOLVE, and that is a
 * contract, not a detail. The hook reports itself loading by comparing the key
 * it is being asked for against the key it last resolved, and the empty case is
 * recorded under `''`. A key built from anything else in that case — the
 * component's own Space ids, say — can never equal the one recorded, so the
 * hook reports loading for the rest of its life and the surface above it shows
 * a skeleton that never clears.
 *
 * Exported so that contract is tested rather than assumed, and used by both the
 * key and the effect's guard so there is one expression to get right.
 */
export function stageResolutionKey(
  component: ComponentRead | undefined,
  stages: ChangeWorkflowStage[] | undefined,
  componentSpaceIds: readonly string[],
): string {
  if (component === undefined || stages === undefined || stages.length === 0) return '';
  return [
    [...componentSpaceIds].sort().join(','),
    ...stages.map((s) => `${component.ComponentID}::${s.Name}::${s.WhereSpace ?? ''}`),
  ].join('|');
}

export interface WorkflowStageSpacesResult {
  stageSpaces: Record<string, ExtendedSpaceRead[]>;
  isLoading: boolean;
  error: string | undefined;
}

const EMPTY: Record<string, ExtendedSpaceRead[]> = {};

/**
 * @param component The component the ChangeOrder belongs to, conjoined onto
 * every stage's selector. Undefined resolves nothing, deliberately: a rollout whose
 * base Space has no Component reaches here as `undefined`, and a stage
 * resolved without the component term would pull in every OTHER component's
 * Spaces at that stage. Resolving nothing is the honest answer; the caller
 * reports the missing label rather than rendering a rollout that is not there.
 * @param componentSpaceIds Every Space of that component, as the caller already
 * holds them. A stage naming no selector takes exactly this set, so it is
 * answered from here and costs no request — the caller has the list on screen
 * already, and asking the server to repeat it would be a query per stage for
 * data in hand. An id list is a complete answer because the only field read
 * downstream is the id (`buildRolloutSequence`).
 */
export function useWorkflowStageSpaces(
  stages: ChangeWorkflowStage[] | undefined,
  component: ComponentRead | undefined,
  componentSpaceIds: readonly string[],
): WorkflowStageSpacesResult {
  const [trigger] = useLazyListSpacesQuery();
  /** The stage key `value` was resolved from, so loading is a comparison rather than a flag. */
  const [resolved, setResolved] = useState<{ key: string; value: Record<string, ExtendedSpaceRead[]> }>({
    key: '',
    value: EMPTY,
  });
  const [error, setError] = useState<string | undefined>(undefined);
  // Guards against a slow earlier resolution overwriting a faster later one
  // when `stages` changes mid-flight (new ChangeOrder selected while the
  // previous one's stage queries are still in the air).
  const generationRef = useRef(0);

  // The component is part of the key, not just the query: the same stages
  // resolve to different Spaces under a different component. With no component
  // the key is empty, which is the same "nothing to resolve" the empty stage
  // list produces -- reported as resolved rather than as forever loading.
  // The in-memory set is part of the key too: a stage answered from it resolves
  // differently once the caller's Space list arrives, and a key that ignored it
  // would report the empty first render as the settled answer.
  const componentSpacesKey = [...componentSpaceIds].sort().join(',');
  const stagesKey = stageResolutionKey(component, stages, componentSpaceIds);

  useEffect(() => {
    // Bumped unconditionally, before the empty check, so ANY effect
    // re-run -- including one that resets to the empty state -- invalidates
    // whatever generation was still in flight from a previous run.
    const generation = ++generationRef.current;
    // THE SAME EXPRESSION THE KEY IS BUILT FROM, not a second spelling of it.
    // What this hook reports as loading is a comparison between the key asked
    // for and the key resolved, so a guard that decided "nothing to resolve"
    // by its own reckoning could record `''` for a key that was not `''` — and
    // then the two never match again. That is not hypothetical: it is what
    // left rollouts with no workflow waiting forever on work already done.
    if (stagesKey === '' || component === undefined) {
      // The empty state is a RESOLUTION of the empty key, recorded as one.
      // Leaving the previous key in place here would report a hook that has
      // nothing left to resolve as loading, forever.
      setResolved({ key: '', value: EMPTY });
      setError(undefined);
      return;
    }
    setError(undefined);
    const componentSpaces: ExtendedSpaceRead[] = componentSpacesKey === ''
      ? []
      : componentSpacesKey.split(',').map((SpaceID) => ({ Space: { SpaceID } }) as ExtendedSpaceRead);
    Promise.all(
      (stages ?? []).map((stage) =>
        // A stage with no selector of its own takes every Space of the
        // component, which the caller already holds. Answered from there.
        stageSelectsWholeComponent(stage)
          ? Promise.resolve([stage.Name, componentSpaces] as const)
          : // No `select`: the generated API only accepts a comma-separated field
            // list or omission -- "all fields are returned" when omitted. `'*'`
            // is not a wildcard here and the server 400s on it ("field '*' does
            // not exist on entity type Space"), which silently emptied every
            // stage's resolved Spaces (caught by the `.catch` below) and made
            // every rollout render as though no stage selected anything.
            trigger({ where: stageWhereSpace(stage, component) })
              .unwrap()
              .then((spaces) => [stage.Name, spaces] as const),
      ),
    )
      .then((entries) => {
        if (generationRef.current !== generation) return;
        setResolved({ key: stagesKey, value: Object.fromEntries(entries) });
      })
      .catch((err) => {
        if (generationRef.current !== generation) return;
        setError(String(err instanceof Error ? err.message : err));
        // An error is this generation's terminal answer, not a pause in it, so
        // it is recorded against the key: a failure that never stops loading is
        // a skeleton that never clears.
        setResolved({ key: stagesKey, value: EMPTY });
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on stagesKey, which encodes the stages, the component and the in-memory Space set, not on any array identity
  }, [stagesKey, componentSpacesKey, trigger]);

  return { stageSpaces: resolved.value, isLoading: resolved.key !== stagesKey, error };
}
