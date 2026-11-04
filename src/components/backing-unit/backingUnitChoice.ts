// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/** What the user chose about giving an entity a backing Unit. */
export interface BackingUnitChoice {
  enabled: boolean;
  /** The Space to hold a Space's or a Component's backing Unit; empty for other types. */
  spaceId: string;
}

export const NO_BACKING_UNIT: BackingUnitChoice = { enabled: false, spaceId: '' };

/** Whether the choice can be sent: a Space or a Component also needs its Unit's Space. */
export function isBackingUnitChoiceComplete(
  choice: BackingUnitChoice,
  needsSpace: boolean,
): boolean {
  return !choice.enabled || !needsSpace || choice.spaceId !== '';
}
