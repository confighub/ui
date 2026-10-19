// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * A draft's gates: what the workflow declares for each stage and for Final, before any of it can
 * be evaluated.
 *
 * The server evaluates gates only when a ChangeOrder that exists is promoted, so a draft reports
 * every declared check as not evaluated, with the CLI's wording and the author's description. It
 * does not use `buildGatesForStage`: with nothing promoted, its mandatory "promoted" gate would
 * read as a failure, and nothing has failed.
 *
 * The one exception is a prerequisite the workflow does not declare: the server refuses any
 * promotion that names one, so it is reported as refused, as the detail view reports it.
 *
 * Pure: no React, no RTK, so the browser-free specs can import it.
 */

import type { ChangeWorkflowSpec } from '@confighub/rtk-query';

import { changeOrderCopy } from '../../x/apps/change-order/changeOrderCopy';
import { BUILT_IN_PREREQUISITES, classifyPrerequisite } from '../../x/apps/change-order/changeOrderWorkflow';
import type { ChangeOrderGate } from '../../x/apps/change-order/changeOrderTypes';
import { draftCopy } from './draftCopy';

/**
 * An author's description as the sentence the reason quotes it in: trimmed, and ending in a
 * full stop when it ends in no punctuation, since "The server checks this." follows it.
 */
function asSentence(description: string | undefined): string | undefined {
  const trimmed = description?.trim();
  if (trimmed === undefined || trimmed === '') return undefined;
  return /[.!?…]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}

/**
 * One declared prerequisite as a gate nobody has evaluated.
 *
 * `overStage` is the stage whose Spaces the check is a condition on: the stage before the one
 * entered, the last stage for Final, or `undefined` for the first stage, whose gates the server
 * evaluates over the base Space.
 */
function draftGate(
  name: string,
  spec: ChangeWorkflowSpec,
  overStage: string | undefined,
  enteredStage: string,
  base: string,
): ChangeOrderGate {
  const classified = classifyPrerequisite(name, spec.CustomPrerequisites, spec.AttestationPrerequisites);
  const over = overStage ?? base;
  const notEvaluated = (id: string, gateName: string, reason: string, description?: string): ChangeOrderGate => ({
    id,
    name: gateName,
    ok: false,
    evaluated: false,
    reason,
    prerequisite: name,
    description,
  });
  switch (classified.kind) {
    case 'built-in': {
      if (classified.name === BUILT_IN_PREREQUISITES.validated) {
        return notEvaluated('validated', changeOrderCopy.gateNames.validated, changeOrderCopy.gateReasons.validated(over));
      }
      const gateName =
        classified.name === BUILT_IN_PREREQUISITES.released ? changeOrderCopy.gateNames.released : changeOrderCopy.gateNames.healthy;
      const reason =
        overStage === undefined ? draftCopy.gates.overBase(base) : changeOrderCopy.gateReasons.notEvaluated(overStage);
      return notEvaluated(classified.name.toLowerCase(), gateName, reason);
    }
    case 'custom':
      return notEvaluated(
        `custom-prerequisite:${name}`,
        changeOrderCopy.gateNames.customPrerequisite(name),
        changeOrderCopy.gateReasons.customPrerequisite(over, name, asSentence(classified.description)),
        classified.description,
      );
    case 'attestation':
      return notEvaluated(
        `attestation-prerequisite:${name}`,
        changeOrderCopy.gateNames.attestationPrerequisite(name),
        changeOrderCopy.gateReasons.attestationPrerequisite(over, name, asSentence(classified.description)),
        classified.description,
      );
    case 'unrecognised':
      return {
        id: `unrecognized-prerequisite:${name}`,
        name: changeOrderCopy.gateNames.unrecognizedPrerequisite,
        ok: false,
        evaluated: true,
        reason: changeOrderCopy.gateReasons.unrecognizedPrerequisite(enteredStage, name),
        prerequisite: name,
      };
  }
}

/**
 * The gates into `stageName` as the workflow declares them, each not evaluated. Empty for a
 * stage the workflow does not name, and for one that declares none.
 *
 * `base` names the Space a first stage's gates are evaluated over.
 */
export function draftGatesForStage(spec: ChangeWorkflowSpec, stageName: string, base: string): ChangeOrderGate[] {
  const stages = spec.Stages ?? [];
  const index = stages.findIndex((stage) => stage.Name === stageName);
  if (index < 0) return [];
  const overStage = index === 0 ? undefined : stages[index - 1].Name;
  return (stages[index].Prerequisites ?? []).map((name) => draftGate(name, spec, overStage, stageName, base));
}

/**
 * The workflow's Final prerequisites, each not evaluated: checked over the last stage's own
 * Spaces. A built-in check carries no sentence: "not evaluated" is all there is to say of it
 * before anything is promoted, and the stage sentence ("prod has to be released first") would
 * restate the check itself. A declared check keeps its author's description.
 */
export function draftFinalGates(spec: ChangeWorkflowSpec, base: string): ChangeOrderGate[] {
  const stages = spec.Stages ?? [];
  const last = stages.length === 0 ? undefined : stages[stages.length - 1].Name;
  return (spec.Final?.Prerequisites ?? []).map((name) => {
    const gate = draftGate(name, spec, last, 'Final', base);
    const builtIn = classifyPrerequisite(name, spec.CustomPrerequisites, spec.AttestationPrerequisites).kind === 'built-in';
    return builtIn ? { ...gate, reason: '' } : gate;
  });
}

/** How many of a draft's gates are known to hold: none, since nothing has been evaluated. */
export function draftGateSummary(gates: readonly ChangeOrderGate[]): string {
  return draftCopy.gates.summary(gates.length);
}
