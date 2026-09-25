// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import CodeIcon from '@mui/icons-material/Code';
import ViewListIcon from '@mui/icons-material/ViewList';
import IconButton from '@mui/material/IconButton';
import Stack from '@mui/material/Stack';
import Tooltip from '@mui/material/Tooltip';

import { ViewMode } from '../../types';

export interface IResultsToolbarProps {
  viewMode: ViewMode;
  onViewModeChange?: (mode: ViewMode) => void;
  canToggle?: boolean;
}

export const ResultsToolbar = ({
  viewMode,
  onViewModeChange,
  canToggle = false,
}: IResultsToolbarProps) => {
  return (
    <Stack
      direction='row'
      spacing={1}
      sx={{
        mb: 2,
        justifyContent: 'flex-end',
        alignItems: 'center',
      }}
    >
      {canToggle && onViewModeChange && viewMode && (
        <Stack direction='row' spacing={0.5}>
          <Tooltip title='Table View' arrow>
            <IconButton
              size='small'
              onClick={() => onViewModeChange('table')}
              color={viewMode === 'table' ? 'primary' : 'default'}
              sx={{
                bgcolor: viewMode === 'table' ? 'primary.light' : 'transparent',
                '&:hover': {
                  bgcolor: viewMode === 'table' ? 'primary.light' : 'action.hover',
                },
              }}
            >
              <ViewListIcon />
            </IconButton>
          </Tooltip>
          <Tooltip title='Code View' arrow>
            <IconButton
              size='small'
              onClick={() => onViewModeChange('code')}
              color={viewMode === 'code' ? 'primary' : 'default'}
              sx={{
                bgcolor: viewMode === 'code' ? 'primary.light' : 'transparent',
                '&:hover': {
                  bgcolor: viewMode === 'code' ? 'primary.light' : 'action.hover',
                },
              }}
            >
              <CodeIcon />
            </IconButton>
          </Tooltip>
        </Stack>
      )}
    </Stack>
  );
};
