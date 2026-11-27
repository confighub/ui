// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

// The Unreleased fields of a Unit, by stage key: the fields Blame marks unreleased, in a Unit
// with a Target and changes since its last release (the Unit header's rule). The sheet marks
// them and draws them in the Changes scope; the pane counts them in the Changes chip. Both
// read them here, so the chip and the scope agree.

import type { MergedUnit } from '../componentTypes';
import type { AtomOrigin } from './sheetOrigin';

const NO_KEYS: ReadonlySet<string> = new Set();

/**
 * Whether the Unit shows Unreleased changes, as the Unit header does: it has a Target and
 * changes since its last release. A Unit never released has no "last release" to differ from:
 * Blame flags every field then, and the apply diff is empty, so no field is Unreleased.
 */
export function hasUnreleasedChanges(unit: Pick<MergedUnit, 'applyEntry' | 'targetId'>): boolean {
  return !!unit.applyEntry && !!unit.targetId && unit.applyEntry.fieldDiffs.length > 0;
}

/** The stage keys of the Unreleased fields, from the Unit's joined Blame. */
export function unreleasedKeysOf(
  unit: Pick<MergedUnit, 'applyEntry' | 'targetId'>,
  origins: ReadonlyMap<string, AtomOrigin> | undefined,
): ReadonlySet<string> {
  if (!origins || !hasUnreleasedChanges(unit)) return NO_KEYS;
  const keys = new Set<string>();
  for (const [key, o] of origins) if (o.unreleased) keys.add(key);
  return keys.size ? keys : NO_KEYS;
}

