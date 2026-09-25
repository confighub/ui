// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { useState } from 'react';
import { GridRowSelectionModel } from '@mui/x-data-grid';

/**
 * Custom hook to manage SpacesTable state including column visibility and selection.
 */
export const useSpaceTableState = () => {
  const [columnVisibilityModel, setColumnVisibilityModel] = useState<Record<string, boolean>>({});
  const [selectedRows, setSelectedRows] = useState<GridRowSelectionModel>([]);

  const handleRowSelection = (newSelection: GridRowSelectionModel, onRowSelected?: (newSelection: Array<string>) => void) => {
    setSelectedRows(newSelection);
    // @ts-expect-error it's actually a string array
    onRowSelected?.(newSelection);
  };

  return {
    columnVisibilityModel,
    selectedRows,
    setColumnVisibilityModel,
    handleRowSelection,
  };
};
