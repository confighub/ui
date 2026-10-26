// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import type { FunctionInvocationsResponse, ValidationResult } from '@confighub/rtk-query';

import { parseGateName } from '@/utility/name-format-functions';
import { decodeBase64 } from '@/utility/string-functions';

import { CHECK } from './copy';
import { gateDetail } from './details';

/**
 * Checking a failing gate again from the row panel, as the Unit page does: the
 * gate's Trigger runs on the Unit's current config and says whether it passes.
 * The check is for display only. It does not store its result, so the gate
 * stays failing on the Unit (and blocks a Release) until the Unit next changes.
 */

export type GateCheckState = 'running' | 'passed' | 'failed' | 'error';

export interface GateCheck {
  state: GateCheckState;
  /** Why it fails, or why the check could not run. */
  message?: string;
}

/** The text of a check's result, on its gate's line. */
export function gateCheckText(check: GateCheck): string {
  switch (check.state) {
    case 'running':
      return CHECK.running;
    case 'passed':
      return CHECK.passed;
    case 'failed':
      return CHECK.failed(check.message);
    case 'error':
      return CHECK.error(check.message);
  }
}

/**
 * The Triggers to run for a check of `gates`, each once: one Trigger can hold
 * several of the gates (one per function of its Invocation). A gate with no
 * known Trigger cannot be checked, so it is left out.
 */
export function triggersToRun(gates: readonly string[], triggerIds: Readonly<Record<string, string>> | undefined): Map<string, string[]> {
  const byTrigger = new Map<string, string[]>();
  for (const gate of gates) {
    const id = triggerIds?.[gate];
    if (!id) continue;
    byTrigger.set(id, [...(byTrigger.get(id) ?? []), gate]);
  }
  return byTrigger;
}

function decodeResults(output: string): ValidationResult[] | null {
  try {
    const parsed: unknown = JSON.parse(decodeBase64(output));
    return Array.isArray(parsed) ? (parsed as ValidationResult[]) : parsed && typeof parsed === 'object' ? [parsed as ValidationResult] : null;
  } catch {
    return null;
  }
}

/**
 * What the Trigger's run says of one gate. A gate whose name ends in ":<n>"
 * is the n-th function of its Trigger's Invocation; otherwise it is the only one.
 */
export function gateCheckOutcome(responses: readonly FunctionInvocationsResponse[] | undefined, gate: string): GateCheck {
  const response = responses?.[0];
  if (!response) return { state: 'error', message: CHECK.noResult };
  if (response.Error) return { state: 'error', message: response.Error.Message || undefined };
  const output = response.Outputs?.['ValidationResult'] || response.Outputs?.['ValidationResultList'];
  const results = output ? decodeResults(output) : null;
  if (!results) return { state: 'error', message: CHECK.noResult };
  const index = (parseGateName(gate).functionIndex ?? 1) - 1;
  const result = results.find((r) => r?.Index === index) ?? results[index];
  if (!result) return { state: 'error', message: CHECK.noResult };
  if (result.Passed) return { state: 'passed' };
  return { state: 'failed', message: gateDetail([result])?.message };
}
