// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import { useCallback, useRef, useState } from 'react';

import {
  useCreateSpaceMutation,
  useListSpacesQuery,
} from '@confighub/rtk-query';

const SYSTEM_SPACE_SLUG = 'confighub-system';
const SYSTEM_SPACE_DISPLAY_NAME = 'ConfigHub System';

/**
 * Finds or creates the dedicated `confighub-system` space used to store
 * views, filters, and other internal entities. The space is created
 * transparently on first use so the user never needs to manage it.
 */
export function useSystemSpace() {
  const [createSpace] = useCreateSpaceMutation();
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const createAttempted = useRef(false);

  const { data: spacesData = [], isLoading: isQuerying } = useListSpacesQuery({
    where: `Slug = '${SYSTEM_SPACE_SLUG}'`,
  });

  const existingSpace = spacesData.find(
    (es) => es.Space?.Slug === SYSTEM_SPACE_SLUG,
  );
  const systemSpaceId = existingSpace?.Space?.SpaceID ?? null;

  const ensureSystemSpace = useCallback(async (): Promise<string> => {
    if (systemSpaceId) return systemSpaceId;
    if (createAttempted.current) {
      throw new Error('System space creation already attempted and failed.');
    }
    createAttempted.current = true;
    setIsCreating(true);
    setError(null);
    try {
      const result = await createSpace({
        allowExists: 'true',
        space: {
          Slug: SYSTEM_SPACE_SLUG,
          DisplayName: SYSTEM_SPACE_DISPLAY_NAME,
        },
      }).unwrap();
      return result.SpaceID!;
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : 'Failed to create system space.';
      setError(msg);
      throw new Error(msg);
    } finally {
      setIsCreating(false);
    }
  }, [systemSpaceId, createSpace]);

  return {
    systemSpaceId,
    isReady: !isQuerying && !!systemSpaceId,
    isLoading: isQuerying || isCreating,
    error,
    ensureSystemSpace,
  };
}
