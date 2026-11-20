// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * A function run with a change active (D38): it runs once, on the Units that can go into your
 * change; Units held by another change are left out, because one run writes into one change.
 */
export interface ChangeName {
  space: string;
  slug: string;
}

export interface LeftOutUnit {
  unitId: string;
  /** SPACE/Unit. */
  label: string;
  /** The change that holds it, when it could be read. */
  change?: ChangeName;
}

export interface RunPlan {
  /** Units ticked. */
  total: number;
  /** Units the run writes: free ones and those already in your change. */
  run: number;
  /** Your active change. */
  change: ChangeName;
  left: LeftOutUnit[];
}

export const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
