// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import { ViewColumn } from '@confighub/rtk-query';

/**
 * One row in a Resource-typed view: a single configuration resource, read from
 * the Resource entity ConfigHub maintains as each Unit's data changes.
 *
 * Unit and Space context is carried on the row so those columns resolve without
 * a second lookup. The slugs come free with the resource; the rest is hydrated
 * from a units query and is present only when a column asks for it.
 *
 * The shape intentionally mirrors `pages/x/resource-explorer/hooks/useResourceRows::ResourceRow`
 * — the two pages are spiritual siblings. Keeping a separate type here avoids
 * cross-page imports while still letting us reuse the conversion utilities.
 */
export interface ResourceViewRow {
  /** Stable DataGrid row id. The ResourceID, which is unique across the org. */
  id: string;
  // ── Resource ───────────────────────────────────────────────────────────────
  ResourceID: string;
  ResourceType: string;
  ResourceName: string;
  /**
   * The resource in its original toolchain-native form, present when the fetch
   * asked for it. What the drawer displays.
   */
  ResourceBody?: string;
  /**
   * Column values computed by the server from the View's definition, keyed by
   * column name. A column whose path or expression selects several values has
   * several entries, so this is a list rather than one value per name.
   *
   * This is what makes DataPath and DataExpression columns work without the
   * page ever seeing the resource document.
   */
  ViewColumns?: ViewColumn[];
  // ── Unit context ───────────────────────────────────────────────────────────
  UnitID: string;
  UnitSlug: string;
  UnitDisplayName?: string;
  UnitToolchainType?: string;
  UnitProviderType?: string;
  UnitHeadRevisionNum?: number;
  UnitLastReleasedRevisionNum?: number;
  UnitUpstreamRevisionNum?: number;
  UnitCreatedAt?: string;
  UnitUpdatedAt?: string;
  UnitLastChangeDescription?: string;
  UnitLabels: Record<string, string>;
  // ── Space context ──────────────────────────────────────────────────────────
  SpaceID: string;
  SpaceSlug: string;
  SpaceLabels: Record<string, string>;
  /** Slug of the unit's bound Target, if any. */
  TargetSlug?: string;
}

/** Type guard for discriminating ResourceViewRow from GroupNavRow neighbours. */
export function isResourceViewRow(row: unknown): row is ResourceViewRow {
  if (!row || typeof row !== 'object') return false;
  const candidate = row as Record<string, unknown>;
  // ResourceType is present on every resource row (always a string, even if
  // empty); ExtendedUnitRead / ExtendedSpaceRead don't have it at the top
  // level. This is the cheapest reliable discriminator.
  return typeof candidate.ResourceType === 'string' && typeof candidate.UnitID === 'string';
}
