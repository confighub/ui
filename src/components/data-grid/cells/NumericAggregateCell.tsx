// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import { CenteredTableCell, Ellipses } from '@/components/styled';
import { GridValidRowModel } from '@mui/x-data-grid';
import { INumericAggregateCellProps } from '@/types';
import { useHighlightedText } from './useHighlightedText';

export function NumericAggregateCell<TRow extends GridValidRowModel = GridValidRowModel>({
  params,
  rows,
  aggregateGetter,
}: INumericAggregateCellProps<TRow>) {
  const displayValue =
    params.rowNode.type === 'group'
      ? aggregateGetter(rows, (params.rowNode.children || []) as string[])
      : params.value;

  const highlightedContent = useHighlightedText(String(displayValue ?? ''));

  return (
    <CenteredTableCell>
      <Ellipses variant="body1">{highlightedContent}</Ellipses>
    </CenteredTableCell>
  );
}
