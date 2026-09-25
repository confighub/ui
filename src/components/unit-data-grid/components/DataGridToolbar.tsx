// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { ReactNode } from 'react';

import Box from '@mui/material/Box';
import { GridToolbarContainer } from '@mui/x-data-grid';

import { ResetTableButton } from '../../common/ResetTableButton';

interface DataGridToolbarProps {
  hasStateChanged: boolean;
  onResetState: () => void;
  children?: ReactNode;
}

export const DataGridToolbar = ({
  hasStateChanged,
  onResetState,
  children,
}: DataGridToolbarProps) => {
  return (
    <GridToolbarContainer sx={{ justifyContent: 'space-between', backgroundColor: 'white' }}>
      <Box sx={{ ml: 1, mt: 1, mb: 1.5 }}>
        <ResetTableButton onClick={onResetState} disabled={!hasStateChanged} />
      </Box>
      <Box sx={{ display: 'flex', gap: 1 }}>{children}</Box>
    </GridToolbarContainer>
  );
};
