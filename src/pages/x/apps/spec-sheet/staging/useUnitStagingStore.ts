// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
// One staging store per Unit, held by the side pane above every field view, so a scope switch
// or a view that remounts loses no staged edit. The pane drops all of
// it on a node switch; a commit or Discard drops one Unit's.
import { useCallback, useMemo, useState } from 'react';

import {
  EMPTY_STAGING,
  type StagingAction,
  type StagingState,
  isEmptyStaging,
  stagingReducer,
} from './stagingReducer';

export interface UnitStagingStore {
  stateOf: (unitId: string) => StagingState;
  dispatch: (unitId: string, action: StagingAction) => void;
  /** Forget every Unit (a node switch). */
  reset: () => void;
  /** Unit ids with anything staged. */
  unitIds: string[];
}

/**
 * The store after one action on one Unit. A Unit with nothing staged has no entry, so `unitIds`
 * (which the leave guard reads) holds only Units with something staged.
 */
export function nextStagingMap(
  prev: ReadonlyMap<string, StagingState>,
  unitId: string,
  action: StagingAction,
): ReadonlyMap<string, StagingState> {
  const current = prev.get(unitId) ?? EMPTY_STAGING;
  const next = stagingReducer(current, action);
  if (next === current) return prev;
  const map = new Map(prev);
  if (isEmptyStaging(next)) map.delete(unitId);
  else map.set(unitId, next);
  return map;
}

export function useUnitStagingStore(): UnitStagingStore {
  const [byUnit, setByUnit] = useState<ReadonlyMap<string, StagingState>>(new Map());

  const dispatch = useCallback((unitId: string, action: StagingAction) => {
    setByUnit((prev) => nextStagingMap(prev, unitId, action));
  }, []);

  const reset = useCallback(
    () => setByUnit((prev) => (prev.size === 0 ? prev : new Map())),
    [],
  );
  const stateOf = useCallback(
    (unitId: string) => byUnit.get(unitId) ?? EMPTY_STAGING,
    [byUnit],
  );

  return useMemo(
    () => ({ stateOf, dispatch, reset, unitIds: [...byUnit.keys()] }),
    [stateOf, dispatch, reset, byUnit],
  );
}
