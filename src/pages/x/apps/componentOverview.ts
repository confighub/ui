// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import type { ComponentRead, ExtendedSpaceRead } from '@confighub/rtk-query';

import { componentOwner } from './componentOwner';
import type { OpenChangeSet } from './useOpenChangeSets';

// ============================================================================
// TYPES
// ============================================================================

export interface ComponentKpiRow {
  componentName: string;
  owner: string;
  /** Count of this component's Spaces. */
  totalSpaces: number;
  /** Sum of UnreleasedUnitCount across this component's Spaces. */
  unapplied: number;
  /** Sum of GatedUnitCount across this component's Spaces. */
  gatesPending: number;
  /** Sum of UpgradableUnitCount across this component's Spaces. */
  upgrades: number;
  /**
   * Whether a ChangeOrder exists based in one of this component's Spaces
   * (including its base) — existence, not completion (see
   * useOutstandingChangeOrdersBulk.ts). `false` when the caller passes no
   * `outstandingChangeOrderBaseSpaceIds` set at all, same as every other KPI
   * here reading 0 before its data has arrived.
   */
  hasOutstandingChangeOrder: boolean;
  /**
   * The ChangeSets open on units in this component's Spaces: a label (the slug,
   * qualified with its Space when it is not one of the component's) and the
   * ChangeSet's own Space and slug, which address its page.
   * Empty when the caller passes no `openChangeSets` at all.
   */
  openChangeSets: OverviewChangeSet[];
}

export interface OverviewChangeSet {
  label: string;
  slug: string;
  spaceSlug?: string;
}

export interface OrgKpiSummary {
  totalComponents: number;
  unapplied: number;
  gatesPending: number;
  upgrades: number;
  /** Count of components (rows) with `hasOutstandingChangeOrder` true. */
  outstandingChangeOrders: number;
  /** Count of components (rows) with a ChangeSet open on one of their units. */
  openChangeSetComponents: number;
}

export interface OverviewData {
  rows: ComponentKpiRow[];
  org: OrgKpiSummary;
}

// ============================================================================
// DATA BUILDER
// ============================================================================

/**
 * Build the KPI matrix data for the Components Overview dashboard.
 *
 * Uses pre-aggregated summary fields on ExtendedSpaceRead (populated by
 * the `summary: true` flag on the spaces query) — no additional fetch needed.
 * Every one of a component's Spaces is summed unconditionally (no
 * base/deployment split): a Space with no upstream naturally contributes 0 to
 * `upgrades` since nothing can be behind with no upstream to compare against,
 * so a true base/template Space costs the KPI nothing on its own. This
 * mirrors the flow graph's `buildComponentData`, which likewise sums
 * `upgradeableBySpace`/`unappliedBySpace` over every Space with no base
 * exclusion — Target assignment (`Unit.TargetID`) is not a reliable "is this
 * a real deployment" signal: Targets are optional and commonly absent
 * entirely, so gating the KPI sum on Target presence previously caused real,
 * genuinely-stale deployment Spaces to be silently skipped.
 *
 * `outstandingChangeOrderBaseSpaceIds` is the ONE numeric-style field that comes
 * from a separate, dedicated fetch (`useOutstandingChangeOrdersBulk`), not from
 * `ExtendedSpaceRead` — see that hook for why a per-Space summary count
 * cannot answer this. Checked against every one of a component's Spaces,
 * base included, since a ChangeOrder's SpaceID is where it resides, and that
 * space is typically the base.
 *
 * `openChangeSets` comes from its own fetch too (`useOpenChangeSets`): a
 * ChangeSet is open on a unit, so a component has one when any of its Spaces
 * holds such a unit.
 *
 * `owner` is read with `componentOwner`, from the Component and every one of
 * its Spaces in `spaces`.
 */
export function buildOverviewData(
  spaces: ExtendedSpaceRead[],
  componentById: ReadonlyMap<string, ComponentRead>,
  outstandingChangeOrderBaseSpaceIds?: ReadonlySet<string>,
  openChangeSets?: ReadonlyMap<string, OpenChangeSet>,
): OverviewData {
  // 1. Group component spaces by Component
  const componentGroups = new Map<string, { component: ComponentRead; spaces: ExtendedSpaceRead[] }>();
  for (const space of spaces) {
    const componentId = space.Space?.ComponentID;
    const component = componentId ? componentById.get(componentId) : undefined;
    if (!componentId || !component) continue;
    const group = componentGroups.get(componentId);
    if (group) group.spaces.push(space);
    else componentGroups.set(componentId, { component, spaces: [space] });
  }

  // 2. Build one row per component
  const rows: ComponentKpiRow[] = [];

  for (const { component, spaces: compSpaces } of componentGroups.values()) {
    const componentName = component.Slug;
    const owner = componentOwner(component, compSpaces.map((s) => s.Space));

    let totalSpaces = 0;
    let unapplied = 0;
    let gatesPending = 0;
    let upgrades = 0;

    let hasOutstandingChangeOrder = false;

    for (const space of compSpaces) {
      totalSpaces++;
      unapplied += space.UnreleasedUnitCount ?? 0;
      gatesPending += space.GatedUnitCount ?? 0;
      upgrades += space.UpgradableUnitCount ?? 0;

      const spaceId = space.Space?.SpaceID;
      if (
        outstandingChangeOrderBaseSpaceIds &&
        spaceId !== undefined &&
        outstandingChangeOrderBaseSpaceIds.has(spaceId)
      ) {
        hasOutstandingChangeOrder = true;
      }
    }

    const spaceIds = new Set(compSpaces.flatMap((s) => (s.Space?.SpaceID ? [s.Space.SpaceID] : [])));
    const spaceSlugs = new Set(compSpaces.flatMap((s) => (s.Space?.Slug ? [s.Space.Slug] : [])));
    const componentChangeSets: OverviewChangeSet[] = [];
    for (const cs of openChangeSets?.values() ?? []) {
      if (![...cs.spaceIds].some((id) => spaceIds.has(id))) continue;
      componentChangeSets.push({
        label: cs.spaceSlug && !spaceSlugs.has(cs.spaceSlug) ? `${cs.spaceSlug}/${cs.slug}` : cs.slug,
        slug: cs.slug,
        spaceSlug: cs.spaceSlug,
      });
    }
    componentChangeSets.sort((a, b) => a.label.localeCompare(b.label));

    rows.push({
      componentName,
      owner,
      totalSpaces,
      unapplied,
      gatesPending,
      upgrades,
      hasOutstandingChangeOrder,
      openChangeSets: componentChangeSets,
    });
  }

  // 3. Build org-level summary
  const org: OrgKpiSummary = {
    totalComponents: rows.length,
    unapplied: rows.reduce((s, r) => s + r.unapplied, 0),
    gatesPending: rows.reduce((s, r) => s + r.gatesPending, 0),
    upgrades: rows.reduce((s, r) => s + r.upgrades, 0),
    outstandingChangeOrders: rows.reduce((s, r) => s + (r.hasOutstandingChangeOrder ? 1 : 0), 0),
    openChangeSetComponents: rows.reduce((s, r) => s + (r.openChangeSets.length > 0 ? 1 : 0), 0),
  };

  return { rows, org };
}
