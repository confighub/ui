// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import type { FunctionInvocationsResponse } from '@confighub/rtk-query';

import { buildUnitDiff, type UnitDiff } from './diff-from-revisions';

/** Pre-invocation snapshot of a unit — the "before" side of the diff. */
export interface InvocationBeforeSnapshot {
  spaceId: string;
  unitSlug: string;
  data?: string;
}

/** Build UnitDiff[] from invocation responses paired with pre-invocation
 *  unit data. Only successful responses that carry post-invocation config are
 *  included — failures surface via the existing error UI, and no-op
 *  invocations stay silent. */
export const buildInvocationDiffs = (
  responses: FunctionInvocationsResponse[] | undefined,
  beforeByUnitId: Record<string, InvocationBeforeSnapshot>,
): UnitDiff[] => {
  if (!responses) return [];
  const diffs: UnitDiff[] = [];
  for (const response of responses) {
    const unitId = response.UnitID;
    if (!unitId) continue;
    if (!response.Success) continue;
    // ConfigData is the invocation's post-invocation config; it is absent
    // unless the invocation actually changed the unit, so its presence is the
    // only signal that guarantees a real "after" side to diff against.
    if (!response.ConfigData) continue;
    const before = beforeByUnitId[unitId];
    if (!before) continue;
    diffs.push(
      buildUnitDiff(
        unitId,
        before.spaceId,
        before.unitSlug,
        before.data,
        response.ConfigData,
      ),
    );
  }
  return diffs;
};
