// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import { ResourceRow } from './hooks/useResourceRows';

/** Sentinel cluster id for resources whose Unit has no Target. */
export const NO_TARGET_ID = '__no_target__';
/** Display label for the no-target bucket. */
export const NO_TARGET_LABEL = '(no target)';
/** Row bucket label for resources missing a ResourceType. */
export const UNKNOWN_TYPE_LABEL = '(unknown)';

/**
 * One cluster (Target) column in the summary.
 *
 * `id` is the globally-unique TargetID and is what counts are keyed on —
 * TargetSlug is only unique within a Space, so two distinct Targets in
 * different Spaces can share a slug and must remain separate columns. `label`
 * is the slug for display, disambiguated with a short id suffix when it would
 * otherwise collide with another Target's slug.
 */
export interface SummaryCluster {
  id: string;
  label: string;
  /** Raw target slug before any collision disambiguation, for tooltips. */
  slug: string;
}

/**
 * A resource-type × cluster (Target) pivot computed over a set of rows.
 *
 * Rows of the pivot are the full ResourceType (apiVersion/kind, e.g.
 * `apps/v1/Deployment`); columns are the originating Unit's Target. Both axes
 * are derived purely from the rows already loaded client-side, so building a
 * summary makes no API calls.
 */
export interface ResourceSummary {
  /** Resource types in display (row) order: alphabetical. */
  resourceTypes: string[];
  /** Clusters in display (column) order: alphabetical by label, NO_TARGET last. */
  clusters: SummaryCluster[];
  /** counts.get(resourceType)?.get(clusterId) → cell count (absent = 0). */
  counts: Map<string, Map<string, number>>;
  /** Per-resource-type total across all clusters (the row-total column). */
  rowTotals: Map<string, number>;
  /** Per-cluster total across all resource types, keyed by cluster id. */
  colTotals: Map<string, number>;
  /** Total resource count across the whole pivot. */
  grandTotal: number;
  /** Largest single cell value, for color-intensity scaling (0 if empty). */
  maxCell: number;
}

/** The cluster id a row belongs to (globally-unique TargetID, or sentinel). */
function clusterIdOf(row: ResourceRow): string {
  return row.TargetID || NO_TARGET_ID;
}

/** The resource-type bucket a row belongs to (full apiVersion/kind). */
function typeOf(row: ResourceRow): string {
  return row.ResourceType || UNKNOWN_TYPE_LABEL;
}

/**
 * Order clusters alphabetically by label, sinking "(no target)" to the end
 * where it reads as a footnote rather than competing with real clusters.
 */
function compareClusters(a: SummaryCluster, b: SummaryCluster): number {
  if (a.id === NO_TARGET_ID) return b.id === NO_TARGET_ID ? 0 : 1;
  if (b.id === NO_TARGET_ID) return -1;
  const byLabel = a.slug.localeCompare(b.slug);
  return byLabel !== 0 ? byLabel : a.id.localeCompare(b.id);
}

/**
 * Build display labels for clusters, disambiguating slug collisions. TargetSlug
 * is only unique within a Space and a Target can be referenced by Units in
 * other Spaces, so two distinct Targets can surface the same slug here. The
 * TargetID is the only globally-unique handle, so colliding slugs get a short
 * id suffix to keep the columns tellable apart; unique slugs are shown as-is.
 */
function buildClusterLabels(idToSlug: Map<string, string>): Map<string, string> {
  const slugCounts = new Map<string, number>();
  for (const slug of idToSlug.values()) {
    slugCounts.set(slug, (slugCounts.get(slug) ?? 0) + 1);
  }
  const labels = new Map<string, string>();
  for (const [id, slug] of idToSlug) {
    if (id === NO_TARGET_ID) {
      labels.set(id, NO_TARGET_LABEL);
    } else if ((slugCounts.get(slug) ?? 0) > 1) {
      labels.set(id, `${slug} (${id.slice(0, 8)})`);
    } else {
      labels.set(id, slug);
    }
  }
  return labels;
}

/**
 * Aggregate rows into a resource-type × cluster pivot with marginal totals.
 * Single pass to fill the count maps, then a sort of each axis. Intended to be
 * memoized by the caller on the row set.
 */
export function buildResourceSummary(rows: ResourceRow[]): ResourceSummary {
  const counts = new Map<string, Map<string, number>>();
  const rowTotals = new Map<string, number>();
  const colTotals = new Map<string, number>();
  const typeSet = new Set<string>();
  const idToSlug = new Map<string, string>();
  let maxCell = 0;

  for (const row of rows) {
    const type = typeOf(row);
    const clusterId = clusterIdOf(row);
    typeSet.add(type);
    if (!idToSlug.has(clusterId)) {
      idToSlug.set(clusterId, clusterId === NO_TARGET_ID ? NO_TARGET_LABEL : row.TargetSlug || clusterId);
    }

    let byCluster = counts.get(type);
    if (!byCluster) {
      byCluster = new Map<string, number>();
      counts.set(type, byCluster);
    }
    const cell = (byCluster.get(clusterId) ?? 0) + 1;
    byCluster.set(clusterId, cell);
    if (cell > maxCell) maxCell = cell;

    rowTotals.set(type, (rowTotals.get(type) ?? 0) + 1);
    colTotals.set(clusterId, (colTotals.get(clusterId) ?? 0) + 1);
  }

  const labels = buildClusterLabels(idToSlug);
  const clusters: SummaryCluster[] = Array.from(idToSlug.entries())
    .map(([id, slug]) => ({ id, slug, label: labels.get(id) ?? slug }))
    .sort(compareClusters);

  return {
    resourceTypes: Array.from(typeSet).sort((a, b) => a.localeCompare(b)),
    clusters,
    counts,
    rowTotals,
    colTotals,
    grandTotal: rows.length,
    maxCell,
  };
}

/** Read a single cell count (0 when the type/cluster pair has no resources). */
export function cellCount(
  summary: ResourceSummary,
  resourceType: string,
  clusterId: string,
): number {
  return summary.counts.get(resourceType)?.get(clusterId) ?? 0;
}
