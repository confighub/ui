// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import { useCallback, useEffect, useState } from 'react';

import {
  useLazyListAllUnitsQuery,
  useLazyListSpacesQuery,
} from '@confighub/rtk-query';

/**
 * Fetches all distinct label keys across all units and all spaces. Returns
 * sorted label keys (without the "Labels." / "Space.Labels." prefix) so the
 * View Builder can offer both as group-by / column options.
 */
export function useLabelKeys() {
  const [triggerListUnits] = useLazyListAllUnitsQuery();
  const [triggerListSpaces] = useLazyListSpacesQuery();
  const [labelKeys, setLabelKeys] = useState<string[]>([]);
  const [spaceLabelKeys, setSpaceLabelKeys] = useState<string[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);

  const fetchLabelKeys = useCallback(async () => {
    if (isLoaded) return;
    try {
      const [unitsResult, spacesResult] = await Promise.all([
        triggerListUnits({ select: 'Labels' }),
        triggerListSpaces({ select: 'Labels' }),
      ]);
      const units = unitsResult.data ?? [];
      const spaces = spacesResult.data ?? [];
      const unitKeys = new Set<string>();
      for (const eu of units) {
        const labels = eu.Unit?.Labels ?? {};
        Object.keys(labels).forEach((k) => unitKeys.add(k));
      }
      const spaceKeys = new Set<string>();
      for (const es of spaces) {
        const labels = es.Space?.Labels ?? {};
        Object.keys(labels).forEach((k) => spaceKeys.add(k));
      }
      setLabelKeys(Array.from(unitKeys).sort());
      setSpaceLabelKeys(Array.from(spaceKeys).sort());
      setIsLoaded(true);
    } catch {
      // Keep empty on error
    }
  }, [triggerListUnits, triggerListSpaces, isLoaded]);

  useEffect(() => {
    fetchLabelKeys();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { labelKeys, spaceLabelKeys, isLoaded };
}
