// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { useGridApiContext } from '@mui/x-data-grid';
import React from 'react';

import { useQuickFilterContext } from '../context/QuickFilterContext';
import { highlightText } from '../utils/highlightText';

interface HighlightedCellProps {
  value: string | number | null | undefined;
}

/**
 * A cell component that automatically highlights text matching the current quick filter.
 * Use this in column definitions with renderCell to enable search highlighting.
 *
 * @example
 * {
 *   field: 'name',
 *   headerName: 'Name',
 *   renderCell: (params) => <HighlightedCell value={params.value} />
 * }
 */
export const HighlightedCell: React.FC<HighlightedCellProps> = ({ value }) => {
  const apiRef = useGridApiContext();
  const filterValue = useQuickFilterContext(apiRef?.current);

  // Convert value to string, handle null/undefined
  const text = value != null ? String(value) : '';

  if (!text) {
    return null;
  }

  return <>{highlightText(text, filterValue)}</>;
};
