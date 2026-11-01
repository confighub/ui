// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * Patch payload for updating a unit's Labels and/or Annotations (full-map replacement), and
 * whether it is Unreleasable.
 */
export interface UnitMetaPatch {
  Labels?: Record<string, string>;
  Annotations?: Record<string, string>;
  Unreleasable?: boolean;
}
