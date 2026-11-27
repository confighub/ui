// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import { memo, useEffect, useMemo, useRef } from 'react';
import { useGetUnitBlameQuery } from '@confighub/rtk-query';

import type { MergedUnit } from '../componentTypes';
import { joinBlame } from './sheetOrigin';
import { unreleasedKeysOf } from './unreleasedKeys';

/**
 * Reads a Unit's Unreleased fields for the pane, which has no sheet for a folded Unit. It draws
 * nothing. It shares the sheet's Blame read (the same query), so it adds no request for an open
 * Unit.
 */
export const UnreleasedKeysProbe = memo(function UnreleasedKeysProbe({
  unit,
  onKeys,
}: {
  unit: MergedUnit;
  onKeys: (unitId: string, keys: ReadonlySet<string> | undefined) => void;
}) {
  const blame = useGetUnitBlameQuery({ spaceId: unit.spaceId, unitId: unit.unitId });
  const keys = useMemo(
    () => (blame.data ? unreleasedKeysOf(unit, joinBlame(blame.data, unit.data, unit.unitId)) : undefined),
    [blame.data, unit],
  );
  const onKeysRef = useRef(onKeys);
  onKeysRef.current = onKeys;
  useEffect(() => {
    onKeysRef.current(unit.unitId, keys);
  }, [unit.unitId, keys]);
  useEffect(() => {
    const id = unit.unitId;
    return () => onKeysRef.current(id, undefined);
  }, [unit.unitId]);
  return null;
});
