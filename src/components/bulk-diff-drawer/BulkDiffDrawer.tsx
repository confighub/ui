// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { useMemo } from 'react';

import { CopyLinkButton } from '@/components/copy-link-button/CopyLinkButton';
import { NavLink } from '@/components/nav-link/NavLink';
import { useShareUrl } from '@/hooks/useShareUrl';
import { ExtendedUnitRead, useGetMeQuery } from '@confighub/rtk-query';
import { calculateTotalChanges } from '@/utility/diff-methods';
import CloseIcon from '@mui/icons-material/Close';
import SwapVertIcon from '@mui/icons-material/SwapVert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Drawer from '@mui/material/Drawer';
import IconButton from '@mui/material/IconButton';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';

import { DiffTreeView } from '../diff-tree-view/DiffTreeView';

/** Width of the drawer in pixels */
export const DRAWER_WIDTH = 1200;

/** Background color for the drawer content area */
export const CONTENT_BACKGROUND_COLOR = 'rgb(249, 250, 251)';

export interface BulkDiffDrawerProps {
  /** Controls drawer visibility */
  isOpen: boolean;
  /** Callback when drawer should close */
  onClose: () => void;
  /** Array of unit diffs to display */
  units: ExtendedUnitRead[];
  /** Callback when user confirms the changes */
  onConfirm: () => void;
  /** Loading state during apply operation */
  isLoading?: boolean;
}

/**
 * BulkDiffDrawer - A drawer component for reviewing and applying changes to multiple units
 *
 * Features:
 * - Side-by-side diff view for multiple units
 * - Shareable preview URL
 * - Copy link functionality
 * - Bulk apply operation with loading state
 * - Fixed footer with apply button
 *
 * @example
 * ```tsx
 * <BulkDiffDrawer
 *   isOpen={isOpen}
 *   onClose={handleClose}
 *   unitDiffs={diffs}
 *   onConfirm={handleApply}
 *   isLoading={isApplying}
 * />
 * ```
 */
export const BulkDiffDrawer = ({
  isOpen,
  onClose,
  units,
  onConfirm,
  isLoading = false,
}: BulkDiffDrawerProps) => {
  // Fetch current user data for share URL
  const { data: meData } = useGetMeQuery();

  // Calculate total changes across all diffs
  const totalChanges = useMemo(() => calculateTotalChanges(units), [units]);

  // Generate shareable URL
  const { fullShareUrl, copyToClipboard } = useShareUrl(units, meData?.UserID);

  const unitCount = units.length;

  return (
    <Drawer
      anchor='right'
      open={isOpen}
      onClose={onClose}
      sx={{
        '& .MuiDrawer-paper': {
          width: { xs: DRAWER_WIDTH },
        },
      }}
    >
      <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
        {/* Header */}
        <Box
          sx={{
            p: 2,
            borderBottom: '1px solid',
            borderColor: 'divider',
            backgroundColor: 'background.paper',
          }}
        >
          {/* Title Row */}
          <Stack direction='row' justifyContent='space-between' alignItems='center' mb={1}>
            <Stack direction='row' spacing={1}>
              <Typography variant='h4' fontWeight='bold' color='text.primary'>
                Apply Changes
              </Typography>
              <NavLink data-testid='apply-changes-preview-link' to={fullShareUrl}>
                <Typography variant='h4' color='text.secondary'>
                  #Preview
                </Typography>
              </NavLink>
            </Stack>

            {/* Action Buttons */}
            <Stack direction='row' spacing={0.5}>
              <CopyLinkButton
                shareUrl={fullShareUrl}
                show
                onCopy={copyToClipboard}
                showText={false}
              />
              <IconButton onClick={onClose} size='small' sx={{ color: 'text.secondary' }}>
                <CloseIcon />
              </IconButton>
            </Stack>
          </Stack>

          {/* Info Row */}
          <Stack direction='row' alignItems='center' spacing={2}>
            <SwapVertIcon color='action' />
            <Typography variant='body2' color='text.secondary'>
              Applying head revision to live for {unitCount}{' '}
              {unitCount === 1 ? 'unit' : 'units'}
            </Typography>
            <Chip
              label={`${totalChanges} ${totalChanges === 1 ? 'unit changed' : 'units changed'}`}
              size='small'
              color='primary'
              variant='outlined'
            />
          </Stack>
        </Box>

        {/* Main Content Area */}
        <Box
          sx={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            backgroundColor: CONTENT_BACKGROUND_COLOR,
          }}
        >
          {/* DiffTreeView */}
          <Box sx={{ flex: 1, height: '100%', overflow: 'hidden' }}>
            <DiffTreeView
              units={units}
              action={
                <Box
                  sx={{
                    p: 2,
                    backgroundColor: CONTENT_BACKGROUND_COLOR,
                  }}
                >
                  <Button
                    variant='contained'
                    fullWidth
                    onClick={onConfirm}
                    disabled={isLoading}
                    sx={{
                      transition: 'all 0.2s ease-in-out',
                      '&:hover': {
                        transform: 'translateY(-1px)',
                        boxShadow: '0 8px 25px rgba(25, 118, 210, 0.3)',
                      },
                    }}
                  >
                    {isLoading ? 'Applying Changes...' : 'Apply Changes'}
                  </Button>
                </Box>
              }
            />
          </Box>
        </Box>
      </Box>
    </Drawer>
  );
};
