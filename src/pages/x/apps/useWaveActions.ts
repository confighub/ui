// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * The bulk action of a wave on a folded Component graph ("Stale · 55" ->
 * "Upgrade 55"). One click there asks for confirmation and then acts on
 * every Deployment of the wave, with the same per-Deployment plumbing the
 * side pane uses for one: `upgradingDeploymentIds` and the settle targets
 * for an Upgrade, the success flash and the error map for the result.
 */
import { type MutableRefObject, useCallback, useMemo, useRef, useState } from 'react';

import { getApiErrorMessage } from '@/utility/error-functions';
import {
  type ExtendedUnitRead,
  useBulkPatchUnitsMutation,
  usePublishReleaseMutation,
} from '@confighub/rtk-query';
import type { FetchBaseQueryError } from '@reduxjs/toolkit/query';

import type { ComponentDeployment } from './componentTypes';
import {
  type WaveActionRequest,
  type WaveUpgradePlan,
  firstGatedMember,
  planWaveRelease,
  planWaveUpgrade,
  waveKey,
} from './flow-graph/fold/waveActions';
import { runWaveRelease, runWaveUpgrade } from './flow-graph/fold/waveRuns';

type ErrorEntry = { title: string; detail: string; timestamp: Date };

/** A wave action waiting for the user to confirm it. */
export type PendingWaveAction =
  | {
      kind: 'upgrade';
      /** `waveKey` of the wave; the run is refused while one for it is in flight. */
      key: string;
      baseName: string;
      /** Stale members of the wave, as its chip counts them. */
      waveCount: number;
      plan: WaveUpgradePlan;
    }
  | {
      kind: 'release';
      key: string;
      baseName: string;
      /** Members with Unreleased changes, as the wave's chip counts them. */
      waveCount: number;
      spaceIds: string[];
    };

interface UseWaveActionsInput {
  deployments: readonly ComponentDeployment[];
  allUnits: readonly ExtendedUnitRead[];
  unitById: ReadonlyMap<string, ExtendedUnitRead>;
  setUpgradingDeploymentIds: (update: (prev: Set<string>) => Set<string>) => void;
  /** unitId -> the Space and the head Revision before the commit; see AppComponentView. */
  upgradeSettleTargetsRef: MutableRefObject<
    Map<string, { spaceId: string; preCommitHead: number }>
  >;
  flashSuccess: (deploymentIds: Set<string>, msg: string) => void;
  setErrorsForDeployments: (deploymentIds: Iterable<string>, entry: ErrorEntry) => void;
  /** After an Upgrade lands: clear old errors and cached merge previews of these Spaces. */
  onUpgradeLanded: (spaceIds: ReadonlySet<string>) => void;
  onOpenTab: (deploymentId: string, tab: 'config' | 'releases') => void;
}

export interface WaveActions {
  onWaveAction: (request: WaveActionRequest) => void;
  pending: PendingWaveAction | null;
  confirm: () => void;
  cancel: () => void;
  /** Spaces a wave release is publishing now, for the node ripple. */
  releasingIds: ReadonlySet<string>;
  /** `waveKey`s of the waves whose bulk action is running. */
  runningWaveKeys: ReadonlySet<string>;
}

const NO_IDS: ReadonlySet<string> = new Set();

export function useWaveActions({
  deployments,
  allUnits,
  unitById,
  setUpgradingDeploymentIds,
  upgradeSettleTargetsRef,
  flashSuccess,
  setErrorsForDeployments,
  onUpgradeLanded,
  onOpenTab,
}: UseWaveActionsInput): WaveActions {
  const [bulkPatch] = useBulkPatchUnitsMutation();
  const [publishRelease] = usePublishReleaseMutation();
  const [pending, setPending] = useState<PendingWaveAction | null>(null);
  const [releasingIds, setReleasingIds] = useState<ReadonlySet<string>>(NO_IDS);
  // State draws the disabled button; the ref refuses a second run at once,
  // before that state has rendered.
  const [runningWaveKeys, setRunningWaveKeys] = useState<ReadonlySet<string>>(NO_IDS);
  const runningRef = useRef(new Set<string>());
  const setRunning = useCallback((key: string, running: boolean) => {
    if (running) runningRef.current.add(key);
    else runningRef.current.delete(key);
    setRunningWaveKeys(runningRef.current.size === 0 ? NO_IDS : new Set(runningRef.current));
  }, []);

  const deploymentsById = useMemo(
    () => new Map(deployments.map((d) => [d.deploymentId, d])),
    [deployments],
  );

  const onWaveAction = useCallback(
    ({ baseId, wave, reveal }: WaveActionRequest) => {
      const baseName = deploymentsById.get(baseId)?.displayName ?? baseId;
      const key = waveKey(baseId, wave.condition);
      if (runningRef.current.has(key)) return;
      switch (wave.condition) {
        case 'stale':
          setPending({
            kind: 'upgrade',
            key,
            baseName,
            waveCount: wave.count,
            plan: planWaveUpgrade(wave.memberIds, allUnits, unitById),
          });
          return;
        case 'unreleased':
          setPending({
            kind: 'release',
            key,
            baseName,
            waveCount: wave.count,
            spaceIds: planWaveRelease(wave.memberIds, deploymentsById),
          });
          return;
        case 'gated': {
          // Gates are read one Deployment at a time, so this opens the first
          // one on its Releases tab, where its gates are listed.
          const id = firstGatedMember(wave, deploymentsById);
          if (!id) return;
          reveal(id, { openedBy: 'you', select: false });
          onOpenTab(id, 'releases');
          return;
        }
      }
    },
    [allUnits, unitById, deploymentsById, onOpenTab],
  );

  const runUpgrade = useCallback(
    (plan: WaveUpgradePlan) =>
      runWaveUpgrade(plan, {
        bulkPatch: (where) =>
          bulkPatch({
            where,
            upgrade: true,
            // @ts-expect-error RTK Query merge-patch+json content type requires pre-stringified body
            body: JSON.stringify({}),
          }).unwrap(),
        errorMessage: getApiErrorMessage,
        settleTargets: upgradeSettleTargetsRef.current,
        unitInfo: (unitId) => {
          const unit = unitById.get(unitId)?.Unit;
          return { spaceId: unit?.SpaceID, headRevisionNum: unit?.HeadRevisionNum };
        },
        setUpgrading: setUpgradingDeploymentIds,
        setErrors: setErrorsForDeployments,
        onLanded: onUpgradeLanded,
        flashSuccess,
      }),
    [
      bulkPatch,
      unitById,
      upgradeSettleTargetsRef,
      setUpgradingDeploymentIds,
      setErrorsForDeployments,
      onUpgradeLanded,
      flashSuccess,
    ],
  );

  // Spaces a release is publishing now, so a second wave never publishes the
  // same Space while the first run still holds it.
  const releasingRef = useRef(new Set<string>());
  const runRelease = useCallback(
    (spaceIds: readonly string[]) =>
      runWaveRelease(spaceIds, {
        publish: (spaceId) =>
          // The unnamed release of the side pane: head Revisions, no Tag.
          publishRelease({ spaceId, releasePublishRequest: {} }).unwrap(),
        errorDetail: (err) =>
          (err as FetchBaseQueryError | undefined)?.status === 422
            ? 'Release blocked: outstanding release gates must be resolved first.'
            : getApiErrorMessage(err),
        setReleasing: (update) =>
          setReleasingIds((prev) => {
            const next = update(prev);
            return next.size === 0 ? NO_IDS : next;
          }),
        setErrors: setErrorsForDeployments,
        flashSuccess,
        claim: (id) => {
          if (releasingRef.current.has(id)) return false;
          releasingRef.current.add(id);
          return true;
        },
        release: (id) => releasingRef.current.delete(id),
      }),
    [publishRelease, flashSuccess, setErrorsForDeployments],
  );

  const cancel = useCallback(() => setPending(null), []);
  const confirm = useCallback(() => {
    const action = pending;
    setPending(null);
    if (!action || runningRef.current.has(action.key)) return;
    const run =
      action.kind === 'upgrade'
        ? action.plan.unitIds.length > 0 && runUpgrade(action.plan)
        : action.spaceIds.length > 0 && runRelease(action.spaceIds);
    if (!run) return;
    setRunning(action.key, true);
    void run.finally(() => setRunning(action.key, false));
  }, [pending, runUpgrade, runRelease, setRunning]);

  return { onWaveAction, pending, confirm, cancel, releasingIds, runningWaveKeys };
}
