// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import type { ChangeOrderSequenceProblem } from '../../x/apps/change-order/changeOrderTypes';

/**
 * A sequence problem, said plainly.
 *
 * `changeOrderStages.ts` degrades to "not in the sequence" and REPORTS rather than
 * guessing, on the stated grounds that a ChangeOrder view which quietly invents an
 * order is worse than one admitting it cannot find one. Carrying that answer to
 * the screen is the whole point; rounding it off here would undo it.
 */
export function describeSequenceProblem(problem: ChangeOrderSequenceProblem): string {
  switch (problem.kind) {
    case 'no-workflow':
      return 'No ChangeWorkflow governs this ChangeOrder.';
    case 'stage-selects-nothing':
      return `${stageName(problem.stageName)} selects no Space.`;
  }
}

const stageName = (name: string) => `Stage "${name}"`;

export const sequenceProblemsCopy = {
  title: (n: number) => (n === 1 ? '1 issue' : `${n} issues`),
  blocksAll: 'Nothing can be promoted.',
  /** In the list's own style: `Stage "qa" and Stage "prod" cannot be promoted.` */
  holds: (names: readonly string[]) => {
    const named = names.map(stageName);
    const list = named.length === 1 ? named[0] : `${named.slice(0, -1).join(', ')} and ${named[named.length - 1]}`;
    return `${list} cannot be promoted.`;
  },
} as const;

/**
 * What the problems block, in a few words, or `undefined` when they block nothing. The server
 * never promotes past a Stage that selects no Space: every later Stage fails its promoted gate.
 * So the first empty Stage holds every Stage after it that has Spaces, and when it is the first
 * Stage, nothing can be promoted. No workflow blocks nothing: the server then promotes into the
 * ChangeOrder's own scope, with no gates.
 */
export function sequenceProblemsBlock(problems: readonly ChangeOrderSequenceProblem[], stageNames: readonly string[]): string | undefined {
  const empty = new Set(problems.flatMap((p) => (p.kind === 'stage-selects-nothing' ? [p.stageName] : [])));
  const firstEmpty = stageNames.findIndex((name) => empty.has(name));
  if (firstEmpty < 0) return undefined;
  if (firstEmpty === 0) return sequenceProblemsCopy.blocksAll;
  const held = stageNames.slice(firstEmpty + 1).filter((name) => !empty.has(name));
  return held.length === 0 ? undefined : sequenceProblemsCopy.holds(held);
}
