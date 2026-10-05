// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * What a wave's bulk Upgrade and Release do once the user confirmed them. The
 * hook gives these the API calls and the page callbacks, so the rules about
 * partial failure can be tested without a React tree or a server.
 */
import type { WaveUpgradePlan } from './waveActions';

type ErrorEntry = { title: string; detail: string; timestamp: Date };

/**
 * One item of a bulk PATCH answer. A mixed result is HTTP 207 with one item
 * per Unit, and RTK Query counts 207 as success, so each item carries its own
 * `Error`.
 */
export interface BulkPatchItem {
  Unit?: { UnitID?: string; SpaceID?: string };
  Error?: { Message?: string };
  Message?: string;
}

export interface WaveUpgradeDeps {
  /** One bulk PATCH with `upgrade: true`; rejects when the whole request failed. */
  bulkPatch: (where: string) => Promise<readonly BulkPatchItem[] | undefined>;
  errorMessage: (err: unknown) => string;
  /** unitId -> the Space and the head Revision before the commit. */
  settleTargets: Map<string, { spaceId: string; preCommitHead: number }>;
  /** unitId -> its Space and head Revision, for the Units of the plan. */
  unitInfo: (unitId: string) => { spaceId?: string; headRevisionNum?: number } | undefined;
  setUpgrading: (update: (prev: Set<string>) => Set<string>) => void;
  setErrors: (spaceIds: Iterable<string>, entry: ErrorEntry) => void;
  onLanded: (spaceIds: ReadonlySet<string>) => void;
  flashSuccess: (spaceIds: Set<string>, msg: string) => void;
}

/**
 * The Units of one answer that did not go through, by Unit id. An item with
 * an `Error` but no Unit cannot be placed, so it fails the whole request:
 * the caller keeps those Units for another try rather than call them done.
 */
export function failedItems(
  items: readonly BulkPatchItem[] | undefined,
  requestUnitIds: readonly string[],
  errorMessage: (item: BulkPatchItem) => string = itemMessage,
): Map<string, string> {
  const failed = new Map<string, string>();
  for (const item of items ?? []) {
    if (!item.Error) continue;
    const id = item.Unit?.UnitID;
    if (id) failed.set(id, errorMessage(item));
    else for (const unitId of requestUnitIds) failed.set(unitId, errorMessage(item));
  }
  return failed;
}

export function itemMessage(item: BulkPatchItem): string {
  return item.Error?.Message || item.Message || 'Unknown error';
}

export async function runWaveUpgrade(
  plan: WaveUpgradePlan,
  deps: WaveUpgradeDeps,
): Promise<void> {
  const spaceOf = new Map<string, string>();
  for (const unitId of plan.unitIds) {
    const info = deps.unitInfo(unitId);
    if (!info?.spaceId) continue;
    spaceOf.set(unitId, info.spaceId);
    deps.settleTargets.set(unitId, {
      spaceId: info.spaceId,
      preCommitHead: info.headRevisionNum ?? 0,
    });
  }
  deps.setUpgrading((prev) => new Set([...prev, ...plan.spaceIds]));

  // Space -> why its Units did not upgrade.
  const failedBySpace = new Map<string, string[]>();
  const stopSpaces = (unitIds: readonly string[]) => {
    for (const unitId of unitIds) deps.settleTargets.delete(unitId);
    // A Space whose other Units went through is still settling; only Spaces
    // with nothing left to settle stop.
    const stillPending = new Set(Array.from(deps.settleTargets.values(), (t) => t.spaceId));
    const stopped = new Set<string>();
    for (const unitId of unitIds) {
      const spaceId = spaceOf.get(unitId);
      if (spaceId && !stillPending.has(spaceId)) stopped.add(spaceId);
    }
    if (stopped.size === 0) return;
    deps.setUpgrading((prev) => {
      const next = new Set(prev);
      let changed = false;
      for (const spaceId of stopped) if (next.delete(spaceId)) changed = true;
      return changed ? next : prev;
    });
  };
  const fail = (unitId: string, detail: string) => {
    const spaceId = spaceOf.get(unitId);
    if (!spaceId) return;
    const details = failedBySpace.get(spaceId) ?? [];
    if (!details.includes(detail)) details.push(detail);
    failedBySpace.set(spaceId, details);
  };

  // In sequence, not in parallel: each request already upgrades up to a
  // thousand Units, and parallel bulk writes to one Component would
  // compete for the same server resources.
  for (let i = 0; i < plan.wheres.length; i++) {
    const chunk = plan.unitIdChunks[i];
    try {
      const items = await deps.bulkPatch(plan.wheres[i]);
      // A request that went through can still hold failed Units; the others
      // in it landed, so the next request still runs.
      const failed = failedItems(items, chunk);
      for (const [unitId, detail] of failed) fail(unitId, detail);
      stopSpaces([...failed.keys()]);
    } catch (err: unknown) {
      // The whole request failed, so this chunk and every later one is left.
      const left = plan.unitIdChunks.slice(i).flat();
      const detail = deps.errorMessage(err);
      for (const unitId of left) fail(unitId, detail);
      stopSpaces(left);
      break;
    }
  }

  for (const [spaceId, details] of failedBySpace) {
    deps.setErrors([spaceId], {
      title: 'Upgrade failed',
      detail: details.join('; '),
      timestamp: new Date(),
    });
  }
  const landed = new Set(plan.spaceIds.filter((id) => !failedBySpace.has(id)));
  if (landed.size > 0) {
    deps.onLanded(landed);
    deps.flashSuccess(landed, 'Upgraded');
  }
}

export interface WaveReleaseDeps {
  /**
   * The unnamed release of the side pane; resolves with its number, or with a
   * Message when the Space is unchanged since its latest Release.
   */
  publish: (
    spaceId: string,
  ) => Promise<{ Release?: { ReleaseNum?: number }; Message?: string }>;
  /** What a failed publish tells the user, given the thrown error. */
  errorDetail: (err: unknown) => string;
  setReleasing: (update: (prev: ReadonlySet<string>) => ReadonlySet<string>) => void;
  setErrors: (spaceIds: Iterable<string>, entry: ErrorEntry) => void;
  flashSuccess: (spaceIds: Set<string>, msg: string) => void;
  /**
   * Claims a Space for this run; false when another run holds it, so the
   * same Space is never published twice at once.
   */
  claim: (spaceId: string) => boolean;
  release: (spaceId: string) => void;
}

export async function runWaveRelease(
  spaceIds: readonly string[],
  deps: WaveReleaseDeps,
): Promise<void> {
  const mine = spaceIds.filter((id) => deps.claim(id));
  if (mine.length === 0) return;
  // Added to, not replaced: another wave's release may still be running.
  deps.setReleasing((prev) => new Set([...prev, ...mine]));
  // One Space at a time: a publish bundles every Unit of its Space, and
  // one failure (a gate) must not stop the others.
  for (const spaceId of mine) {
    try {
      const { Release: release, Message: message } = await deps.publish(spaceId);
      deps.flashSuccess(
        new Set([spaceId]),
        message ? 'No change' : `Released rel-${release?.ReleaseNum ?? '?'}`,
      );
    } catch (err: unknown) {
      deps.setErrors([spaceId], {
        title: 'Release failed',
        detail: deps.errorDetail(err),
        timestamp: new Date(),
      });
    } finally {
      deps.release(spaceId);
      deps.setReleasing((prev) => {
        if (!prev.has(spaceId)) return prev;
        const next = new Set(prev);
        next.delete(spaceId);
        return next;
      });
    }
  }
}
