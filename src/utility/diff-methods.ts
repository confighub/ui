// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import { ExtendedUnitRead } from '@confighub/rtk-query';



/**
 * How many Units in the list have unreleased changes: their head Revision holds different
 * configuration from the one that is live.
 *
 * This counts Units, not changed lines. Counting lines would mean downloading both Revisions
 * of every Unit in the list -- two requests each, for a number displayed in a header -- and
 * the configuration is no longer carried on the entity precisely so that a list does not move
 * it. DataHash answers "is this different" exactly, without moving anything, which is the
 * question the counter is really asking.
 */
export const calculateTotalChanges = (units: ExtendedUnitRead[]): number =>
  units.reduce((total, unit) => {
    const liveHash = unit.LastReleasedRevision?.DataHash;
    const headHash = unit.HeadRevision?.DataHash;
    // A Unit that has never been applied has no live Revision to differ from.
    if (!liveHash || !headHash) return total;
    return liveHash === headHash ? total : total + 1;
  }, 0);

export const getDiffStats = (liveData: string, headData: string) => {
  // Simple line-based diff stats
  const liveLines = liveData.split('\n');
  const headLines = headData.split('\n');

  const maxLines = Math.max(liveLines.length, headLines.length);
  let additions = 0;
  let deletions = 0;
  let changes = 0;

  for (let i = 0; i < maxLines; i++) {
    const liveLine = liveLines[i] || '';
    const headLine = headLines[i] || '';

    if (liveLine !== headLine) {
      if (!liveLine) additions++;
      else if (!headLine) deletions++;
      else changes++;
    }
  }

  return { additions, deletions, changes };
};
