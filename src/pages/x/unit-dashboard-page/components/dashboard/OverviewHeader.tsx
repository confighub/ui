// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { BreadcrumbContainer, BreadcrumbText } from '@/components/breadcrumb-new/BreadCrumb';
import AccountTreeIcon from '@mui/icons-material/AccountTree';
import DashboardIcon from '@mui/icons-material/Dashboard';
import Box from '@mui/material/Box';
import IconButton from '@mui/material/IconButton';
import Stack from '@mui/material/Stack';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';

export interface IOverviewHeaderProps {
  onFlowViewToggle: () => void;
  isFlowViewEnabled: boolean;
}

export const OverviewHeader = ({
  onFlowViewToggle,
  isFlowViewEnabled,
}: IOverviewHeaderProps) => (
  <Stack
    direction='row'
    justifyContent='space-between'
    alignItems='flex-start'
    padding={2}
    sx={{
      backgroundColor: 'background.paper',
      borderBottom: '1px solid',
      borderColor: 'divider',
    }}
  >
    <Box>
      <BreadcrumbContainer>
        <BreadcrumbText>Unit List</BreadcrumbText>
      </BreadcrumbContainer>
      <Typography variant='h6'>{isFlowViewEnabled ? 'Flow View' : 'Overview'}</Typography>
    </Box>
    <Tooltip title={isFlowViewEnabled ? 'Switch to Overview' : 'Switch to Flow View'}>
      <IconButton size='small' onClick={onFlowViewToggle}>
        {isFlowViewEnabled ? (
          <DashboardIcon fontSize='small' />
        ) : (
          <AccountTreeIcon fontSize='small' />
        )}
      </IconButton>
    </Tooltip>
  </Stack>
);
