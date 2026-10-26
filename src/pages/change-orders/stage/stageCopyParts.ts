// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * The pieces the stage card's copy is built from: the flags for decisions still
 * open, and the segment builders for sentences that carry links or code.
 */

import { plural } from '../changeOrderHistory';
import type { CopyLinkRef, CopySegment } from './stageTypes';

// ---------------------------------------------------------------------------
// Flags for decisions that are still open. Each one flips one behaviour.
// ---------------------------------------------------------------------------

/**
 * Whether an approval needs a reason. The server accepts an empty Note; a
 * rejection still needs one, because the author has to know what to change.
 */
export const APPROVAL_NOTE_REQUIRED = false;

/** Whether the review form asks for a note for this choice. */
export function noteRequired(choice: 'Pass' | 'Fail'): boolean {
  return choice === 'Fail' || APPROVAL_NOTE_REQUIRED;
}

/** The counter under the note appears past this many characters. */
export const NOTE_COUNTER_FROM = 3500;

/** At most this many problem items in the box; the rest are in the diff. */
export const PROBLEM_ITEM_LIMIT = 5;

/** At most this many reviewers under a review row while it is open. */
export const REVIEWER_ROW_LIMIT = 3;

// ---------------------------------------------------------------------------
// Segments
// ---------------------------------------------------------------------------

export const seg = {
  text: (text: string): CopySegment => ({ kind: 'text', text }),
  code: (text: string): CopySegment => ({ kind: 'code', text }),
  link: (text: string, ref: CopyLinkRef, code = false, title?: string): CopySegment => ({
    kind: 'link',
    text,
    ref,
    ...(code ? { code } : {}),
    ...(title === undefined || title === text ? {} : { title }),
  }),
};

/** The plain sentence a list of segments spells, for accessible names and tests. */
export function segmentsText(parts: readonly CopySegment[]): string {
  return parts.map((part) => part.text).join('');
}

/** `a`, `a and b`, `a, b and c`, as segments. */
export function listSegments(items: readonly CopySegment[][]): CopySegment[] {
  const out: CopySegment[] = [];
  items.forEach((item, i) => {
    if (i > 0) out.push(seg.text(i === items.length - 1 ? ' and ' : ', '));
    out.push(...item);
  });
  return out;
}

export interface NamedSpace {
  spaceId: string;
  name: string;
}

/**
 * The end of a "differs" item. One side may not change the field at all: the
 * Space changes it where the reference does not, or the other way round.
 */
export function differsTail(from: string, to: string, refFrom: string, refTo: string): string {
  if (refFrom === '' && refTo === '') return ` goes ${from} → ${to} here only.`;
  if (from === '' && to === '') return ` stays as it is here, not ${refFrom} → ${refTo}.`;
  return ` goes ${from} → ${to} here, not ${refFrom} → ${refTo}.`;
}

export const spaceLink = (space: NamedSpace) => seg.link(space.name, { to: 'space', spaceId: space.spaceId });

/** "{n} approval" / "{n} approvals". */
export const approvals = (n: number) => plural(n, 'approval');
