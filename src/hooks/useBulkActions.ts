// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { useMemo, useState } from 'react';

import { type ExtendedUnitRead, type UnitRead } from '@confighub/rtk-query';

// ============================================================================
// TYPES
// ============================================================================

export interface BulkEditState {
  isOpen: boolean;
  unitsToEdit: UnitRead[];
  open: () => void;
  close: () => void;
}

export interface UseBulkActionsReturn {
  bulkEdit: BulkEditState;
}

// ============================================================================
// HOOK
// ============================================================================

/**
 * Manages bulk action drawer/modal state for a set of selected units.
 *
 * Each bulk action (edit, apply, destroy, …) gets its own namespace in the
 * returned object so callers can destructure only what they need and new
 * actions can be added without touching existing consumers.
 *
 * @param selectedUnits - The currently selected ExtendedUnitRead objects.
 */
export const useBulkActions = (selectedUnits: ExtendedUnitRead[]): UseBulkActionsReturn => {
  const [isBulkEditOpen, setIsBulkEditOpen] = useState(false);

  // Extract plain UnitRead objects — what BulkEditUnitsDrawer expects
  const unitsToEdit = useMemo(
    (): UnitRead[] =>
      selectedUnits.map((u) => u.Unit).filter((u): u is UnitRead => u !== undefined),
    [selectedUnits],
  );

  const bulkEdit: BulkEditState = {
    isOpen: isBulkEditOpen,
    unitsToEdit,
    open: () => setIsBulkEditOpen(true),
    close: () => setIsBulkEditOpen(false),
  };

  return { bulkEdit };
};
