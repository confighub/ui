// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * One rollout, addressed by slug, reduced to everything the detail screen draws.
 *
 * DERIVES, NEVER FETCHES, THE ROLLOUT DOMAIN. Stage sequence, gates, per-stage
 * state and progress all come from `x/apps/rollout/`, which is the same logic
 * the per-component view runs. Duplicating any of it here would mean two
 * implementations that can disagree about whether a promotion is allowed.
 *
 * ⚠️ TWO READS ON ENTRY, AND THE SECOND ONE IS THE EXPENSIVE ONE.
 * `/change_order` derives `InScopeSpaceIDs`, `ResolvedSpaceIDs`,
 * `ReleasedSpaceIDs` and `State` per row at read time by walking a Links+Units
 * graph, and the route carries no `limit` or `order_by`, so the read is
 * unbounded. Two rules follow and both are load-bearing:
 *
 *  1. NO `select`. Those four fields are computed rather than stored, so
 *     narrowing strips exactly what this screen is built on — and it saves the
 *     server nothing, because a `select` omitting `EndTagID` makes it issue an
 *     EXTRA full row fetch per ChangeOrder.
 *  2. NO POLLING ON THE LIST. The list read resolves a slug to its ids ONCE, on
 *     entry. Anything that needs to stay live must poll the single-order read
 *     instead, which is bounded to one row.
 *
 * ⚠️ THE SLUG CANNOT REACH THE SINGLE-ORDER READ DIRECTLY, AND THAT IS WHY THE
 * LIST READ IS HERE AT ALL. `useGetChangeOrderQuery` is
 * `/space/{spaceId}/change_order/{changeOrderId}` — it needs BOTH ids, and a
 * slug-addressed URL carries neither. So a slug route cannot open a rollout
 * without one list read to resolve it. Routing by id instead would remove that
 * read, at the cost of URLs nobody can read or type; that trade is open and is
 * recorded here rather than settled by accident.
 *
 * ⚠️ LIVENESS POLLS THE SINGLE ORDER, NEVER THE LIST, AND THE DIFFERENCE IS NOT
 * STYLISTIC. `useListAllChangeOrdersQuery({})` is keyed on `{}`, which is a
 * SHARED RTK cache entry — the fleet console subscribes to the identical key.
 * RTK polls a cache entry at the minimum interval across all its subscribers,
 * so a `pollingInterval` added to the list read here would silently start
 * polling the org-wide walk for every screen sharing that key, including ones
 * that deliberately do not poll. This file's own "NO POLLING ON THE LIST"
 * heading cannot enforce that from inside the file, so the shape does it
 * instead: the list read below takes NO second argument at all, and the only
 * polled read is the by-id one, which is bounded to a single row.
 *
 * The poll is driven by `usePolling` rather than RTK's own `pollingInterval`
 * because RTK's polls a hidden tab as happily as a visible one, and nobody is
 * reading a backgrounded rollout.
 */

import { useCallback, useMemo } from 'react';

import { useComponentSlugs } from '@/hooks/useComponentSlugs';
import { usePolling } from '@/hooks/usePolling';
import {
  useGetChangeOrderQuery,
  useListAllChangeOrdersQuery,
  useListSpacesQuery,
  type ComponentRead,
  type ExtendedSpaceRead,
} from '@confighub/rtk-query';

import type { RunningRelease } from '../x/apps/liveStatus';
import { buildGatesForStage } from '../x/apps/rollout/rolloutGates';
import {
  buildConsoleRow,
  consoleSpaceLoaded,
  orderComponent,
} from '../x/apps/rollout/rolloutsConsoleModel';
import type { ConsoleRow, ConsoleSpace } from '../x/apps/rollout/rolloutsConsoleModel';
import type { RolloutGateSpaceInput } from '../x/apps/rollout/rolloutGates';
import { buildRolloutSequence, previousStageOf } from '../x/apps/rollout/rolloutStages';
import { changeOrderWorkflow, stageWhereSpace } from '../x/apps/rollout/changeOrderWorkflow';
import { ROLLOUT_POLL_INTERVAL_MS } from '../x/apps/rollout/useRolloutData';
import { useWorkflowStageSpaces } from '../x/apps/rollout/useWorkflowStageSpaces';
import { useRunningReleases } from '../x/apps/useRunningReleases';
import {
  countPromotedStages,
  countReachableStages,
  deriveProgress,
  deriveStageState,
  finalStageGates,
  nextStageIndexFromChangeOrderStage,
} from '../x/apps/rollout/rolloutState';
import type {
  RolloutGate,
  RolloutProgress,
  RolloutSequence,
  RolloutStageState,
} from '../x/apps/rollout/rolloutTypes';

/**
 * `Stage=None` is a real value some external process writes on Spaces that sit
 * outside any rollout sequence, rather than leaving the label unset. It names
 * the ABSENCE of a stage, so a Space carrying it is dropped rather than being
 * given a lane of its own — a lane headed `None` asserts a step in the
 * promotion sequence that the workflow never declared.
 */
const STAGE_NONE = 'None';

export interface RolloutSpace {
  spaceId: string;
  slug: string;
  displayName?: string;
  labels?: Record<string, string>;
  annotations?: Record<string, string>;
  releaseTargetId?: string;
  /**
   * The Release the Space is running, with its live status: `null` when it
   * runs none, `undefined` while its Releases have not been read.
   */
  release?: RunningRelease | null;
  /** The Component the Space's ComponentID names. */
  component?: ComponentRead;
}

export interface RolloutDetail {
  /** Absent while loading, and when no ChangeOrder carries this slug. */
  found: boolean;
  slug: string;
  changeOrderId?: string;
  displayName?: string;
  baseSpaceId?: string;
  baseSpaceSlug?: string;
  createdAt?: string;
  abortedReason: string;
  /**
   * The row this rollout shows on the console — the SAME derivation, so the
   * detail head and the console row cannot disagree about one rollout.
   *
   * ⚠️ NOT the server's `State` field, deliberately. `ChangeOrderState`
   * (`internal/models/changeorder.go:30-48`) is derived purely from promotion
   * and release counts and never consults gates or live status, so a rollout
   * promoted through its last stage whose workload is unhealthy reports
   * `Resolved` while the honest answer is Degraded. Preferring it would print a
   * health claim over a live failure — regression `f3d5e56e0`, guarded by
   * `rollouts-populated.spec.ts`. `State` is carried below for display beside
   * the derived verdict, never in place of it.
   */
  consoleRow?: ConsoleRow;
  /** The server's own field, shown as itself and never as the headline verdict. */
  serverState?: string;
  componentName?: string;
  startTagId?: string;
  endTagId?: string;
  /**
   * Units the ChangeOrder passed over, keyed by unit id, with the reason.
   *
   * A skip is NOT an error and must never be worded as one: a ChangeOrder over
   * one changed Unit skips every other Unit in its Space, which is the ordinary
   * case rather than the exception.
   */
  skippedUnits: Record<string, string>;

  sequence: RolloutSequence;
  progress: RolloutProgress;
  stageStates: RolloutStageState[];
  gatesByStageId: Record<string, RolloutGate[]>;
  /**
   * The ChangeWorkflow's `Final.Prerequisites`, evaluated over the LAST stage's
   * own Spaces — the completion checklist the Complete step draws.
   *
   * ⚠️ A DIFFERENT QUESTION FROM ANY ENTRY IN `gatesByStageId`. Those are entry
   * gates, each evaluated over the stage BEFORE it, and they answer "may the
   * change move on". This answers "has the whole rollout landed", and the last
   * stage is its own subject. Read from the shared `finalStageGates`, the same
   * evaluation the console row reads its last stage's health from. The
   * completion verdict beside it is `ChangeOrder.Stage`, which the server
   * records.
   *
   * NEVER EMPTY BECAUSE `Final` IS. `buildGatesForStage` always injects the
   * mandatory landed check, so a workflow declaring no final prerequisites
   * still produces a list — and the rollout reads unverified rather than
   * silently finished. Empty here means only that nothing governs this rollout,
   * or that the workflow declares no last stage.
   */
  finalGates: RolloutGate[];
  /** Spaces in this rollout's scope, or `null` when scope cannot be known. */
  scopedSpaces: RolloutSpace[] | null;
  stagesDone: number;
  stagesTotal: number;
  nextStageId: string | null;

  isLoading: boolean;
  isFetching: boolean;
  error: unknown;
  refetch: () => void;
}

const EMPTY_SEQUENCE: RolloutSequence = { stages: [], problems: [] };

/**
 * Which Spaces count for this rollout, or `null` when that cannot be known.
 *
 * `InScopeSpaceIDs` is trusted ONLY when it arrives as a genuinely non-empty
 * array. Go's `omitempty` makes "the server predates this field", "the
 * derivation failed" and "the filter matched nothing" serialise identically, so
 * an absent field cannot be read as an empty scope.
 *
 * ⚠️ AND WHEN IT IS ABSENT THIS RETURNS `null` RATHER THAN EVERY SPACE. The
 * Space list this hook reads is org-wide, so the unfiltered set is the whole
 * organisation rather than one component's Spaces — falling back to it pulls every
 * Space labelled `Stage=base` anywhere in the org into this rollout's base
 * stage, so unrelated rollouts gate against each other. Saying "scope unknown"
 * is the honest answer; inventing a cross-contaminated sequence is not.
 *
 * The base Space is always kept when scope IS known: a rollout's Space Filter
 * can legitimately exclude the Space the ChangeOrder itself resides in, and the
 * sequence builder needs the base to construct the source row.
 */
function scopedSpacesFor(
  baseSpaceId: string | undefined,
  inScopeSpaceIds: string[] | undefined,
  spaces: RolloutSpace[],
): RolloutSpace[] | null {
  if (!Array.isArray(inScopeSpaceIds) || inScopeSpaceIds.length === 0) return null;
  const inScope = new Set(inScopeSpaceIds);

  return spaces.filter((space) => {
    if (space.labels?.Stage === STAGE_NONE) return false;
    if (space.spaceId === baseSpaceId) return true;
    return inScope.has(space.spaceId);
  });
}

/**
 * What the gates need to know about one Space of the previous stage.
 *
 * Takes the Space ID and, separately, whatever the display index holds for it —
 * which may be nothing. Stage membership comes from the workflow's own
 * server-side `WhereSpace` query, so it can name a Space this page's list does
 * not cover. Dropping such a Space would shrink the previous stage and let the
 * gates report green over a smaller stage than the workflow declares.
 * `loaded: false` is the state `rolloutGates.ts` provides for exactly this:
 * judged as unread, not as absent.
 *
 * The same shape `rolloutsConsoleModel.ts` uses, deliberately: one answer to
 * one question, so the two surfaces cannot come to judge a partially-read
 * stage differently.
 */
/**
 * The gate inputs for one previous stage — ONE ENTRY PER SPACE THE STAGE NAMES.
 *
 * Never fewer. Stage membership comes from the workflow's own server-side
 * `WhereSpace` query, so it can name a Space this page's index does not hold;
 * skipping those shrinks the previous stage, and the gates then report a
 * verdict over a smaller stage than the workflow declares while saying nothing
 * about the difference. An id the index cannot answer for is carried as unread
 * instead, which `rolloutGates.ts` already refuses to treat as a pass.
 *
 * A function rather than a `map` at the call site so the rule is the tested
 * thing, not a line inside a `useMemo` nothing can reach.
 */
export function previousStageGateSpaces(
  spaceIds: readonly string[] | undefined,
  allSpaceById: ReadonlyMap<string, RolloutSpace>,
): RolloutGateSpaceInput[] {
  return (spaceIds ?? []).map((spaceId) => gateSpaceInput(spaceId, allSpaceById.get(spaceId)));
}

export function gateSpaceInput(
  spaceId: string,
  space: RolloutSpace | undefined,
): RolloutGateSpaceInput {
  return {
    spaceId,
    loaded: consoleSpaceLoaded(space),
    variantName: space?.displayName ?? space?.slug ?? spaceId,
    release: space?.release ?? null,
    releaseTargetId: space?.releaseTargetId,
  };
}

export function useRolloutDetail(slug: string | undefined): RolloutDetail {
  // No second argument, deliberately — see the header. One shot, on entry.
  const orders = useListAllChangeOrdersQuery({});
  const spaces = useListSpacesQuery({});

  const listEntry = useMemo(
    () => (orders.data ?? []).find((candidate) => candidate.ChangeOrder?.Slug === slug),
    [orders.data, slug],
  );

  const identity = useMemo(() => {
    const spaceId = listEntry?.ChangeOrder?.SpaceID;
    const changeOrderId = listEntry?.ChangeOrder?.ChangeOrderID;
    return spaceId !== undefined && changeOrderId !== undefined
      ? { spaceId, changeOrderId }
      : undefined;
  }, [listEntry]);

  /*
   * The bounded read: one ChangeOrder, by id. This is what stays live.
   *
   * No `pollingInterval` here either — `usePolling` below drives the refetch so
   * a backgrounded tab stops paying for a propagation-graph walk nobody is
   * looking at.
   */
  const one = useGetChangeOrderQuery(identity ?? { spaceId: '', changeOrderId: '' }, {
    skip: identity === undefined,
  });

  const refetchOne = useCallback(() => {
    if (identity === undefined) return;
    void one.refetch();
  }, [identity, one]);

  usePolling(refetchOne, ROLLOUT_POLL_INTERVAL_MS);

  const { componentById } = useComponentSlugs();
  const listedSpaces: RolloutSpace[] = useMemo(
    () =>
      (spaces.data ?? []).flatMap((entry) => {
        const space = entry.Space;
        if (space?.SpaceID === undefined || space.Slug === undefined) return [];
        return [
          {
            spaceId: space.SpaceID,
            slug: space.Slug,
            displayName: space.DisplayName,
            labels: space.Labels,
            annotations: space.Annotations,
            releaseTargetId: space.ReleaseTargetID,
            component: space.ComponentID ? componentById.get(space.ComponentID) : undefined,
          },
        ];
      }),
    [spaces.data, componentById],
  );
  const listedSpaceById = useMemo(
    () => new Map(listedSpaces.map((space) => [space.spaceId, space])),
    [listedSpaces],
  );

  /*
   * Prefer the polled single-order read once it lands, and fall back to the
   * list entry until it does — so the screen renders immediately on entry
   * rather than waiting a second round-trip, and then stays live off the
   * bounded read rather than the org-wide one.
   */
  const entry = one.data ?? listEntry;
  const order = entry?.ChangeOrder;
  const baseSpaceId = order?.SpaceID;

  // The component the stages select within, read off the base Space's own
  // Component — the same `orderComponent` the fleet console uses, so the two
  // surfaces cannot resolve two different components for one ChangeOrder.
  const component = useMemo(
    () => orderComponent({ spaceId: baseSpaceId }, listedSpaceById as ReadonlyMap<string, ConsoleSpace>),
    [baseSpaceId, listedSpaceById],
  );
  const componentName = component?.Slug;

  /**
   * The governing ChangeWorkflow, read off the ChangeOrder's own frozen copy —
   * the same `changeOrderWorkflow` read the console makes, so a reader moving
   * between the list and this page can never be told two different things about
   * which stages govern one ChangeOrder. The copy arrives with the order, so
   * only the stage selectors are still resolved from the server.
   */
  const governing = useMemo(() => changeOrderWorkflow(order), [order]);
  const workflow = governing.state === 'governed' ? governing.workflow : undefined;
  // Every Space of this rollout's component, off the org list this hook already
  // reads. A stage that names no selector takes exactly this set, so answering
  // it from here costs no request.
  const componentSpaceIds = useMemo(
    () =>
      component === undefined
        ? []
        : listedSpaces
            .filter((space) => space.component?.ComponentID === component.ComponentID)
            .map((space) => space.spaceId),
    [listedSpaces, component],
  );
  const { stageSpaces, isLoading: stageSpacesLoading } = useWorkflowStageSpaces(
    workflow?.Stages,
    component,
    componentSpaceIds,
  );

  // Re-keyed from stage NAME (what `buildRolloutSequence` wants) to the
  // resolved clause (what `buildConsoleRow` wants) — done here instead of a
  // second fetch, since this hook already resolved every stage's Spaces above.
  const stageSpacesByClause: Record<string, ExtendedSpaceRead[]> = useMemo(() => {
    if (workflow === undefined || component === undefined) return {};
    const byClause: Record<string, ExtendedSpaceRead[]> = {};
    for (const stage of workflow.Stages) {
      byClause[stageWhereSpace(stage, component)] = stageSpaces[stage.Name] ?? [];
    }
    return byClause;
  }, [workflow, stageSpaces, component]);

  // The Release each staged Space is running, for its live status, which the
  // Healthy gate reads. Polled with the ChangeOrder, since a deploying tool
  // reports onto the Release on its own schedule.
  const stagedSpaces = useMemo(() => {
    const staged = new Map<string, RolloutSpace>();
    for (const members of Object.values(stageSpaces)) {
      for (const member of members) {
        const space = member.Space?.SpaceID ? listedSpaceById.get(member.Space.SpaceID) : undefined;
        if (space) staged.set(space.spaceId, space);
      }
    }
    return [...staged.values()];
  }, [stageSpaces, listedSpaceById]);
  const releases = useRunningReleases(stagedSpaces, { pollIntervalMs: ROLLOUT_POLL_INTERVAL_MS });

  const allSpaces: RolloutSpace[] = useMemo(() => {
    if (!releases.loaded) return listedSpaces;
    return listedSpaces.map((space) =>
      space.releaseTargetId === undefined
        ? space
        : { ...space, release: releases.bySpaceId.get(space.spaceId) ?? null },
    );
  }, [listedSpaces, releases.loaded, releases.bySpaceId]);
  const allSpaceById = useMemo(
    () => new Map(allSpaces.map((space) => [space.spaceId, space])),
    [allSpaces],
  );

  const isLoading = orders.isLoading || spaces.isLoading || stageSpacesLoading;
  const isFetching = orders.isFetching || spaces.isFetching || one.isFetching;
  const error = orders.error ?? spaces.error ?? one.error ?? releases.error;

  const refetchReleases = releases.refetch;
  const refetch = useCallback(() => {
    void orders.refetch();
    void spaces.refetch();
    if (identity !== undefined) void one.refetch();
    refetchReleases();
  }, [orders, spaces, one, identity, refetchReleases]);

  return useMemo<RolloutDetail>(() => {
    if (slug === undefined || order?.ChangeOrderID === undefined) {
      return {
        found: false,
        slug: slug ?? '',
        abortedReason: '',
        skippedUnits: {},
        sequence: EMPTY_SEQUENCE,
        progress: deriveProgress({
          changeOrderSpaceId: undefined,
          resolvedSpaceIds: undefined,
          releasedSpaceIds: undefined,
          restoredSpaceIds: undefined,
          releasedRestoredSpaceIds: undefined,
          releases: undefined,
        }),
        stageStates: [],
        gatesByStageId: {},
        finalGates: [],
        scopedSpaces: null,
        stagesDone: 0,
        stagesTotal: 0,
        nextStageId: null,
        isLoading,
        isFetching,
        error,
        refetch,
      };
    }

    const scopedSpaces = scopedSpacesFor(baseSpaceId, order.InScopeSpaceIDs, allSpaces);

    const progress = deriveProgress({
      changeOrderSpaceId: baseSpaceId,
      resolvedSpaceIds: order.ResolvedSpaceIDs,
      releasedSpaceIds: order.ReleasedSpaceIDs,
      restoredSpaceIds: order.RestoredSpaceIDs,
      releasedRestoredSpaceIds: order.ReleasedRestoredSpaceIDs,
      // Derived only for a read of the whole row; both reads here are.
      releases: order.Releases,
    });

    // Stage membership comes from the governing ChangeWorkflow's own
    // `whereSpace` resolution, not from `scopedSpaces` — that narrowing exists
    // for the diff tree (`useRolloutConsoleChanges.ts`) and the "N Spaces" caption
    // below, which are about DISPLAY scope, not about which Spaces a stage
    // selects.
    const sequence =
      workflow === undefined || baseSpaceId === undefined
        ? EMPTY_SEQUENCE
        : buildRolloutSequence(workflow, stageSpaces, baseSpaceId, order.InScopeSpaceIDs);

    const gatesByStageId: Record<string, RolloutGate[]> = {};
    for (const stage of sequence.stages) {
      const previousStage = previousStageOf(sequence, stage);
      const previousStageSpaces = previousStageGateSpaces(previousStage?.spaceIds, allSpaceById);
      gatesByStageId[stage.id] = buildGatesForStage({
        stage,
        previousStageSpaces,
        progress,
        componentName: componentName ?? '',
        changeOrderSlug: order.Slug ?? '',
        customPrerequisites: workflow?.CustomPrerequisites,
      });
    }

    const stageStates = sequence.stages.map((stage) =>
      deriveStageState({
        stage,
        gates: gatesByStageId[stage.id] ?? [],
        progress,
        // Promotion-in-flight is CLIENT-LOCAL optimistic state owned by
        // `useRolloutActions` — it exists only between this browser's click and
        // its response, and nothing server-side reports it. Empty here because
        // this hook issues no promotes; the acting component supplies its own.
        inFlightSpaceIds: new Set<string>(),
      }),
    );

    const nextStageIndex = nextStageIndexFromChangeOrderStage(sequence, order.Stage);
    const nextStageId = nextStageIndex === -1 ? null : sequence.stages[nextStageIndex].id;

    /*
     * The same gate machinery, the same inputs, one hop further on. `null` is
     * `finalStageGates`' own answer for "the workflow declares no last stage",
     * which is not a failing checklist and must not be drawn as one — it
     * collapses to no list at all, exactly as an ungoverned rollout does.
     */
    const finalGates =
      workflow === undefined
        ? []
        : (finalStageGates({
            workflow,
            sequence,
            progress,
            gateSpaceInput: (spaceId) => gateSpaceInput(spaceId, allSpaceById.get(spaceId)),
            componentName: componentName ?? '',
            changeOrderSlug: order.Slug ?? '',
          }) ?? []);

    return {
      found: true,
      slug: order.Slug ?? slug,
      changeOrderId: order.ChangeOrderID,
      displayName: order.DisplayName,
      baseSpaceId,
      baseSpaceSlug: order.SpaceSlug ?? entry?.Space?.Slug,
      createdAt: order.CreatedAt,
      abortedReason: order.AbortedReason ?? '',
      // Carried, not re-guessed. The console has always fetched `State` and
      // thrown it away, substituting a derived label for an authoritative field
      // already in memory.
      serverState: order.State,
      consoleRow: buildConsoleRow(
        {
          changeOrderId: order.ChangeOrderID,
          slug: order.Slug ?? slug,
          displayName: order.DisplayName,
          spaceId: baseSpaceId,
          spaceSlug: order.SpaceSlug ?? entry?.Space?.Slug,
          createdAt: order.CreatedAt,
          resolvedSpaceIds: order.ResolvedSpaceIDs,
          releasedSpaceIds: order.ReleasedSpaceIDs,
          restoredSpaceIds: order.RestoredSpaceIDs,
          releasedRestoredSpaceIds: order.ReleasedRestoredSpaceIDs,
          releases: order.Releases,
          inScopeSpaceIds: order.InScopeSpaceIDs,
          annotations: order.Annotations,
          governing,
          abortedReason: order.AbortedReason,
          stage: order.Stage,
          restoreTagId: order.RestoreTagID,
        },
        allSpaces,
        stageSpacesByClause,
      ),
      componentName,
      startTagId: order.StartTagID,
      endTagId: order.EndTagID,
      skippedUnits: order.SkippedUnits ?? {},
      sequence,
      progress,
      stageStates,
      gatesByStageId,
      finalGates,
      scopedSpaces,
      stagesDone: countPromotedStages(stageStates),
      // Reaches the same total the console row reports, by the same helper —
      // an empty stage is nowhere to promote to, so it is nowhere to count.
      stagesTotal: countReachableStages(stageStates),
      nextStageId,
      isLoading,
      isFetching,
      error,
      refetch,
    };
    /*
     * Keyed on DATA, not on the RTK result objects. Depending on the whole
     * result re-runs this reduction on every fetch-state transition — including
     * the ones that change nothing — which churns the identity of everything
     * downstream and defeats the memo chain the diff tree depends on.
     */
  }, [
    order,
    entry,
    baseSpaceId,
    componentName,
    governing,
    workflow,
    stageSpaces,
    stageSpacesByClause,
    allSpaces,
    allSpaceById,
    slug,
    isLoading,
    isFetching,
    error,
    refetch,
  ]);
}
