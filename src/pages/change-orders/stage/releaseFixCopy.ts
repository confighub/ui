// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * The words of "Release the fix": the offer, on the problem line it answers or on the
 * release line, and its confirm. A fix is a Revision saved outside the ChangeOrder after the
 * change arrived; releasing it moves the ChangeOrder's release Tag to it, then releases the
 * Space again.
 */

import { namesText } from '../components/spaceListLogic';

/** `SPACE/Unit`, as a Unit is always shown. */
export const unitName = (space: string, unit: string) => `${space}/${unit}`;

type Named = { name: string; from: number; to: number };

export const releaseFixCopy = {
  action: 'Release the fix',
  /** Next to the problem line: "prod-eu/webhook Revision 6 has the change, but a release publishes Revision 5." */
  offerProblem: (units: readonly Named[]) =>
    units.length === 1
      ? `${units[0].name} Revision ${units[0].to} has the change, but a release publishes Revision ${units[0].from}.`
      : `${namesText(units.map((u) => `${u.name} Revision ${u.to}`))} have the change, but a release publishes the older Revisions.`,
  /** On the release line, for a gate: "prod-eu/webhook has a newer Revision 6, saved outside this ChangeOrder." */
  offerGate: (units: readonly Named[]) =>
    units.length === 1
      ? `${units[0].name} has a newer Revision ${units[0].to}, saved outside this ChangeOrder.`
      : `${namesText(units.map((u) => `${u.name} (Revision ${u.to})`))} have newer Revisions, saved outside this ChangeOrder.`,
  title: (stage: string) => `Release the fix to ${stage}`,
  outside: (unitCount: number) =>
    unitCount === 1
      ? 'This edit was made outside the ChangeOrder. To release it, the ChangeOrder adopts it: its release Tag moves to the new Revision, then the Space is released again.'
      : 'These edits were made outside the ChangeOrder. To release them, the ChangeOrder adopts them: its release Tag moves to the new Revisions, then the Spaces are released again.',
  approval: (unitCount: number) =>
    unitCount === 1
      ? 'An approval of the old Revision may not count for the new one. The release gates read the new Revision.'
      : 'An approval of the old Revisions may not count for the new ones. The release gates read the new Revisions.',
  moreUnits: (n: number) => `+${n} more`,
  showAllUnits: (total: number) => `Show all ${total} Units`,
  unit: (name: string, from: number, to: number) => `${name}: Revision ${from} → Revision ${to}`,
  savedBy: (who: string | undefined, at: string | undefined) =>
    who !== undefined && at !== undefined
      ? `Saved by ${who}, ${at}.`
      : who !== undefined
        ? `Saved by ${who}.`
        : at !== undefined
          ? `Saved ${at}.`
          : undefined,
  diffLoading: 'Reading what changed…',
  diffFailed: 'What changed could not be read.',
  noDiff: 'The configuration is the same in both Revisions.',
  /** The offer changed while the confirm was open: Confirm would move the Tag to Revisions it does not show. */
  stale: 'A newer Revision was saved. Review again.',
  reviewAgain: 'Review again',
  cancel: 'Cancel',
  close: 'Close',
  confirm: 'Move the Tag and release',
  working: 'Working…',
  /** The release Tag was refused in a Space: nothing is released there. */
  notMoved: (space: string, message: string) => `The release Tag did not move in ${space}, so ${space} was not released: ${message}`,
  /** The Tag moved on some Units of a Space and not on others: the Space is not released, and what moved is said. */
  partlyMoved: (space: string, moved: readonly string[], notMoved: readonly string[], message: string) =>
    `The release Tag moved for ${namesText(moved)} but not for ${namesText(notMoved)} in ${space}, so ${space} was not released: ${message}`,
  /** A Unit sent got no answer: the server leaves out a Unit that is gone or that the person cannot see. */
  noAnswer: (units: readonly string[]) =>
    units.length === 1
      ? `${units[0]} got no answer. It may not exist now, or you may not have permission to see it.`
      : `${namesText(units)} got no answer. They may not exist now, or you may not have permission to see them.`,
  /** The move went through and the release that followed did not. */
  movedReleaseFailed: (spaces: readonly string[], message: string) =>
    `The release Tag moved in ${namesText(spaces)}. The release failed: ${message}`,
  /** Some Spaces were released, and others were not: said first, so a partial result is not read as a failure only. */
  releasedIn: (spaces: readonly string[]) => `Released the fix to ${namesText(spaces)}.`,
  released: (stage: string) => `Released the fix to ${stage}.`,
  /** The note in the change card when the reads that settle the problem lines failed: the lines may be out of date. */
  readFailed: (message: string) =>
    `Could not read whether a fix was released after the promotion, so the lines about how each Space takes the change may be out of date: ${message}`,
};
