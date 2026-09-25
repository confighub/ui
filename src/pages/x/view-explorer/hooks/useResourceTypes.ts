// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import { authFetch } from '@/auth/session';
import { useCallback, useEffect, useState } from 'react';

import { useLazyListAllUnitsQuery } from '@confighub/rtk-query';
import yaml from 'js-yaml';

/** Max units to sample for resource type extraction */
const SAMPLE_SIZE = 20;

/**
 * Fetches distinct resource types (apiVersion/kind) from unit config data.
 * Uses direct fetch for the data endpoint since it returns YAML, not JSON.
 */
export function useResourceTypes() {
  const [triggerListUnits] = useLazyListAllUnitsQuery();
  const [resourceTypes, setResourceTypes] = useState<string[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);

  const fetchResourceTypes = useCallback(async () => {
    if (isLoaded) return;
    try {
      const result = await triggerListUnits({});
      const units = result.data ?? [];
      const sample = units.slice(0, SAMPLE_SIZE);

      const types = new Set<string>();

      await Promise.all(
        sample.map(async (eu) => {
          const unitId = eu.Unit?.UnitID;
          const spaceId = eu.Unit?.SpaceID;
          if (!unitId || !spaceId) return;

          try {
            const resp = await authFetch(`/api/space/${spaceId}/unit/${unitId}/data`);
            if (!resp.ok) return;
            const raw = await resp.text();
            if (!raw) return;

            const docs = yaml.loadAll(raw);
            for (const doc of docs) {
              if (doc && typeof doc === 'object' && !Array.isArray(doc)) {
                const obj = doc as Record<string, unknown>;
                const apiVersion = obj.apiVersion;
                const kind = obj.kind;
                if (typeof apiVersion === 'string' && typeof kind === 'string') {
                  types.add(`${apiVersion}/${kind}`);
                }
              }
            }
          } catch {
            // Skip units whose data can't be fetched/parsed
          }
        }),
      );

      setResourceTypes(Array.from(types).sort());
      setIsLoaded(true);
    } catch {
      setResourceTypes([]);
    }
  }, [triggerListUnits, isLoaded]);

  useEffect(() => {
    fetchResourceTypes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { resourceTypes, isLoaded };
}
