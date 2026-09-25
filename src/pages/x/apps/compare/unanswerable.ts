// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * What a cell says when it has no value to show, and why.
 *
 * ONE LIST, BECAUSE TWO ALREADY DRIFTED. The grid and the hoisted image rows
 * each spelled this out for themselves, and when a third reason was added only
 * one of them learned it: the same empty unit read "empty" in the tree and
 * "loading" in the image rows above it, and the image rows waited forever. Two
 * descriptions of one fact do not stay equal, so there is now one.
 *
 * ONLY `loading` IS TRANSIENT. Every other reason is a settled answer, and a
 * settled answer that prints "loading" is a cell that waits forever in front of
 * a reader with no way to know that nothing is coming.
 */

/** Why a column has nothing to show. `undefined` means the column answered fine. */
export type ColumnUnavailable = 'loading' | 'no-such-unit' | 'empty-unit' | undefined;

/** Every reason a cell can have no value, including the one that belongs to the row. */
export type UnanswerableReason = NonNullable<ColumnUnavailable> | 'no-document';

export interface UnanswerableWording {
  /** The word in the cell. */
  word: string;
  /** The full sentence, for the title and the accessible name. */
  why: (deploymentLabel: string) => string;
  /** False for a settled answer. Only a true one may read as a wait. */
  transient: boolean;
}

export const UNANSWERABLE: Record<UnanswerableReason, UnanswerableWording> = {
  loading: {
    word: 'loading',
    why: (label) => `${label} has not finished loading`,
    transient: true,
  },
  'no-such-unit': {
    word: 'no unit',
    why: (label) => `${label} holds no unit of this name, so it has no value to compare`,
    transient: false,
  },
  'empty-unit': {
    word: 'empty',
    why: (label) => `${label} holds this unit, but it has no configuration in it`,
    transient: false,
  },
  'no-document': {
    word: 'no resource',
    why: (label) => `${label} holds no resource of this kind, so this field does not exist there`,
    transient: false,
  },
};

/**
 * The reason a cell cannot answer.
 *
 * `no-document` belongs to the ROW and outranks the column's reason, which by
 * then is `undefined` — the unit loaded, it simply holds no such resource.
 */
export function unanswerableReason(
  cellKind: 'unknown' | 'no-document',
  columnUnavailable: ColumnUnavailable,
): UnanswerableReason {
  if (cellKind === 'no-document') return 'no-document';
  return columnUnavailable ?? 'loading';
}
