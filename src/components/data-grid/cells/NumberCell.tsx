// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import { CenteredTableCell, Ellipses } from '@/components/styled';
import { GridRenderCellParams, GridValidRowModel } from '@mui/x-data-grid';
import { useHighlightedText } from './useHighlightedText';

interface NumberCellProps<TRow extends GridValidRowModel = GridValidRowModel> {
  params: GridRenderCellParams<TRow>;
}

export function NumberCell<TRow extends GridValidRowModel = GridValidRowModel>({
  params,
}: NumberCellProps<TRow>) {
  const text = params.value != null ? String(params.value) : '';
  const highlightedContent = useHighlightedText(text);

  return (
    <CenteredTableCell>
      <Ellipses variant="body1">{highlightedContent}</Ellipses>
    </CenteredTableCell>
  );
}
