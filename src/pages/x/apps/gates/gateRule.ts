// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

export const NO_DESCRIPTION =
  'The Trigger has no description. Add one so others know how to fix this gate.';

/** The lead line of a gate. */
export interface GateRuleText {
  /** The Trigger's Description, or NO_DESCRIPTION when it has none. */
  lead: string;
  /** The lead is NO_DESCRIPTION. */
  noDescription: boolean;
}

/**
 * The Description says what is wrong and how to fix it, so it leads. What the Trigger runs goes
 * in its details (TriggerRuleDetails), which are read from the function signatures.
 */
export const gateRuleText = (description: string | undefined): GateRuleText => {
  const lead = description?.trim();
  return lead ? { lead, noDescription: false } : { lead: NO_DESCRIPTION, noDescription: true };
};
