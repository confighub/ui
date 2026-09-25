// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { GridRenderCellParams, GridValidRowModel } from '@mui/x-data-grid';
import React from 'react';

import { HighlightedCell } from '../components/HighlightedCell';

/**
 * Higher-order function that wraps a renderCell function to add highlighting support.
 * Useful when you have custom cell rendering but still want text highlighting.
 *
 * @param renderCell - The original renderCell function
 * @param getValue - Optional function to extract the text value for highlighting
 * @returns A new renderCell function with highlighting support
 *
 * @example
 * ```tsx
 * renderCell: withHighlighting((params) => (
 *   <Tooltip title={params.value}>
 *     <Ellipses>{params.value}</Ellipses>
 *   </Tooltip>
 * ))
 * ```
 */
export const withHighlighting = <T extends GridValidRowModel>(
  renderCell: (params: GridRenderCellParams<T>) => React.ReactNode,
  getValue?: (params: GridRenderCellParams<T>) => string | number | null | undefined,
) => {
  return (params: GridRenderCellParams<T>) => {
    // If a custom getValue is provided, use it. Otherwise, use params.value
    const value = getValue ? getValue(params) : params.value;

    // Create a modified params object with HighlightedCell as the value
    const modifiedParams = {
      ...params,
      formattedValue: <HighlightedCell value={value} />,
    };

    // Call the original renderCell with modified params
    return renderCell(modifiedParams);
  };
};
