// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * Reading propagation problems for the status box: which Spaces they are about,
 * the headline, the items and their sentences, and the acknowledgement an
 * "…anyway" confirm asks for.
 */

import { PROBLEM_ITEM_LIMIT, stageCardCopy, type NamedSpace } from './stageCardCopy';
import { imageValueText } from './stageChangeLines';
import type { CopySegment, PropagationProblem } from './stageTypes';

// ---------------------------------------------------------------------------
// Reading the problems
// ---------------------------------------------------------------------------

/** The Spaces a list of problems is about, in first-seen order. */
export function problemSpaceIds(problems: readonly PropagationProblem[]): string[] {
  const ids: string[] = [];
  for (const problem of problems) {
    const own = problem.kind === 'unknown' ? problem.spaceIds : [problem.spaceId];
    for (const id of own) if (!ids.includes(id)) ids.push(id);
  }
  return ids;
}

/**
 * The status box's headline for its problems: one kind names itself, several say
 * "{n} Spaces take the change differently".
 */
export function propagationHeadline(problems: readonly PropagationProblem[], variantCount: number): string {
  const copy = stageCardCopy.headline;
  const kinds = new Set(problems.map((p) => p.kind));
  const n = problemSpaceIds(problems).length;
  if (kinds.size > 1) return copy.mixed(n);
  switch (problems[0]?.kind) {
    case 'unknown':
      return copy.unknown(n, variantCount);
    case 'refused':
      return copy.refused(n);
    case 'kept':
      return copy.kept(n);
    case 'differs':
      return copy.differs(n);
    case 'adds':
      return copy.adds(n);
    default:
      return '';
  }
}

/** The items the box lists, and how many more the diff holds. */
export function problemItems<T>(problems: readonly T[], limit: number = PROBLEM_ITEM_LIMIT): { shown: T[]; more: number } {
  return { shown: problems.slice(0, limit), more: Math.max(0, problems.length - limit) };
}

/** True when the box's confirm needs the "…anyway" acknowledgement. */
export function needsAcknowledgement(problems: readonly PropagationProblem[]): boolean {
  return problems.length > 0;
}

/** The acknowledgement's sentence: specific for one problem, general for several. */
export function acknowledgementText(problems: readonly PropagationProblem[], nameOf: (spaceId: string) => string): string {
  const ack = stageCardCopy.merge.ack;
  if (problems.length === 1) {
    const only = problems[0];
    if (only.kind === 'differs') {
      const [from, to] = differsValueTexts(only);
      return ack.differs(nameOf(only.spaceId), only.label, from, to);
    }
    if (only.kind === 'kept') return ack.kept(nameOf(only.spaceId), only.label, only.valueText);
  }
  if (problems.every((p) => p.kind === 'unknown')) return ack.unknown(problemSpaceIds(problems).length);
  return ack.several;
}

/** The four values of a `differs` problem as the box shows them: image tags for an image. */
export function differsValueTexts(problem: Extract<PropagationProblem, { kind: 'differs' }>): [string, string, string, string] {
  if (!problem.isImage) return [problem.from, problem.to, problem.refFrom, problem.refTo];
  const show = (value: string, other: string) => (value === '' ? '' : imageValueText(value, other));
  return [show(problem.from, problem.to), show(problem.to, problem.from), show(problem.refFrom, problem.refTo), show(problem.refTo, problem.refFrom)];
}

/**
 * The sentence for one problem item, with the Space, the Unit and the field as
 * links. The field is named by the short label the change lines use; its full
 * path is the link's title.
 */
export function problemSegments(
  problem: PropagationProblem,
  spaceOf: (spaceId: string) => NamedSpace,
  unitName: (unitId: string) => string,
): CopySegment[] {
  const copy = stageCardCopy.problem;
  switch (problem.kind) {
    case 'differs': {
      const [from, to, refFrom, refTo] = differsValueTexts(problem);
      return copy.differs(spaceOf(problem.spaceId), problem.label, { unitId: problem.unitId, path: problem.path }, from, to, refFrom, refTo);
    }
    case 'kept':
      return copy.kept(
        spaceOf(problem.spaceId),
        { unitId: problem.unitId, name: unitName(problem.unitId) },
        problem.path,
        problem.valueText,
        problem.reason === 'Subtracted',
        problem.label,
      );
    case 'refused':
      return copy.refused(spaceOf(problem.spaceId), { unitId: problem.unitId, name: unitName(problem.unitId) }, problem.details ?? problem.reason);
    case 'adds':
      return copy.adds(spaceOf(problem.spaceId), problem.resourceName, problem.unitId);
    case 'unknown': {
      const spaces = problem.spaceIds.map(spaceOf);
      if (problem.cause === 'mergeDeclined') return copy.mergeDeclined(problem.resourceName ?? '', spaces);
      if (problem.cause === 'unreadable') return copy.unreadable(spaces);
      if (problem.cause === 'noResources') return copy.noResources(spaces);
      return copy.unplanned(spaces);
    }
  }
}
