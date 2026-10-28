// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * The create dry run's answer, read for the draft: each refusal on the decision it belongs
 * to, and the Units the ChangeOrder would pass over.
 *
 * A refusal is matched by what the server says, in its own words. Those words are the server's
 * contract with `cub` as much as with this page, so they are stable; a refusal none of these
 * recognise goes beside Create, verbatim, rather than nowhere.
 *
 * Pure: no React, no RTK, so the browser-free specs can import it.
 */
import type { ChangeOrderRead } from '@confighub/rtk-query';

import type { DraftUnitCarry, DraftUnitRange } from './draftChangeCards';
import type { DraftProblem, DraftRow } from './draftTypes';

/**
 * Whether an answer is the server refusing the request (4xx), as against failing to answer:
 * a 5xx, a network error or a timeout says nothing about the draft, so it is never shown as a
 * refusal of it.
 */
export function isRefusal(status: unknown): status is number {
  return typeof status === 'number' && status >= 400 && status < 500;
}

/** Which row a refusal belongs to, by HTTP status and the server's message. */
export function refusalRow(status: number | undefined, message: string): DraftRow {
  // The slug is unique in the Space, and so are the `<slug>-co-start` / `-co-end` Tags it mints.
  if (status === 409) return 'name';
  if (/requires a ChangeWorkflow|is not allowed by component|ChangeWorkflow/i.test(message))
    return 'path';
  if (
    /different revisions of it|in the middle of a change|EndTagID|\bTag\b|revision/i.test(
      message,
    )
  )
    return 'howMuch';
  if (/headed for|InScopeSpaceIDs|space .* not found|\bspaces?\b/i.test(message))
    return 'where';
  if (/\bSlug\b/.test(message)) return 'name';
  if (/Description/.test(message)) return 'description';
  if (/UpdateType/.test(message)) return 'same';
  return 'create';
}

/** A code for the refusal, for tests and icons. */
function refusalCode(row: DraftRow, status: number | undefined): string {
  if (row === 'name' && status === 409) return 'name-taken';
  return `refused-${row}`;
}

/** The server's refusal as a problem on its row. */
export function refusalProblem(status: number | undefined, message: string): DraftProblem {
  const row = refusalRow(status, message);
  return { row, code: refusalCode(row, status), message, source: 'server', blocks: true };
}

/** A Unit the ChangeOrder would carry no Revisions of, and why, as `SkippedUnits` says. */
export interface DraftSkippedUnit {
  unitId: string;
  /** `NotMarked`, `AlreadyTaken`, … — `skippedUnitReasonText` words it. */
  reason: string;
}

/** `SkippedUnits`, in the order the base's Units are listed. */
export function skippedUnitsOf(
  result: ChangeOrderRead | undefined,
  unitOrder: readonly string[] = [],
): DraftSkippedUnit[] {
  const skipped = (result?.SkippedUnits ?? {}) as Record<string, string>;
  const rank = (unitId: string) => {
    const at = unitOrder.indexOf(unitId);
    return at === -1 ? unitOrder.length : at;
  };
  return Object.entries(skipped)
    .map(([unitId, reason]) => ({ unitId, reason }))
    .sort((a, b) => rank(a.unitId) - rank(b.unitId) || a.unitId.localeCompare(b.unitId));
}

/** Each `SkippedUnits` reason as the carry it means. */
const CARRY_OF_REASON: Readonly<Record<string, DraftUnitCarry>> = {
  AlreadyTaken: 'taken',
  TakenPastEnd: 'takenPastEnd',
  NotMarked: 'notMarked',
  NotFollowed: 'notFollowed',
  FollowedByOtherLinks: 'followedByOtherLinks',
  NoStartRevision: 'noStartRevision',
};

export interface DraftRangeReconciliation {
  /** The ranges with the server's answer applied: what the source and the preview read. */
  ranges: DraftUnitRange[];
  /** Slugs worked out here as carried that the server passes over. */
  passedOver: string[];
  /** Slugs worked out here as not carried that the server carries. Their range is `unknown`. */
  carried: string[];
}

/**
 * The ranges worked out from the Revisions and pointers, corrected by the create dry run's
 * `SkippedUnits`: the server's answer is the one Create acts on, so a Unit it passes over is
 * not carried, whatever was worked out here, and a Unit it carries that was not expected to be
 * has a range nobody here can state. Where the two disagree, each direction is reported.
 */
export function reconcileRanges(
  ranges: readonly DraftUnitRange[],
  skipped: readonly DraftSkippedUnit[],
): DraftRangeReconciliation {
  const reasonByUnit = new Map(skipped.map((unit) => [unit.unitId, unit.reason]));
  const passedOver: string[] = [];
  const carried: string[] = [];
  const reconciled = ranges.map((range): DraftUnitRange => {
    const reason = reasonByUnit.get(range.unitId);
    if (reason !== undefined) {
      if (range.carry === 'carries') passedOver.push(range.slug);
      const carry = CARRY_OF_REASON[reason] ?? 'skipped';
      return {
        ...range,
        carry,
        end: carry === 'taken' ? range.start : undefined,
        cloneSpaceIds: [],
        endRevisionId: undefined,
      };
    }
    if (
      range.carry === 'carries' ||
      range.carry === 'unknown' ||
      range.carry === 'disagrees'
    ) {
      return range;
    }
    carried.push(range.slug);
    return {
      ...range,
      carry: 'unknown',
      end: undefined,
      cloneSpaceIds: [],
      endRevisionId: undefined,
    };
  });
  return { ranges: reconciled, passedOver, carried };
}
