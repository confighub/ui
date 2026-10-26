// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * Reading the quiet promote dry run: what it counts, how its answer is classed,
 * and the one line the status box says about it.
 *
 * The dry run here is the UNFORCED one, whose plan is what gets applied. It is
 * the only one that can say whether gates hold the stage, so its 409, 403 and
 * other refusals become states of their own rather than a line.
 */

import type { PromoteResult } from '@confighub/rtk-query';

import { listText } from '../reviews/reviewCopy';
import { refusalText, type ServerAnswer } from '../reviews/stageReviewInputs';
import { changeOrderCopy } from '../../x/apps/change-order/changeOrderCopy';
import { promoteGatesHolding, summarisePromote } from '../../x/apps/change-order/useChangeOrderActions';
import { stageCardCopy } from './stageCardCopy';
import type { DryRunAnswer, DryRunLine, DryRunSummary, PropagationProblem, StageDryRunView } from './stageTypes';

/** Unit actions that write nothing to the Unit's configuration. A Mark only moves Tags. */
const NON_CHANGING_UNIT_ACTIONS: ReadonlySet<string> = new Set(['Mark', 'Unchanged', 'Skip']);

/** Space actions under which the dry run planned the Space. */
const PLANNED_SPACE_ACTIONS: ReadonlySet<string> = new Set(['Promote', 'Unchanged', 'Skipped']);

/**
 * Count what a dry run would change.
 *
 * Units, not Spaces, are what a reader checks a confirmation against. A clone the
 * dry run would make has no id yet and still counts, by its action. A Space counts
 * only when it is promoted AND at least one of its Units would change: a Space whose
 * Units are all marked holds the change already.
 *
 * Failures are worded by `summarisePromote`, Space by Space, so the line and the
 * failure state say the same thing the console says.
 */
export function summariseDryRun(result: PromoteResult | undefined, baseSpaceId: string | undefined): DryRunSummary {
  let unitCount = 0;
  let spaceCount = 0;
  let reached = 0;
  const failures: string[] = [];
  const failuresBySpace = new Map<string, string[]>();
  const unplannedReasonBySpaceId = new Map<string, string>();

  for (const space of result?.Spaces ?? []) {
    if (space.Action !== 'Blocked' && space.Action !== 'Failed') reached += 1;
    if (space.SpaceID !== undefined && !PLANNED_SPACE_ACTIONS.has(space.Action ?? '')) {
      unplannedReasonBySpaceId.set(space.SpaceID, space.Reason || space.Action || 'Failed');
    }
    let changing = 0;
    for (const unit of space.Units ?? []) {
      if (unit.Error !== undefined) continue;
      if (NON_CHANGING_UNIT_ACTIONS.has(unit.Action ?? '')) continue;
      changing += 1;
    }
    unitCount += changing;
    if (space.Action === 'Promote' && changing > 0) spaceCount += 1;

    const own = summarisePromote({ ...result, Spaces: [space] }, baseSpaceId).failures;
    if (own.length > 0) {
      failures.push(...own);
      if (space.SpaceID !== undefined) failuresBySpace.set(space.SpaceID, own);
    }
  }

  return {
    unitCount,
    spaceCount,
    reached,
    failures,
    failuresBySpace,
    unplannedReasonBySpaceId,
    plan: result?.Plan || undefined,
  };
}

/** The same plan: by its digest when both have one, else by what the box says it writes. */
export function samePlan(a: DryRunSummary, b: DryRunSummary): boolean {
  if (a.plan !== undefined && b.plan !== undefined) return a.plan === b.plan;
  return a.unitCount === b.unitCount && a.spaceCount === b.spaceCount && a.reached === b.reached;
}

/**
 * How one dry-run answer is read.
 *
 * - 2xx: done, or fails when an item failed (a 207 is a 2xx too).
 * - 409: the server's gates hold the stage.
 * - 403: the viewer may not promote here. Asked with `authFetch`, so the page stays.
 * - Any other 4xx: refused, with the server's reason, as the confirmation dialog does.
 * - No status, or 5xx: the server could not answer, which says nothing about the stage.
 */
export function classifyDryRunAnswer(answer: ServerAnswer, baseSpaceId: string | undefined): DryRunAnswer {
  const { status, body } = answer;
  if (status >= 200 && status < 300) {
    const summary = summariseDryRun(promoteResultBody(body), baseSpaceId);
    return summary.failures.length > 0 ? { kind: 'fails', summary } : { kind: 'done', summary };
  }
  if (status === 409) {
    return { kind: 'held', text: promoteGatesHolding(promoteResultBody(body)) ?? changeOrderCopy.promoteHeld.generic };
  }
  if (status === 403) return { kind: 'noPermission' };
  if (status >= 400 && status < 500) {
    const reason = refusalText(body)?.trim();
    return { kind: 'refused', reason: reason !== undefined && reason !== '' ? reason : refusedWithoutReason(status) };
  }
  return { kind: 'unavailable' };
}

const refusedWithoutReason = (status: number) => `The server refused the dry run (${status}) and gave no reason.`;

function promoteResultBody(body: unknown): PromoteResult | undefined {
  return typeof body === 'object' && body !== null ? (body as PromoteResult) : undefined;
}

/** The view of a classed answer, for the status box. */
export function dryRunViewOf(answer: DryRunAnswer): StageDryRunView {
  switch (answer.kind) {
    case 'done':
    case 'fails':
      return { mode: answer.kind, summary: answer.summary };
    case 'held':
      return { mode: 'held', gatesHolding: answer.text };
    case 'refused':
      return { mode: 'refused', refusal: answer.reason };
    case 'noPermission':
      return { mode: 'noPermission' };
    case 'unavailable':
      return { mode: 'unavailable' };
  }
}

export interface DryRunLineInput {
  view: StageDryRunView;
  /** The Spaces the stage's actions write into. */
  targetCount: number;
  /** A Space's name, for "Dry run fails for …". */
  nameOf: (spaceId: string) => string;
  /**
   * The propagation problems in view. The line counts the Spaces that take the
   * change differently, and separately the Spaces whose change could not be
   * compared: an unknown change is not a different one.
   */
  problems?: readonly PropagationProblem[];
  /** Without `problems`: how many Spaces have a problem. */
  differentlyCount?: number;
  /** Without `problems`: the change cannot be established somewhere. The count is then not said. */
  uncertain?: boolean;
}

/** Spaces taking the change differently, and Spaces whose change could not be compared. */
function oddCounts(input: DryRunLineInput): { differently: number; unknown: number; uncertain: boolean } {
  if (input.problems !== undefined) {
    const unknown = new Set(input.problems.flatMap((p) => (p.kind === 'unknown' ? p.spaceIds : [])));
    const differently = new Set(input.problems.flatMap((p) => (p.kind === 'unknown' || unknown.has(p.spaceId) ? [] : [p.spaceId])));
    return { differently: differently.size, unknown: unknown.size, uncertain: unknown.size > 0 };
  }
  // Which of the counted Spaces are unknown is not known here, so no count is said for them.
  const uncertain = input.uncertain === true;
  return { differently: uncertain ? 0 : (input.differentlyCount ?? 0), unknown: 0, uncertain };
}

/**
 * The dry-run line under the headline (`data-testid="stage-dry-run"`).
 *
 * A dry run that is running AGAIN keeps showing its last answer, so the line
 * does not flicker on every focus. A dry run that did not reach every Space says
 * so, and says it as a fact: on a chained stage that is the ordinary case.
 */
export function dryRunLine(input: DryRunLineInput): DryRunLine {
  const { view, targetCount, nameOf } = input;
  const copy = stageCardCopy.dryRun;
  const mode = view.mode === 'running' && view.summary !== undefined ? (view.summary.failures.length > 0 ? 'fails' : 'done') : view.mode;
  switch (mode) {
    case 'idle':
    case 'held':
    case 'refused':
    case 'noPermission':
      return { mode, text: null, icon: 'none' };
    case 'running':
      return { mode, text: copy.running, icon: 'none' };
    case 'unavailable':
      return { mode, text: copy.unavailable, icon: 'warn' };
    case 'fails': {
      const summary = view.summary;
      const names = [...(summary?.failuresBySpace.keys() ?? [])].map(nameOf);
      const first = summary?.failures[0];
      const lead = copy.fails(names.length > 0 ? listText(names) : changeOrderCopy.unnamedSpace);
      return { mode, text: first === undefined ? lead : `${lead} ${first}`, icon: 'fail' };
    }
    case 'done': {
      const summary = view.summary;
      if (summary === undefined) return { mode, text: copy.passed, icon: 'none' };
      const { differently, unknown, uncertain } = oddCounts(input);
      let text: string;
      if (summary.unitCount === 0) text = copy.passed;
      else if (differently > 0 || unknown > 0) text = copy.countsOdd(summary.unitCount, summary.spaceCount, differently, unknown);
      else if (uncertain) text = copy.countsPrefixed(summary.unitCount, summary.spaceCount);
      else text = copy.counts(summary.unitCount, summary.spaceCount);
      const incomplete = summary.reached < targetCount;
      if (incomplete) text = `${text} ${copy.reach(summary.reached, targetCount)}`;
      return {
        mode,
        text,
        icon: uncertain ? 'warn' : 'none',
        ...(incomplete ? { fidelity: 'coverage-incomplete' as const } : {}),
      };
    }
  }
}

/**
 * The release line: how many Spaces with a Target the release would publish.
 * A release dry run does not list the Units it bundles, so Units are not counted.
 */
export function releaseLine(targetSpaceIds: readonly string[], releaseTargetOf: (spaceId: string) => string | undefined): string {
  const spaces = new Set(targetSpaceIds.filter((id) => releaseTargetOf(id) !== undefined));
  return stageCardCopy.dryRun.release(spaces.size);
}
