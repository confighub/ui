// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { useCallback, useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

export interface UseEditDrawerUrlReturn {
  /** The entity ID from the URL edit param, or null if not set */
  editEntityId: string | null;
  /** Whether the drawer should be open (edit param is present) */
  isDrawerOpen: boolean;
  /** Open the edit drawer for the given entity ID */
  openEditDrawer: (entityId: string) => void;
  /** Close the edit drawer and remove the edit param from URL */
  closeEditDrawer: () => void;
  /** Get the URL with edit param for the given entity ID (for links) */
  getEditUrl: (entityId: string) => string;
}

/**
 * Hook for managing edit drawer state via URL parameters.
 * Enables deep linking to edit drawers (e.g., /targets?edit=<target-id>)
 *
 * @param paramName - The URL parameter name to use (default: 'edit')
 * @returns Object with drawer state and actions
 */
export const useEditDrawerUrl = (paramName = 'edit'): UseEditDrawerUrlReturn => {
  const location = useLocation();
  const navigate = useNavigate();

  // Parse edit entity ID from URL
  const getEditEntityId = useCallback((): string | null => {
    const searchParams = new URLSearchParams(location.search);
    return searchParams.get(paramName);
  }, [location.search, paramName]);

  const [editEntityId, setEditEntityId] = useState<string | null>(getEditEntityId);

  // Sync with URL changes (for browser back/forward)
  useEffect(() => {
    const urlEntityId = getEditEntityId();
    setEditEntityId(urlEntityId);
  }, [getEditEntityId]);

  // Open edit drawer by updating URL
  const openEditDrawer = useCallback(
    (entityId: string) => {
      const searchParams = new URLSearchParams(location.search);
      searchParams.set(paramName, entityId);
      setEditEntityId(entityId); // Update state immediately for synchronous UI response
      navigate(`${location.pathname}?${searchParams.toString()}`, { replace: true });
    },
    [location.pathname, location.search, navigate, paramName]
  );

  // Close edit drawer by removing param from URL
  const closeEditDrawer = useCallback(() => {
    const searchParams = new URLSearchParams(location.search);
    searchParams.delete(paramName);
    const newSearch = searchParams.toString();
    setEditEntityId(null); // Update state immediately for synchronous UI response
    navigate(`${location.pathname}${newSearch ? `?${newSearch}` : ''}`, { replace: true });
  }, [location.pathname, location.search, navigate, paramName]);

  // Get URL with edit param for link navigation
  const getEditUrl = useCallback(
    (entityId: string): string => {
      const searchParams = new URLSearchParams(location.search);
      searchParams.set(paramName, entityId);
      return `${location.pathname}?${searchParams.toString()}`;
    },
    [location.pathname, location.search, paramName]
  );

  return {
    editEntityId,
    isDrawerOpen: editEntityId !== null,
    openEditDrawer,
    closeEditDrawer,
    getEditUrl,
  };
};
