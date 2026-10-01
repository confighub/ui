// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import type { ExtendedSpaceRead, ExtendedUnitRead } from '@confighub/rtk-query';

import type { ComponentDeployment, DeploymentTarget, Stage } from './componentTypes';
import { parseLiveStatus, resolveLiveStatusProvider } from './liveStatus';

// ============================================================================
// LABEL CONSTANTS
// ============================================================================

export const LABEL_COMPONENT = 'Component';
export const LABEL_OWNER = 'Owner';
/**
 * Space-level label whose value names the card within its Component context
 * (e.g. `'base'`, `'nonprod'`, `'prod'`). Card title falls back to the Space
 * slug when this label is unset.
 */
export const LABEL_VARIANT = 'Variant';
/**
 * Special label keys the Components grouping catalog gives their own icon
 * (`componentGroupFields.ts`'s `SPECIAL_LABEL_ICONS`) instead of the generic
 * Labels icon. Exact-case, matching `LABEL_OWNER` above.
 */
export const LABEL_STAGE = 'Stage';
export const LABEL_REGION = 'Region';
export const LABEL_DEPARTMENT = 'Department';

// ============================================================================
// HELPERS
// ============================================================================

/** Build the arrow key used to track active upgrade edges between deployments. */
export const arrowKey = (parentId: string, childId: string) => `${parentId}→${childId}`;

/** Build a Map<deploymentId, ComponentDeployment> from an array. */
export function buildDeploymentMap(
  deployments: ComponentDeployment[],
): Map<string, ComponentDeployment> {
  const m = new Map<string, ComponentDeployment>();
  for (const d of deployments) m.set(d.deploymentId, d);
  return m;
}

// ============================================================================
// COMPONENT DATA BUILDER
// ============================================================================

/**
 * Resolve a Space's bound Target IDs into renderable {targetId, name, url}
 * records, sorted by display name.
 *
 * `url` comes from each Target's `URL-TargetUI` annotation; `{slug}` in the
 * annotation value is substituted with the Space slug, so a Target annotation
 * `URL-TargetUI = https://argocd.example.com/applications/argocd/{slug}`
 * resolves to a per-Space URL.
 *
 * Everything here is keyed by TargetID rather than by display name: several
 * Targets routinely share one `Labels.DisplayName` (e.g. "US - Dev"), so a
 * name-keyed map would collapse them and a name-keyed React list would emit
 * duplicate keys.
 */
function buildDeploymentTargets(
  targetIds: string[],
  targetNameById: Map<string, string>,
  targetAnnotationsById: Map<string, Record<string, string>>,
  slug: string,
): DeploymentTarget[] {
  return targetIds
    .map((tid) => {
      const template = targetAnnotationsById.get(tid)?.['URL-TargetUI'];
      return {
        targetId: tid,
        name: targetNameById.get(tid) ?? tid,
        url: template ? template.replace(/\{slug\}/g, slug) : undefined,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name) || a.targetId.localeCompare(b.targetId));
}

/**
 * Build component deployments and stage data from spaces and units. Each
 * matching Space becomes one deployment node; parent/child relationships are
 * derived from UpstreamUnitID linking units across Spaces.
 *
 * Identity is the SpaceID, so multiple Spaces deploying to the same Target
 * each get their own node, and Spaces with no Target (e.g. bases) still appear.
 */
export function buildComponentData(
  spaces: ExtendedSpaceRead[],
  allUnits: ExtendedUnitRead[],
  unitById: Map<string, ExtendedUnitRead>,
  targetNameById: Map<string, string>,
  targetAnnotationsById?: Map<string, Record<string, string>>,
): { deployments: ComponentDeployment[]; stages: Stage[] } {
  const unitToSpaceId = new Map<string, string>();
  for (const u of allUnits) {
    const uid = u.Unit?.UnitID;
    const sid = u.Unit?.SpaceID;
    if (uid && sid) unitToSpaceId.set(uid, sid);
  }

  const parentOf = new Map<string, string>();
  const edgeSet = new Set<string>();
  for (const u of allUnits) {
    const upstreamUnitId = u.Unit?.UpstreamUnitID;
    if (!upstreamUnitId) continue;
    const thisSpaceId = u.Unit?.SpaceID;
    const upstreamSpaceId = unitToSpaceId.get(upstreamUnitId);
    if (!thisSpaceId || !upstreamSpaceId || thisSpaceId === upstreamSpaceId) continue;
    const edgeKey = `${upstreamSpaceId}->${thisSpaceId}`;
    if (edgeSet.has(edgeKey)) continue;
    edgeSet.add(edgeKey);
    parentOf.set(thisSpaceId, upstreamSpaceId);
  }

  function getDepth(spaceId: string, visited: Set<string> = new Set()): number {
    if (visited.has(spaceId)) return 0;
    visited.add(spaceId);
    const parent = parentOf.get(spaceId);
    if (!parent) return 0;
    return getDepth(parent, visited) + 1;
  }

  const upgradeableBySpace = new Map<string, number>();
  // Largest revisions-behind gap and newest upstream-change timestamp across a
  // Space's stale units, for the "Stale · N behind · Xago" chip detail.
  const staleBehindBySpace = new Map<string, number>();
  const staleChangedAtBySpace = new Map<string, string>();
  const unappliedBySpace = new Map<string, number>();
  const unitCountBySpace = new Map<string, number>();
  const targetIdsBySpace = new Map<string, Set<string>>();
  for (const u of allUnits) {
    const sid = u.Unit?.SpaceID;
    if (!sid) continue;
    unitCountBySpace.set(sid, (unitCountBySpace.get(sid) ?? 0) + 1);

    const tid = u.Unit?.TargetID;
    if (tid) {
      const set = targetIdsBySpace.get(sid) ?? new Set<string>();
      set.add(tid);
      targetIdsBySpace.set(sid, set);
    }

    const upstreamUnitId = u.Unit?.UpstreamUnitID;
    if (upstreamUnitId) {
      const upstream = unitById.get(upstreamUnitId);
      if (upstream) {
        const upstreamRevNum = u.Unit?.UpstreamRevisionNum ?? 0;
        const upstreamHead = upstream.Unit?.HeadRevisionNum ?? 0;
        if (upstreamRevNum < upstreamHead) {
          upgradeableBySpace.set(sid, (upgradeableBySpace.get(sid) ?? 0) + 1);

          const behind = upstreamHead - upstreamRevNum;
          if (behind > (staleBehindBySpace.get(sid) ?? 0)) {
            staleBehindBySpace.set(sid, behind);
          }
          // Newest upstream change the Space is behind on (upstream head revision).
          const changedAt = upstream.HeadRevision?.CreatedAt;
          if (changedAt) {
            const prev = staleChangedAtBySpace.get(sid);
            if (!prev || new Date(changedAt) > new Date(prev)) {
              staleChangedAtBySpace.set(sid, changedAt);
            }
          }
        }
      }
    }

    const head = u.Unit?.HeadRevisionNum ?? 0;
    const applied = u.Unit?.LastReleasedRevisionNum ?? 0;
    if (head > 0 && applied < head) {
      unappliedBySpace.set(sid, (unappliedBySpace.get(sid) ?? 0) + 1);
    }
  }

  const deployments: ComponentDeployment[] = spaces
    .filter((s) => !!s.Space?.SpaceID)
    .map((s) => {
      const sid = s.Space!.SpaceID!;
      const slug = s.Space?.Slug ?? sid;
      const targetIds = Array.from(targetIdsBySpace.get(sid) ?? []);
      const targets = buildDeploymentTargets(
        targetIds,
        targetNameById,
        targetAnnotationsById ?? new Map(),
        slug,
      );
      const variant = s.Space?.Labels?.[LABEL_VARIANT];
      const isBase = targets.length === 0;
      const liveStatus = isBase ? undefined : (parseLiveStatus(s.Space?.Annotations) ?? undefined);
      return {
        deploymentId: sid,
        slug,
        displayName: variant?.trim() || slug,
        type: isBase ? 'Base' : 'Deployment',
        targets,
        releaseTargetId: s.Space?.ReleaseTargetID,
        releaseTargetName: s.Space?.ReleaseTargetID
          ? targetNameById.get(s.Space.ReleaseTargetID)
          : undefined,
        parentDeploymentId: parentOf.get(sid) ?? null,
        stage: getDepth(sid),
        upgradeableCount: upgradeableBySpace.get(sid) ?? 0,
        unappliedCount: unappliedBySpace.get(sid) ?? 0,
        unitCount: unitCountBySpace.get(sid) ?? 0,
        // A Base has no Target, so nothing is deployed from it and no live-infra
        // reporter (e.g. argobot) can be watching it. Forced here rather than left
        // to convention: nothing stops a stray/leftover `live-status` annotation
        // from persisting on a Space's annotations (e.g. a Space that lost its
        // last Target) — without this guard that would incorrectly paint a Base
        // card with Live/Synced tags it structurally can't back up.
        liveStatus,
        // Same reasoning as `liveStatus` above: a Base deploys nothing, so no
        // delivery system reports on it and it must not carry a brand mark.
        liveStatusProvider: isBase ? 'unknown' : resolveLiveStatusProvider(liveStatus),
        staleUpstreamChangedAt: staleChangedAtBySpace.get(sid),
        staleRevisionsBehind: staleBehindBySpace.get(sid),
      };
    });

  deployments.sort((a, b) => a.slug.localeCompare(b.slug));

  const stageMap = new Map<number, string[]>();
  for (const d of deployments) {
    const list = stageMap.get(d.stage) ?? [];
    list.push(d.deploymentId);
    stageMap.set(d.stage, list);
  }

  const stages: Stage[] = Array.from(stageMap.entries())
    .sort(([a], [b]) => a - b)
    .map(([depth, ids]) => ({
      label: `Stage ${depth + 1}`,
      depth,
      deploymentIds: ids,
    }));

  return { deployments, stages };
}
