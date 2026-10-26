// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import type { RowFacts } from './attention';

/**
 * The upgrade preview of the open Unit: the upgrade dry run, which writes
 * nothing, read through the same cached query the Components view uses. The
 * dry run covers every Unit of the Space with the same upstream, so the panel
 * picks this Unit's entry from the answer.
 */

/** What the preview dialog needs to ask for the dry run and to name it. */
export interface UpgradePreviewRequest {
  spaceId: string;
  unitId: string;
  slug: string;
  upstreamUnitId: string;
  /** The upstream revision the Unit merged last. */
  from: number;
  /** The upstream's head, which the upgrade takes. */
  to: number;
  /** "space/unit" of the upstream, when known. */
  upstream?: string;
}

/** The request for an upgradable Unit; null when there is no upgrade to preview. */
export function upgradePreviewRequest(facts: RowFacts): UpgradePreviewRequest | null {
  const head = facts.upstreamHead;
  if (!facts.upstreamUnitId || !facts.spaceId || !facts.unitId) return null;
  if (facts.upstreamRev <= 0 || head === undefined || facts.upstreamRev >= head) return null;
  return {
    spaceId: facts.spaceId,
    unitId: facts.unitId,
    slug: facts.slug,
    upstreamUnitId: facts.upstreamUnitId,
    from: facts.upstreamRev,
    to: head,
    upstream: [facts.upstreamSpaceSlug, facts.upstreamSlug].filter(Boolean).join('/') || undefined,
  };
}

/**
 * The query's arguments. `basis` is not sent: it keys the cached answer on the
 * revisions, so after an upgrade, or a new upstream revision, the preview asks
 * again instead of showing the old answer.
 */
export function upgradePreviewArgs(request: UpgradePreviewRequest) {
  return {
    spaceIds: [request.spaceId],
    upstreamUnitIds: [request.upstreamUnitId],
    include: 'Diff',
    basis: `${request.unitId}:${request.from}:${request.to}`,
  };
}

/** This Unit's entry in the dry run's answer, which covers its siblings too. */
export function previewEntry<E extends { Unit?: { UnitID?: string } }>(answer: readonly E[] | undefined, unitId: string): E | undefined {
  return answer?.find((e) => e.Unit?.UnitID === unitId);
}

/** Why "Upgrade…" cannot go on to the confirm yet; null when the dry run answered for this Unit without an error. */
export type UpgradeBlock = 'stale' | 'failed' | 'loading' | 'missing' | 'refused';

export function upgradeBlock(a: {
  /** The upstream has moved since the preview was asked for. */
  stale: boolean;
  /** The dry run's request failed. */
  failed: boolean;
  /** The dry run has answered. */
  answered: boolean;
  entry: { Error?: { Message?: string } | null } | undefined;
}): UpgradeBlock | null {
  if (a.stale) return 'stale';
  if (a.failed) return 'failed';
  if (!a.answered) return 'loading';
  if (!a.entry) return 'missing';
  if (a.entry.Error) return 'refused';
  return null;
}

/** The preview is of other revisions than the Unit and its upstream have now (or the Unit has nothing to upgrade any more). */
export function isStalePreview(previewed: UpgradePreviewRequest, now: UpgradePreviewRequest | null): boolean {
  return !now || now.from !== previewed.from || now.to !== previewed.to || now.upstreamUnitId !== previewed.upstreamUnitId;
}
