// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import { CenteredTableCell, Ellipses } from '@/components/styled';
import { IBooleanCellProps } from '@/types';
import Tooltip from '@mui/material/Tooltip';
import { GridValidRowModel } from '@mui/x-data-grid';
import { useHighlightedText } from './useHighlightedText';

// Default text-based display
function DefaultBooleanDisplay({ value }: { value: boolean | null | undefined }) {
  const text = value === true ? 'Yes' : value === false ? 'No' : '-';
  const highlightedContent = useHighlightedText(text);

  return (
    <Tooltip title={text} arrow>
      <Ellipses variant="body1">{highlightedContent}</Ellipses>
    </Tooltip>
  );
}

export function BooleanCell<TRow extends GridValidRowModel = GridValidRowModel>({
  params,
  display,
}: IBooleanCellProps<TRow>) {
  const value = params.value as boolean | null | undefined;

  if (display) {
    const getContent = () => {
      if (value === true) return display.true();
      if (value === false) return display.false();
      if (display.undefined) return display.undefined();
      return null;
    };

    return <CenteredTableCell>{getContent()}</CenteredTableCell>;
  }

  return (
    <CenteredTableCell>
      <DefaultBooleanDisplay value={value} />
    </CenteredTableCell>
  );
}
