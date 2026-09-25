// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import { useGridApiContext } from '@mui/x-data-grid';
import React from 'react';

import { useQuickFilterContext } from '@/components/entity-data-grid/context/QuickFilterContext';
import { highlightText } from '@/components/entity-data-grid/utils/highlightText';

/**
 * Hook that returns highlighted text based on the current quick filter.
 * Used by cell components to provide consistent search highlighting.
 *
 * @param text - The text to potentially highlight
 * @returns JSX with highlighted portions if a filter is active, otherwise the original text
 */
export function useHighlightedText(text: string | null | undefined): React.ReactNode {
  const apiRef = useGridApiContext();
  const filterValue = useQuickFilterContext(apiRef?.current);

  if (!text) {
    return null;
  }

  return highlightText(text, filterValue);
}
