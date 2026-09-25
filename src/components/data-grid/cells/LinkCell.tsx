// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import { useLocation } from 'react-router-dom';
import Tooltip from '@mui/material/Tooltip';
import { GridValidRowModel } from '@mui/x-data-grid';
import { NavLink } from '@/components/nav-link/NavLink';
import { CenteredTableCell, Ellipses } from '@/components/styled';
import { ILinkCellProps } from '@/types';
import { useHighlightedText } from './useHighlightedText';

/**
 * Merges a query-only link (e.g., "?edit=123") with existing URL params.
 * If the link is not query-only, returns it as-is.
 */
function mergeQueryParams(link: string, currentSearch: string): string {
  // Only merge if link starts with "?" (query-only link)
  if (!link.startsWith('?')) {
    return link;
  }

  const currentParams = new URLSearchParams(currentSearch);
  const newParams = new URLSearchParams(link.slice(1));

  // Merge new params into current params
  newParams.forEach((value, key) => {
    currentParams.set(key, value);
  });

  return `?${currentParams.toString()}`;
}

export function LinkCell<TRow extends GridValidRowModel = GridValidRowModel>({ params, linkTo, getText }: ILinkCellProps<TRow>) {
  const location = useLocation();
  const displayText = getText ? getText(params.row) : params.value;
  const fullText = String(displayText ?? '');
  const highlightedContent = useHighlightedText(fullText);

  const rawLink = linkTo(params.row);
  const finalLink = mergeQueryParams(rawLink, location.search);

  return (
    <CenteredTableCell>
      <Tooltip title={fullText} arrow slotProps={{ popper: { sx: { pointerEvents: 'none', userSelect: 'none' } } }}>
        <NavLink to={finalLink} style={{ minWidth: 0 }}>
          <Ellipses variant="body1" sx={{ textDecoration: 'underline', cursor: 'pointer' }}>
            {highlightedContent}
          </Ellipses>
        </NavLink>
      </Tooltip>
    </CenteredTableCell>
  );
}
