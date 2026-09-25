// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * The bounds the server places on a ChangeWorkflow, checked before the round trip.
 *
 * These are a COURTESY, never an authority. Every one of them is enforced again in
 * `internal/views/changeworkflow.go`, and if this file ever disagrees with the server
 * the server is right. The check exists only so an author learns at the keystroke
 * rather than at the save.
 *
 * The values mirror the constants in `internal/models/changeworkflow.go`. They are
 * copied rather than derived because nothing carries them over the wire -- the
 * OpenAPI spec describes the fields, not their bounds.
 *
 * This file reports FACTS and never prose: which bound, what it allows, what was
 * found. The sentence shown to a reader is written where the rest of the page's
 * voice lives, because a limit message has to sound like the page and not like a
 * validator.
 */

import type { CustomPrerequisite, Stage } from '../types';

/** A workflow's Stages. Stages are waves rather than steps, so needing more is a mistake about which. */
export const MAX_STAGES = 64;
/** Declarations one workflow carries. */
export const MAX_CUSTOM_PREREQUISITES = 64;
/** Gates one Stage -- or Final -- may name. */
export const MAX_PREREQUISITES = 64;
/** A Stage name, which is displayed and named on the command line. */
export const MAX_STAGE_NAME_LENGTH = 128;
/** A Stage's selector. */
export const MAX_WHERE_SPACE_LENGTH = 4096;
/** A custom prerequisite's cel expression. */
export const MAX_EXPRESSION_LENGTH = 4096;
/** A custom prerequisite's description, which is a sentence explaining the gate. */
export const MAX_DESCRIPTION_LENGTH = 1024;

export type LimitName =
  | 'stages'
  | 'customPrerequisites'
  | 'prerequisites'
  | 'stageName'
  | 'whereSpace'
  | 'expression'
  | 'description';

/**
 * What a violation hangs off. The same shape as the page's own `ProblemTarget`, so
 * "Go to it" routes without a translation step between the two.
 */
export type LimitTarget =
  | { kind: 'workflow' }
  | { kind: 'stage'; id: string }
  | { kind: 'final' }
  | { kind: 'custom'; id: string };

export interface LimitViolation {
  limit: LimitName;
  target: LimitTarget;
  /** What the bound allows. */
  max: number;
  /**
   * What was found -- a count for the collection bounds, a character length for the
   * rest. Both numbers are carried because the page's voice is specific: a reader is
   * told the selector is 4,212 characters against a limit of 4,096, not that it is
   * "too long".
   */
  actual: number;
}

/** What `checkLimits` is given. Deliberately the parts, not a `Workflow`: nothing here reads a field this page has not settled. */
export interface LimitSubject {
  stages: Stage[];
  finalPrereqs: string[];
  custom: CustomPrerequisite[];
}

/**
 * Every bound the workflow currently breaks, in the order a reader meets them.
 *
 * All violations are reported rather than the first, because a workflow pasted in
 * from elsewhere can break several at once and fixing them one save at a time is a
 * poor way to spend an afternoon.
 */
export function checkLimits(subject: LimitSubject): LimitViolation[] {
  const violations: LimitViolation[] = [];

  if (subject.stages.length > MAX_STAGES) {
    violations.push({
      limit: 'stages',
      target: { kind: 'workflow' },
      max: MAX_STAGES,
      actual: subject.stages.length,
    });
  }

  if (subject.custom.length > MAX_CUSTOM_PREREQUISITES) {
    violations.push({
      limit: 'customPrerequisites',
      target: { kind: 'workflow' },
      max: MAX_CUSTOM_PREREQUISITES,
      actual: subject.custom.length,
    });
  }

  for (const stage of subject.stages) {
    const target: LimitTarget = { kind: 'stage', id: stage.id };
    if (stage.name.length > MAX_STAGE_NAME_LENGTH) {
      violations.push({
        limit: 'stageName',
        target,
        max: MAX_STAGE_NAME_LENGTH,
        actual: stage.name.length,
      });
    }
    if (stage.where.length > MAX_WHERE_SPACE_LENGTH) {
      violations.push({
        limit: 'whereSpace',
        target,
        max: MAX_WHERE_SPACE_LENGTH,
        actual: stage.where.length,
      });
    }
    if (stage.prereqs.length > MAX_PREREQUISITES) {
      violations.push({
        limit: 'prerequisites',
        target,
        max: MAX_PREREQUISITES,
        actual: stage.prereqs.length,
      });
    }
  }

  // Final is bounded the same way a Stage is, and is easy to miss because it does not
  // live in the Stages array. The server checks it at `changeworkflow.go:122`.
  if (subject.finalPrereqs.length > MAX_PREREQUISITES) {
    violations.push({
      limit: 'prerequisites',
      target: { kind: 'final' },
      max: MAX_PREREQUISITES,
      actual: subject.finalPrereqs.length,
    });
  }

  for (const custom of subject.custom) {
    const target: LimitTarget = { kind: 'custom', id: custom.id };
    if (custom.expression.length > MAX_EXPRESSION_LENGTH) {
      violations.push({
        limit: 'expression',
        target,
        max: MAX_EXPRESSION_LENGTH,
        actual: custom.expression.length,
      });
    }
    if (custom.description.length > MAX_DESCRIPTION_LENGTH) {
      violations.push({
        limit: 'description',
        target,
        max: MAX_DESCRIPTION_LENGTH,
        actual: custom.description.length,
      });
    }
  }

  return violations;
}
