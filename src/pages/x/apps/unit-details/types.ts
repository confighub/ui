// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/** Patch payload for updating a unit's Labels and/or Annotations (full-map replacement). */
export interface UnitMetaPatch {
  Labels?: Record<string, string>;
  Annotations?: Record<string, string>;
}
