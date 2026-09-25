// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import { CenteredTableCell, Ellipses } from '@/components/styled';
import Tooltip from '@mui/material/Tooltip';
import { GridValidRowModel } from '@mui/x-data-grid';
import { IUuidCellProps } from '@/types';
import { useHighlightedText } from './useHighlightedText';

export function UuidCell<TRow extends GridValidRowModel = GridValidRowModel>({
  params,
}: IUuidCellProps<TRow>) {
  const highlightedContent = useHighlightedText(params.value);

  return (
    <CenteredTableCell>
      <Tooltip title={params.value} arrow>
        <Ellipses
          variant="body2"
          sx={{
            fontFamily: '"Roboto Mono", monospace',
            fontSize: '0.92rem',
            letterSpacing: '-0.01em',
          }}
        >
          {highlightedContent}
        </Ellipses>
      </Tooltip>
    </CenteredTableCell>
  );
}
