// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import type { ComponentRead, ExtendedSpaceRead, ExtendedTargetRead } from '@confighub/rtk-query';

import { releaseTone, type RunningRelease, TONE_SEVERITY, type VitalTone, worseTone } from '../x/apps/liveStatus';

/**
 * The pure part of the Target Overview: one row per Component, one column per
 * Target, and in each cell the Component's Spaces on that Target, with the
 * Release each is running there and how many resources its Units hold for it.
 *
 * A Space is on a Target when the Target is its release Target, or when any of
 * its Units is assigned to it. The Release is the one the Space is running
 * (`runningReleases`): its latest published Release for its current release
 * Target, so a Space whose Units are on a Target it does not release to has
 * none there.
 */

/** A Target's Facts key for the version of the cluster it deploys to. */
export const KUBERNETES_VERSION_FACT = 'Cluster.KubernetesVersion';

export interface TargetColumn {
  targetId: string;
  slug: string;
  spaceSlug: string;
  /** The `Cluster.KubernetesVersion` fact, when the Target has one. */
  kubernetesVersion?: string;
}

/** One of a Component's Spaces on a Target. */
export interface MatrixDeployment {
  spaceId: string;
  spaceSlug: string;
  /** The Space's `Variant` label, when it has one. */
  variant?: string;
  /** The Release the Space is running on this Target; `null` when it has published none to it. */
  release: RunningRelease | null;
  /** The Release's tone (`releaseTone`); `null` when there is no Release. */
  tone: VitalTone | null;
  /** Resources of the Space's Units assigned to this Target. */
  resourceCount: number;
}

export interface MatrixCell {
  /** Worst first, then by Space. */
  deployments: MatrixDeployment[];
  /** The worst tone among the deployments' Releases; `null` when none has a Release. */
  tone: VitalTone | null;
  resourceCount: number;
}

export interface MatrixRow {
  componentId: string;
  componentName: string;
  /** Keyed by TargetID; a Target the Component is not on has no entry. */
  cells: Map<string, MatrixCell>;
}

export interface TargetMatrix {
  columns: TargetColumn[];
  rows: MatrixRow[];
}

/** The key `resourceCounts` is keyed by. */
export const spaceTargetKey = (spaceId: string, targetId: string): string => `${spaceId}/${targetId}`;

/** Count resources by Space and Target (`spaceTargetKey`), from `GET /resource` rows. */
export function countResources(
  resources: readonly { Resource?: { SpaceID?: string; TargetID?: string } }[],
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const entry of resources) {
    const spaceId = entry.Resource?.SpaceID;
    const targetId = entry.Resource?.TargetID;
    if (!spaceId || !targetId) continue;
    const key = spaceTargetKey(spaceId, targetId);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

/** Severity for sorting deployments worst first; a missing Release sorts after every reported one. */
const toneRank = (tone: VitalTone | null): number => (tone ? TONE_SEVERITY[tone] : -1);

/**
 * Build the matrix. Only Targets some Component's Space is on become columns,
 * sorted by their Space and then their slug, and only Components on some
 * Target become rows, sorted by name. A Target not among `targets` (one the
 * user cannot read, say) is left out.
 */
export function buildTargetMatrix(
  spaces: readonly ExtendedSpaceRead[],
  componentById: ReadonlyMap<string, ComponentRead>,
  targets: readonly ExtendedTargetRead[],
  runningReleaseBySpaceId: ReadonlyMap<string, RunningRelease>,
  resourceCounts: ReadonlyMap<string, number>,
): TargetMatrix {
  const targetById = new Map<string, TargetColumn>();
  for (const entry of targets) {
    const target = entry.Target;
    if (!target?.TargetID) continue;
    targetById.set(target.TargetID, {
      targetId: target.TargetID,
      slug: target.Slug ?? target.TargetID,
      spaceSlug: target.SpaceSlug ?? entry.Space?.Slug ?? '',
      kubernetesVersion: target.Facts?.[KUBERNETES_VERSION_FACT] || undefined,
    });
  }

  // The Targets each Space's Units are assigned to.
  const unitTargetIdsBySpaceId = new Map<string, Set<string>>();
  for (const key of resourceCounts.keys()) {
    const [spaceId, targetId] = key.split('/');
    const set = unitTargetIdsBySpaceId.get(spaceId);
    if (set) set.add(targetId);
    else unitTargetIdsBySpaceId.set(spaceId, new Set([targetId]));
  }

  const rowByComponentId = new Map<string, MatrixRow>();
  const usedTargetIds = new Set<string>();
  for (const entry of spaces) {
    const space = entry.Space;
    const spaceId = space?.SpaceID;
    const componentId = space?.ComponentID;
    const component = componentId ? componentById.get(componentId) : undefined;
    if (!space || !spaceId || !componentId || !component) continue;

    const targetIds = new Set(unitTargetIdsBySpaceId.get(spaceId));
    if (space.ReleaseTargetID) targetIds.add(space.ReleaseTargetID);
    for (const targetId of targetIds) {
      if (!targetById.has(targetId)) continue;
      const running = targetId === space.ReleaseTargetID ? runningReleaseBySpaceId.get(spaceId) : undefined;
      const deployment: MatrixDeployment = {
        spaceId,
        spaceSlug: space.Slug ?? spaceId,
        variant: space.Labels?.Variant || undefined,
        release: running ?? null,
        tone: running ? releaseTone(running.liveStatus) : null,
        resourceCount: resourceCounts.get(spaceTargetKey(spaceId, targetId)) ?? 0,
      };

      let row = rowByComponentId.get(componentId);
      if (!row) {
        row = { componentId, componentName: component.Slug ?? componentId, cells: new Map() };
        rowByComponentId.set(componentId, row);
      }
      const cell = row.cells.get(targetId);
      if (cell) {
        cell.deployments.push(deployment);
        cell.resourceCount += deployment.resourceCount;
        if (deployment.tone) cell.tone = cell.tone ? worseTone(cell.tone, deployment.tone) : deployment.tone;
      } else {
        row.cells.set(targetId, {
          deployments: [deployment],
          tone: deployment.tone,
          resourceCount: deployment.resourceCount,
        });
      }
      usedTargetIds.add(targetId);
    }
  }

  for (const row of rowByComponentId.values()) {
    for (const cell of row.cells.values()) {
      cell.deployments.sort((a, b) => toneRank(b.tone) - toneRank(a.tone) || a.spaceSlug.localeCompare(b.spaceSlug));
    }
  }

  const columns = [...usedTargetIds]
    .map((id) => targetById.get(id)!)
    .sort((a, b) => a.spaceSlug.localeCompare(b.spaceSlug) || a.slug.localeCompare(b.slug));
  const rows = [...rowByComponentId.values()].sort((a, b) => a.componentName.localeCompare(b.componentName));
  return { columns, rows };
}
