// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { useMemo } from 'react';

import { type UnitBlame, type UnitRead, useListUnitsQuery } from '@confighub/rtk-query';
import { skipToken } from '@reduxjs/toolkit/query';

import { useSearchGateBlameQuery } from './gateBlameApi';
import { type Gate, awaitingUnit, blockingFindingCount, buildGates } from './gateModel';
import { useListGateTriggersQuery } from './gateTriggersApi';

const AWAITING_POLL_MS = 1500;
const EMPTY_UNITS: UnitRead[] = [];

export interface ComponentGates {
  /** The Units or Triggers are still being read. Nothing is known yet: no count, no gates. */
  isLoading: boolean;
  /** The read of the Units or Triggers failed. Nothing is known: no count, never 0. */
  error?: unknown;
  units: UnitRead[];
  gates: Gate[];
  warnings: Gate[];
  /** A Unit of the Space whose Triggers are still running on a new Revision. */
  awaiting?: UnitRead;
  /** The Gates tab badge: blocking findings. Undefined when not known. */
  count?: number;
  /** Blame of the Units of the selected Space: the origin of each row. */
  blame?: UnitBlame[];
  isBlameLoading: boolean;
  /** The Blame read failed: an origin is not known, which is not "no record". */
  blameError: boolean;
  /** Blame of the gated, and of the warned, Units of the Component: the same finding elsewhere. */
  componentBlame: { errors?: UnitBlame[]; warnings?: UnitBlame[] };
  isComponentBlameLoading: boolean;
  refetch: () => void;
}

/**
 * The gates and warnings of one Space of a Component, with the Triggers behind them and the Blame
 * of every gated Unit of the Component. The tab badge, the summary and each gate's status all
 * count with `blockingFindingCount`.
 */
export const useComponentGates = (
  spaceId: string | undefined,
  componentSpaceIds: string[],
): ComponentGates => {
  const unitsQuery = useListUnitsQuery(spaceId ? { spaceId } : skipToken);
  const units = useMemo(
    () =>
      (unitsQuery.data ?? []).map((u) => u.Unit).filter((u): u is UnitRead => !!u) ??
      EMPTY_UNITS,
    [unitsQuery.data],
  );
  const awaiting = awaitingUnit(units);
  // While a Revision is being checked, read again until its Triggers have run. A write that
  // changes a Unit's data sets the awaiting/triggers gate in the same update as the new
  // Revision, so a read that sees the Revision also sees the gate, and polling starts.
  useListUnitsQuery(spaceId && awaiting ? { spaceId } : skipToken, {
    pollingInterval: AWAITING_POLL_MS,
  });

  const triggerIDs = useMemo(
    () =>
      [...new Set(units.flatMap((unit) => Object.values(unit.ValidationTriggerIDs ?? {})))]
        .filter(Boolean)
        .sort(),
    [units],
  );
  const triggersQuery = useListGateTriggersQuery(
    triggerIDs.length > 0 ? { triggerIds: triggerIDs } : skipToken,
  );

  const hasFindings = units.some(
    (unit) =>
      Object.keys(unit.ValidationErrors ?? {}).length > 0 ||
      Object.keys(unit.ValidationWarnings ?? {}).length > 0,
  );
  // The selected Space's Blame gives each row its origin; the Component's gives the same
  // finding on other Units. Two reads, so a row's origin does not wait for the whole Component.
  const spaceBlame = useSearchGateBlameQuery(
    hasFindings && spaceId ? { spaceIds: [spaceId], findings: 'both' } : skipToken,
  );
  const otherSpaces =
    componentSpaceIds.length > 0 ? componentSpaceIds : spaceId ? [spaceId] : [];
  const errorBlame = useSearchGateBlameQuery(
    hasFindings && otherSpaces.length > 0
      ? { spaceIds: otherSpaces, findings: 'errors' }
      : skipToken,
  );
  const warningBlame = useSearchGateBlameQuery(
    hasFindings && otherSpaces.length > 0
      ? { spaceIds: otherSpaces, findings: 'warnings' }
      : skipToken,
  );

  const triggers = useMemo(() => triggersQuery.data ?? [], [triggersQuery.data]);
  const { gates, warnings } = useMemo(() => buildGates(units, triggers), [units, triggers]);
  const componentBlame = useMemo(
    () => ({ errors: errorBlame.data, warnings: warningBlame.data }),
    [errorBlame.data, warningBlame.data],
  );

  const isLoading =
    !!spaceId && (unitsQuery.isLoading || (triggerIDs.length > 0 && triggersQuery.isLoading));
  const error = unitsQuery.error ?? triggersQuery.error;
  const known = !isLoading && !error && !!unitsQuery.data && !awaiting;
  return {
    isLoading,
    error,
    units,
    gates,
    warnings,
    awaiting,
    // A Space with only warnings shows no count: warnings never count, and 0 would read as "nothing".
    count:
      known && !(gates.length === 0 && warnings.length > 0)
        ? blockingFindingCount(gates)
        : undefined,
    blame: spaceBlame.data,
    isBlameLoading: hasFindings && spaceBlame.isLoading,
    blameError: hasFindings && !!spaceBlame.error,
    componentBlame,
    isComponentBlameLoading: hasFindings && (errorBlame.isLoading || warningBlame.isLoading),
    refetch: unitsQuery.refetch,
  };
};
