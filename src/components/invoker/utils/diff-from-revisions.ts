// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import { buildPaths, computeFieldDiffs } from '@/pages/x/apps/entryBuilders';
import type { FieldDiff } from '@/pages/x/apps/componentTypes';

export interface UnitDiff {
  unitId: string;
  spaceId: string;
  unitSlug: string;
  /** Field-level diffs — same shape the component view uses. */
  diffs: FieldDiff[];
  /** Full path/value pairs of the after-state data, in document order. Powers
   *  context expansion in the tree diff UI — click a parent key to see its
   *  surrounding unchanged context. */
  allPaths: { path: string; value: string }[];
}

/** Build a UnitDiff from before/after Data strings. */
export const buildUnitDiff = (
  unitId: string,
  spaceId: string,
  unitSlug: string,
  beforeData: string | undefined,
  afterData: string | undefined,
): UnitDiff => ({
  unitId,
  spaceId,
  unitSlug,
  diffs: computeFieldDiffs(beforeData, afterData),
  allPaths: buildPaths(afterData),
});
