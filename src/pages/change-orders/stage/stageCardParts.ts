// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * The stage card's smaller parts, assembled from what the card already knows:
 * the sidebar's gates, reviews, Space marks and Targets, the change card's
 * scope, where "Go to" leads, and the dry run as the box reads it.
 *
 * Pure: no React and no MUI. The browser-free spec imports it directly.
 */

import type { ChangeWorkflowSpec, PromoteGateResult } from '@confighub/rtk-query';

import { COMPLETE_STAGE_ID } from '../changeOrderCompleteStep';
import type { GateReviewSummary } from '../reviews/changeOrderReviewTypes';
import { stageChangeLanded } from '../reviews/stageReviewInputs';
import { stageDisplayName } from '../../x/apps/change-order/changeOrderCopy';
import { onlyTheServerEvaluates } from '../../x/apps/change-order/changeOrderGates';
import { BUILT_IN_PREREQUISITES } from '../../x/apps/change-order/changeOrderWorkflow';
import type { ChangeOrderChangeGroup, ChangeOrderGate, ChangeOrderStageVerdict } from '../../x/apps/change-order/changeOrderTypes';
import type { RunningRelease } from '../../x/apps/liveStatus';
import { healthPending, previousHasChange, type PreviousStageInput } from './stageCardState';
import { stageCardCopy, type NamedSpace } from './stageCardCopy';
import { changeCardNotice, type ChangeCardNoticeInput } from './stageChangeLines';
import { dryRunViewOf } from './stageDryRun';
import type { CopySegment, DryRunAnswer, SpaceMark, StageDryRunView, StageFailure, StagePropagation } from './stageTypes';

// ---------------------------------------------------------------------------
// Gates and reviews
// ---------------------------------------------------------------------------

/** A gate one of these reviews' requirements stands for: drawn as a review row, not a gate row. */
export function isReviewRequirementGate(gate: ChangeOrderGate, summaries: readonly GateReviewSummary[]): boolean {
  return summaries.some((summary) =>
    summary.requirements.some((r) => gate.prerequisite === r.name || gate.id === `attestation-prerequisite:${r.name}`),
  );
}

/** The gates still holding a stage other than its review: completing the review does not open it while they hold. */
export function otherGatesHolding(gates: readonly ChangeOrderGate[], review: GateReviewSummary): string[] {
  return gates.filter((g) => !isReviewRequirementGate(g, [review]) && !(g.evaluated && g.ok)).map((g) => g.name);
}

/**
 * The Spaces a failing gate names, from the server's rows for the stage: the box
 * then says "in [space]". Empty when the server named none, or reported no rows.
 */
export function gateSpacesOf(
  rows: readonly PromoteGateResult[] | undefined,
  gate: Pick<ChangeOrderGate, 'prerequisite'>,
  nameOf: (spaceId: string) => string,
): NamedSpace[] {
  if (rows === undefined || gate.prerequisite === undefined) return [];
  const ids: string[] = [];
  for (const row of rows) {
    if (row.Satisfied === true || row.Prerequisite !== gate.prerequisite || row.SpaceID === undefined) continue;
    if (!ids.includes(row.SpaceID)) ids.push(row.SpaceID);
  }
  return ids.map((spaceId) => ({ spaceId, name: nameOf(spaceId) }));
}

/** `gateSpacesOf` for each of a stage's gates, by gate id. */
export function gateSpacesFor(
  rows: readonly PromoteGateResult[] | undefined,
  gates: readonly ChangeOrderGate[],
  nameOf: (spaceId: string) => string,
): (gateId: string) => NamedSpace[] {
  return (gateId) => {
    const gate = gates.find((g) => g.id === gateId);
    return gate === undefined ? [] : gateSpacesOf(rows, gate, nameOf);
  };
}

/**
 * Whether the first answer about a stage's gates is in, so the card can say what
 * holds it rather than offer Promote over gates nobody has asked about yet.
 *
 * - The stage's Spaces must be read.
 * - A stage naming a prerequisite only the server evaluates is answered by the
 *   server's gate read (a refusal is an answer too). The page asks the server for
 *   exactly those stages, by the same rule.
 * - `Released` and `Healthy` are evaluated here from the Releases of the stage
 *   before, which are read separately: until they are, those gates are "still
 *   reading", not "not checked".
 */
export function stageGatesAnswered(input: {
  stageId: string;
  membershipLoaded: boolean;
  workflow: ChangeWorkflowSpec | undefined;
  workflowCompleted: boolean;
  ownSpaceReached: boolean;
  hasSpaces: boolean;
  serverAnswered: boolean;
  /** The Spaces of the stage before (the own Space for the first stage), with their Release once read. */
  previousSpaces: readonly ({ release?: RunningRelease | null } | undefined)[];
}): boolean {
  if (!input.membershipLoaded) return false;
  const stages = input.workflow?.Stages ?? [];
  const index = stages.findIndex((s) => s.Name === input.stageId);
  const prerequisites = index < 0 ? [] : (stages[index].Prerequisites ?? []);
  const asksServer =
    !input.workflowCompleted &&
    (index > 0 || input.ownSpaceReached) &&
    input.hasSpaces &&
    prerequisites.some((name) => onlyTheServerEvaluates(name, input.workflow?.CustomPrerequisites, input.workflow?.AttestationPrerequisites));
  if (asksServer && !input.serverAnswered) return false;
  const readsReleases = prerequisites.some((name) => name === BUILT_IN_PREREQUISITES.released || name === BUILT_IN_PREREQUISITES.healthy);
  return !readsReleases || input.previousSpaces.every((space) => space !== undefined && space.release !== undefined);
}

/**
 * The stage before, which every entry gate reads. Whether the change has reached
 * it, and whether its health has simply not reported yet, tell a gate that waits
 * from one that failed. The first stage reads the ChangeOrder's own Space instead,
 * so it has no stage before.
 */
export function previousStageOf(
  stage: { previousStageId: string | null } | undefined,
  detail: {
    sequence: { stages: readonly { id: string; isSource: boolean; spaceIds: string[] }[] };
    stageStates: readonly { stageId: string; verdict: ChangeOrderStageVerdict }[];
    scopedSpaces: readonly { spaceId: string; release?: RunningRelease | null }[] | null;
  },
): {
  previousSeq: { id: string; spaceIds: string[] } | undefined;
  previousStage: PreviousStageInput | undefined;
  previousLanded: boolean;
} {
  const id = stage?.previousStageId;
  const previousSeq = id === undefined || id === null ? undefined : detail.sequence.stages.find((s) => s.id === id);
  const verdict = detail.stageStates.find((s) => s.stageId === previousSeq?.id)?.verdict;
  const previousStage =
    previousSeq === undefined || previousSeq.isSource || verdict === undefined
      ? undefined
      : {
          stageId: previousSeq.id,
          name: stageDisplayName(previousSeq.id, false),
          verdict,
          healthPending: healthPending(previousSeq.spaceIds.map((sid) => detail.scopedSpaces?.find((sp) => sp.spaceId === sid)?.release)),
        };
  return { previousSeq, previousStage, previousLanded: previousHasChange(previousStage?.verdict) };
}

// ---------------------------------------------------------------------------
// Spaces and Targets
// ---------------------------------------------------------------------------

/** A Space's chip: how the change reaches it, or, after a failure, how the last action went there. */
export type CardSpaceMark = SpaceMark | { kind: 'failed' } | { kind: 'promoted' };

/**
 * The Spaces list's chips. After a failed promotion each target says whether it
 * failed or holds the change, read from the same result as the failure's counts:
 * when the result named its failed Spaces, every other target landed. Otherwise
 * the propagation marks stand.
 */
export function sidebarMarks(
  marks: ReadonlyMap<string, SpaceMark>,
  failure: StageFailure | undefined,
  targets: readonly string[],
  resolvedSpaceIds: ReadonlySet<string>,
  slugOf: (spaceId: string) => string = () => '',
): Map<string, CardSpaceMark> {
  const out = new Map<string, CardSpaceMark>(marks);
  if (failure === undefined) return out;
  const failedIds = new Set(failure.failedSpaces.map((s) => s.spaceId).filter((id) => id !== ''));
  const failedSlugs = new Set(failure.failedSpaces.map((s) => s.slug).filter((slug) => slug !== ''));
  const failed = (id: string) => failedIds.has(id) || failedSlugs.has(slugOf(id));
  const others = targets.filter((id) => !failed(id));
  const allOthersLanded = failure.landedCount === others.length;
  for (const id of targets) {
    if (failed(id)) out.set(id, { kind: 'failed' });
    else if (allOthersLanded || resolvedSpaceIds.has(id)) out.set(id, { kind: 'promoted' });
  }
  return out;
}

// ---------------------------------------------------------------------------
// The change card and "Go to"
// ---------------------------------------------------------------------------

/**
 * The change card's scope, as phrases: where the change was made (or "In" the
 * source Space), then how far it reaches: "Written to {n} of {N}" after a failed
 * promotion, "Same in all {N} Spaces" when every line reaches every Space, else
 * the count.
 */
export function changeScope(input: {
  isSource: boolean;
  base?: NamedSpace;
  /** A fan-out ChangeOrder's source Spaces, which stand in for the base. */
  fanOutSources?: NamedSpace[];
  /** A failed promotion of this stage. */
  failure?: StageFailure;
  targetCount: number;
  sameEverywhere: boolean;
}): CopySegment[][] {
  const copy = stageCardCopy.change;
  if (input.isSource) return input.base === undefined ? [] : [copy.scopeIn(input.base)];
  const scope: CopySegment[][] = [];
  const sources = input.fanOutSources ?? (input.base === undefined ? [] : [input.base]);
  if (sources.length > 0) scope.push(copy.scopeMadeIn(sources));
  const total = input.targetCount;
  // No count before the stage's Spaces are known: "0 Spaces" would be a claim about an unread stage.
  if (total === 0 && input.failure === undefined) return scope;
  const text =
    input.failure !== undefined && input.failure.action === 'promote'
      ? copy.scopeWritten(input.failure.landedCount, total)
      : input.sameEverywhere && total > 1
        ? copy.scopeSameEverywhere(total)
        : copy.scopeSpaces(total);
  scope.push([{ kind: 'text', text }]);
  return scope;
}

/**
 * The change card: its title's tense, its scope, what it says in place of its
 * outcome boxes (reading, not reached, nothing, unreadable), and the notes above them.
 */
export function changeCardModel(input: {
  isSource: boolean;
  verdict: ChangeOrderStageVerdict;
  base?: NamedSpace;
  fanOutSources?: NamedSpace[];
  failure?: StageFailure;
  targets: readonly string[];
  /** Fields the change writes in the stage, across its Spaces. */
  fieldCount: number;
  /** One outcome group holds every Space, taking the same change: the scope says so once. */
  sameEverywhere: boolean;
  status: ChangeCardNoticeInput['status'];
  groups: Iterable<ChangeOrderChangeGroup>;
  /** Set when the change has not reached the stage before. */
  notReachedFrom?: { stageId: string; name: string };
  /** False until the stage's change has been read once. Absent: read. */
  settledOnce?: boolean;
  sourceFieldCount: number;
  propagation: Pick<StagePropagation, 'quietNotes' | 'shortfallNote'>;
}) {
  return {
    written: input.isSource || input.verdict === 'promoted' || input.verdict === 'released',
    scope: changeScope({
      isSource: input.isSource,
      ...(input.base === undefined ? {} : { base: input.base }),
      ...(input.fanOutSources === undefined ? {} : { fanOutSources: input.fanOutSources }),
      ...(input.failure === undefined ? {} : { failure: input.failure }),
      targetCount: input.targets.length,
      sameEverywhere: input.sameEverywhere,
    }),
    notice: changeCardNotice({
      status: input.status,
      fieldCount: input.fieldCount,
      groups: input.groups,
      ...(input.notReachedFrom === undefined ? {} : { notReachedFrom: input.notReachedFrom }),
      sourceFieldCount: input.sourceFieldCount,
      // A stage that holds the change itself is never "shown once the stage before has it".
      written: input.isSource || stageChangeLanded(input.verdict),
      ...(input.settledOnce === undefined ? {} : { settledOnce: input.settledOnce }),
    }),
    // The floor, omitted and undecided resources: said above the boxes, whether or not they are open.
    notes: input.propagation.quietNotes,
    shortfallNote: input.propagation.shortfallNote,
  };
}

/** Where "Go to" leads: the next stage, else the Complete step when the path has one. */
export function nextStepOf(
  stageStates: readonly { stageId: string; verdict: ChangeOrderStageVerdict }[],
  stageId: string,
  hasComplete: boolean,
  hrefForStage: (stageId: string) => string,
): { name: string | null; href: string } | null {
  const index = stageStates.findIndex((s) => s.stageId === stageId);
  const after = index < 0 ? undefined : stageStates[index + 1];
  if (after !== undefined) return { name: stageDisplayName(after.stageId, after.verdict === 'source'), href: hrefForStage(after.stageId) };
  return hasComplete ? { name: null, href: hrefForStage(COMPLETE_STAGE_ID) } : null;
}

// ---------------------------------------------------------------------------
// The dry run as the box reads it
// ---------------------------------------------------------------------------

/**
 * What makes the quiet dry run ask again: anything that changes the ChangeOrder
 * (its Version moves on every update), what holds and released it, its records,
 * and, for an Invoke ChangeOrder, its Invocation, which each promotion reads afresh.
 */
export function dryRunRefreshKey(detail: {
  version?: number;
  invocation?: { Version?: number };
  orderStage?: string;
  progress: { resolvedSpaceIds: ReadonlySet<string>; releasedSpaceIds: ReadonlySet<string> };
  promotions: readonly unknown[];
  promotionFailures: readonly unknown[];
}): string {
  return JSON.stringify([
    detail.version,
    detail.orderStage,
    [...detail.progress.resolvedSpaceIds].sort(),
    [...detail.progress.releasedSpaceIds].sort(),
    detail.promotions.length,
    detail.promotionFailures.length,
    detail.invocation?.Version,
  ]);
}

/**
 * The quiet dry run's view for the box.
 *
 * A verdict that is a state of its own (held, no permission, refused) stays
 * while the dry run is asked again, so the box does not flicker. Otherwise a
 * re-run is "running" and keeps the last counts for the line. Before the first
 * ask (the stage panel's own dry run goes first) it is already on its way.
 */
export function cardDryRunView(input: {
  wanted: boolean;
  last: DryRunAnswer | undefined;
  running: boolean;
  targetCount: number;
}): StageDryRunView {
  if (!input.wanted) return { mode: 'idle' };
  const last = input.last === undefined ? undefined : dryRunViewOf(input.last);
  if (last !== undefined && (last.mode === 'held' || last.mode === 'noPermission' || last.mode === 'refused')) return last;
  if (input.running) return { mode: 'running', ...(last?.summary !== undefined ? { summary: last.summary } : {}) };
  if (last !== undefined) return last;
  return input.targetCount > 0 ? { mode: 'running' } : { mode: 'idle' };
}
