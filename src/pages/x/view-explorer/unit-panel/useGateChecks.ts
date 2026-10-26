// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import { useCallback, useMemo, useRef, useState } from 'react';

import { getApiErrorMessage } from '@/utility/error-functions';

import { useCheckUnitGateMutation } from '../queries/gateCheckApi';
import { type GateCheck, gateCheckOutcome, triggersToRun } from './gate-check';

/**
 * The gates of the open Unit checked again from its panel, and the way to
 * check them. A result belongs to the Unit and the head revision it was
 * checked on, so it is shown again on a return to the same revision, and not
 * on a later one, whose config it did not check.
 */

export interface GateCheckTarget {
  spaceId: string;
  unitId: string;
  head: number;
  toolchainType: string;
  /** The failing gates. */
  gates: readonly string[];
  triggerIds: Readonly<Record<string, string>> | undefined;
}

const keyOf = (unitId: string, head: number, gate: string) => `${unitId}:${head}:${gate}`;

export function useGateChecks(target: GateCheckTarget | null): {
  checks: Readonly<Record<string, GateCheck>>;
  /** Check one gate, or every failing gate that has a Trigger. */
  check: (gate?: string) => void;
} {
  const [results, setResults] = useState<Readonly<Record<string, GateCheck>>>({});
  const [checkUnitGate] = useCheckUnitGateMutation();
  // The Triggers in flight, by Unit, revision and Trigger: a second click before the next render sends nothing.
  const inFlight = useRef(new Set<string>());

  const checks = useMemo(() => {
    const shown: Record<string, GateCheck> = {};
    if (!target) return shown;
    for (const gate of target.gates) {
      const result = results[keyOf(target.unitId, target.head, gate)];
      if (result) shown[gate] = result;
    }
    return shown;
  }, [target, results]);

  const check = useCallback(
    (gate?: string) => {
      if (!target) return;
      const { spaceId, unitId, head, toolchainType } = target;
      const wanted = (gate ? [gate] : target.gates).filter((g) => checks[g]?.state !== 'running');
      const set = (gates: readonly string[], result: (gate: string) => GateCheck) =>
        setResults((prev) => {
          const next = { ...prev };
          for (const g of gates) next[keyOf(unitId, head, g)] = result(g);
          return next;
        });
      for (const [triggerId, gates] of triggersToRun(wanted, target.triggerIds)) {
        const flight = keyOf(unitId, head, triggerId);
        if (inFlight.current.has(flight)) continue;
        inFlight.current.add(flight);
        set(gates, () => ({ state: 'running' }));
        checkUnitGate({ spaceId, unitId, toolchainType, triggerId })
          .unwrap()
          .then(
            (responses) => set(gates, (g) => gateCheckOutcome(responses, g)),
            (error: unknown) => set(gates, () => ({ state: 'error', message: getApiErrorMessage(error, 'unknown error') })),
          )
          .finally(() => inFlight.current.delete(flight));
      }
    },
    [target, checks, checkUnitGate],
  );

  return { checks, check };
}
