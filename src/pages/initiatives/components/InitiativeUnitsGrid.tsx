// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import type { ReactNode } from 'react';

import { UnitDataGrid } from '@/components/unit-data-grid/UnitDataGrid';
import type { ExtendedUnitRead } from '@confighub/rtk-query';
import type { UnitCheckResult } from '@/types/initiative';

import { INITIATIVE_COLUMNS } from '../utils/checkResultHelpers';

/** Only surface Team/App label columns — other labels are hidden in initiative views. */
const INITIATIVE_LABEL_COLUMNS = ['Team', 'App'];

const NOOP_SELECTION = () => {};

interface InitiativeUnitsGridProps {
  /** Units to render. Callers are responsible for any server/client side filtering. */
  units: ExtendedUnitRead[];
  /**
   * Kyverno policy check results. Always forwarded to the grid (even `null`/`[]`)
   * so the TestResult column stays visible — pre-run cells render empty, post-run
   * they render Pass/Fail/N/A.
   */
  checkResults?: UnitCheckResult[] | null;
  /** True while the underlying query/refresh is in flight. */
  isLoading?: boolean;
  /** Toolbar filter element (typically a QueryBuilder or its portal target). */
  filterElement?: ReactNode;
  /** When true, result cells show a spinner while the check is in flight. */
  isRunningCheck?: boolean;
  /** Overlay rendered when there are zero rows. */
  noRowsOverlay?: ReactNode;
  /** When false, the grid fills its container and scrolls internally. Defaults to true. */
  autoHeight?: boolean;
  /** Default sort column and direction. */
  defaultSort?: { field: string; sort: 'asc' | 'desc' };
  /**
   * Currently selected unit IDs. When `onRowSelectionChange` is also provided the
   * selection checkbox column is shown so callers can pipe the selection elsewhere
   * (e.g. into the global Invoker context).
   */
  selectedUnitIds?: string[];
  /** Selection change handler. Presence of this prop opts the grid into checkbox selection. */
  onRowSelectionChange?: (selectedUnits: string[]) => void;
}

/**
 * Initiative-flavoured wrapper around {@link UnitDataGrid}.
 *
 * Centralises the grid configuration used across the initiatives area
 * (column visibility, Team/App label allowlist, checkbox behaviour) so the
 * main initiatives detail view and the edit view render the same grid with
 * the same refresh semantics.
 *
 * Status updates propagate via the `checkResults` prop — callers keep the
 * results in their own state and pass them down; when new results arrive
 * the grid re-renders via the inner grid's `checkResults` memoisation.
 */
export const InitiativeUnitsGrid = ({
  units,
  checkResults,
  isLoading = false,
  filterElement,
  noRowsOverlay,
  autoHeight = true,
  defaultSort,
  isRunningCheck = false,
  selectedUnitIds,
  onRowSelectionChange,
}: InitiativeUnitsGridProps) => {
  const selectionEnabled = Boolean(onRowSelectionChange);
  return (
    <UnitDataGrid
      units={units}
      isLoading={isLoading}
      onRowSelectionChange={onRowSelectionChange ?? NOOP_SELECTION}
      selectedUnitIds={selectedUnitIds}
      openLinksInNewTab
      hideCheckboxes={!selectionEnabled}
      // Always forward `checkResults` (even `null`/`[]`) so the TestResult column
      // stays visible. Pre-run the cells render empty; post-run they render
      // Pass/Fail/N/A. `undefined` would hide the column entirely — which we
      // don't want in initiative views — so coalesce to `null` as a sentinel
      // "column on, no data yet" signal to the underlying grid.
      checkResults={checkResults ?? null}
      initialColumnVisibility={INITIATIVE_COLUMNS}
      allowedLabelColumns={INITIATIVE_LABEL_COLUMNS}
      disableUrlSync
      autoHeight={autoHeight}
      filterElement={filterElement}
      noRowsOverlay={noRowsOverlay}
      defaultSort={defaultSort}
      isResultPending={isRunningCheck}
    />
  );
};
