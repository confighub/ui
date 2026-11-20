// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
//
// One canonical query arg per endpoint (ARCHITECTURE.md §7.1). RTK Query keys its cache by the
// arg serialized with JSON.stringify, which drops `undefined` but keeps `false` (§13 Q1b). So an
// option that is off is left out, never sent as `false`, and every caller that asks for the same
// answer shares one entry.
import type { GetUnitBlameApiArg, GetUnitPathApiArg } from '@confighub/rtk-query';

/**
 * Whole-unit blame follows upstream (the server's default when `upstream` is left out), so the
 * set-by line can name the person in the base. Kept as one constant; measure its cost on a large
 * Unit before the first release (ARCHITECTURE §13 Q2).
 */
export const BLAME_FOLLOW_UPSTREAM = true;

/** The whole-unit blame of one Unit: exactly the Space and the Unit, no filter. */
export function blameArg(spaceId: string, unitId: string): GetUnitBlameApiArg {
  // Following upstream is the server's default, so it is left out: the Blame tab's unfiltered
  // query then shares this entry.
  return BLAME_FOLLOW_UPSTREAM ? { spaceId, unitId } : { spaceId, unitId, upstream: false };
}

/** Where one field is: its Ref (stable across revisions and Variants) or its server path. */
export interface FieldAddress {
  spaceId: string;
  unitId: string;
  ref?: string;
  path?: string;
  /** Needed when the path is not unique in the Unit. */
  resourceName?: string;
}

/** The path report of one field. The Ref names the field when there is one. */
export function pathArg(address: FieldAddress, options: { history?: boolean } = {}): GetUnitPathApiArg {
  return {
    spaceId: address.spaceId,
    unitId: address.unitId,
    field: address.ref || address.path || '',
    resource: address.resourceName || undefined,
    history: options.history || undefined,
  };
}
