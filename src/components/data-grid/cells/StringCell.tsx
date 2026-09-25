// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import { CenteredTableCell, Ellipses } from '@/components/styled';
import Tooltip from '@mui/material/Tooltip';
import { GridRenderCellParams, GridValidRowModel } from '@mui/x-data-grid';
import { useHighlightedText } from './useHighlightedText';

interface StringCellProps<TRow extends GridValidRowModel = GridValidRowModel> {
  params: GridRenderCellParams<TRow>;
}

export function StringCell<TRow extends GridValidRowModel = GridValidRowModel>({
  params,
}: StringCellProps<TRow>) {
  const text = params.value != null ? String(params.value) : '';
  const highlightedContent = useHighlightedText(text);

  return (
    <CenteredTableCell>
      <Tooltip title={text} arrow>
        <Ellipses variant="body1">{highlightedContent}</Ellipses>
      </Tooltip>
    </CenteredTableCell>
  );
}
