// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { useState } from 'react';

import { ValidationErrorsHoverCard } from '@/components/validation-errors-card/ValidationErrorsCard';
import { Breadcrumb } from '@/components/breadcrumb-new/BreadCrumb';
import { type GroupByOption } from '@/components/group-by-selector/GroupBySelector';
import { LinkUnitModal } from '@/pages/x/unit-dashboard-page/components/dashboard/LinkUnitModal';
import {
  type ActionStatusType,
  type ExtendedUnitRead,
  useListUnitEventsQuery,
} from '@confighub/rtk-query';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import EditIcon from '@mui/icons-material/Edit';
import ErrorIcon from '@mui/icons-material/Error';
import LinkIcon from '@mui/icons-material/Link';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import IconButton from '@mui/material/IconButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { keyframes, styled, useTheme } from '@mui/material/styles';

import { formatRelative } from '@/utility/date-format';

// ============================================================================
// CONSTANTS
// ============================================================================

const POLL_INTERVAL_MS = 5000;

// ============================================================================
// ANIMATIONS
// ============================================================================

const pulse = keyframes`
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.6; transform: scale(1.25); }
`;

// ============================================================================
// STYLED COMPONENTS
// ============================================================================

const StatusDot = styled(Box, {
  shouldForwardProp: (prop) => prop !== '$color' && prop !== '$isActive',
})<{ $color: string; $isActive: boolean }>(({ $color, $isActive }) => ({
  width: 8,
  height: 8,
  borderRadius: '50%',
  backgroundColor: $color,
  flexShrink: 0,
  ...($isActive && {
    animation: `${pulse} 1.5s ease-in-out infinite`,
  }),
}));

// ============================================================================
// HELPERS
// ============================================================================

const isActionInProgress = (status: ActionStatusType | undefined): boolean => {
  return status === 'Pending' || status === 'Submitted' || status === 'Progressing';
};

type PaletteKey = 'success' | 'error' | 'warning' | 'info' | 'text';

const getStatusPaletteKey = (status: ActionStatusType | undefined): PaletteKey => {
  switch (status) {
    case 'Completed':
      return 'success';
    case 'Failed':
    case 'Canceled':
      return 'error';
    case 'Progressing':
      return 'warning';
    case 'Pending':
    case 'Submitted':
      return 'info';
    default:
      return 'text';
  }
};

export interface IHeaderProps {
  unit: ExtendedUnitRead;
  groupBy: GroupByOption;
  /** Callback when Edit Config is selected from menu */
  onEditConfig?: () => void;
}

export const DashboardHeader = ({ unit, groupBy, onEditConfig }: IHeaderProps) => {
  const theme = useTheme();
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const menuOpen = Boolean(anchorEl);
  const [linkModalOpen, setLinkModalOpen] = useState(false);

  const spaceId = unit?.Unit?.SpaceID || '';
  const unitId = unit?.Unit?.UnitID || '';

  // Calculate validation errors summary
  const validationErrors = unit?.Unit?.ValidationErrors;
  const gatesTotal = validationErrors ? Object.keys(validationErrors).length : 0;
  const gatesBlocking = validationErrors
    ? Object.values(validationErrors).filter((failed) => failed).length
    : 0;
  const hasBlockingGates = gatesBlocking > 0;

  const { data: events = [] } = useListUnitEventsQuery(
    { spaceId, unitId },
    {
      skip: !spaceId || !unitId,
      pollingInterval: POLL_INTERVAL_MS,
    },
  );

  // The latest event is the most recently created one
  const latestEvent = events.reduce<(typeof events)[0] | undefined>(
    (latest, event) =>
      !latest || Date.parse(event.CreatedAt ?? '') > Date.parse(latest.CreatedAt ?? '')
        ? event
        : latest,
    undefined,
  );
  const actionStatus = latestEvent?.Status;
  const actionType = latestEvent?.Action;
  const isActive = isActionInProgress(actionStatus);
  const paletteKey = getStatusPaletteKey(actionStatus);
  const eventTimestamp = latestEvent?.CreatedAt
    ? formatRelative(latestEvent.CreatedAt)
    : null;

  const handleMenuOpen = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleMenuClose = () => {
    setAnchorEl(null);
  };

  const handleEditConfig = () => {
    handleMenuClose();
    onEditConfig?.();
  };

  const handleLinkUnit = () => {
    handleMenuClose();
    setLinkModalOpen(true);
  };

  return (
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
        <Breadcrumb unit={unit} groupBy={groupBy} />
        <Stack direction='row' spacing={1} alignItems='center'>
          <Typography variant='h6'>{unit?.Unit?.Slug}</Typography>
          {unit?.Unit?.ProviderType && (
            <Chip size='small' label={`${unit?.Unit?.ProviderType}`} color={'info'} />
          )}
          {gatesTotal > 0 && (
            <ValidationErrorsHoverCard unit={unit}>
              <Chip
                size='small'
                icon={
                  hasBlockingGates ? (
                    <ErrorIcon sx={{ fontSize: 14 }} />
                  ) : (
                    <CheckCircleIcon sx={{ fontSize: 14 }} />
                  )
                }
                label='Validation Errors'
                color={hasBlockingGates ? 'warning' : 'success'}
                variant='outlined'
                sx={{
                  cursor: 'pointer',
                  '&:hover': {
                    backgroundColor: hasBlockingGates
                      ? theme.palette.error.main + '15'
                      : theme.palette.success.main + '15',
                  },
                }}
              />
            </ValidationErrorsHoverCard>
          )}
        </Stack>
      </Box>
      <Stack direction='row' spacing={1} alignItems='center'>
        {latestEvent && (
          <Stack direction='row' spacing={0.75} alignItems='center'>
            <StatusDot
              $color={
                paletteKey === 'text'
                  ? theme.palette.text.secondary
                  : theme.palette[paletteKey].main
              }
              $isActive={isActive}
            />
            <Typography variant='caption' color='text.secondary' sx={{ lineHeight: 1 }}>
              {actionType || 'Action'}
              {' · '}
              <Box component='span' sx={{ color: `${paletteKey}.main`, fontWeight: 500 }}>
                {actionStatus || 'Unknown'}
              </Box>
              {eventTimestamp && (
                <>
                  {' · '}
                  {eventTimestamp}
                </>
              )}
            </Typography>
          </Stack>
        )}
        <IconButton size='small' onClick={handleMenuOpen}>
          <MoreVertIcon />
        </IconButton>
        <Menu
          anchorEl={anchorEl}
          open={menuOpen}
          onClose={handleMenuClose}
          anchorOrigin={{
            vertical: 'bottom',
            horizontal: 'right',
          }}
          transformOrigin={{
            vertical: 'top',
            horizontal: 'right',
          }}
        >
          <MenuItem onClick={handleEditConfig} dense>
            <ListItemIcon>
              <EditIcon fontSize='small' />
            </ListItemIcon>
            <ListItemText>Edit Config</ListItemText>
          </MenuItem>
          <MenuItem onClick={handleLinkUnit} dense>
            <ListItemIcon>
              <LinkIcon fontSize='small' />
            </ListItemIcon>
            <ListItemText>Link to upstream</ListItemText>
          </MenuItem>
        </Menu>

        <LinkUnitModal
          isOpen={linkModalOpen}
          unit={unit}
          onClose={() => setLinkModalOpen(false)}
        />
      </Stack>
    </Stack>
  );
};
