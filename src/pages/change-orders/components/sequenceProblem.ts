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
      return `Stage "${problem.stageName}" selects no Space.`;
  }
}
