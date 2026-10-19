// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import type { ReactNode } from 'react';

import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';

/**
 * The bar at the foot of a settings form. It stays in view while the form scrolls, so Save is
 * always in reach of the field just edited.
 */
export const SettingsFormFooter = ({
  actions,
  children,
}: {
  actions?: ReactNode;
  children: ReactNode;
}) => (
  <Stack
    direction='row'
    alignItems='center'
    justifyContent='space-between'
    spacing={2}
    sx={{
      position: 'sticky',
      bottom: 0,
      zIndex: 1,
      py: 1.5,
      mt: 1,
      borderTop: '1px solid',
      borderColor: 'divider',
      backgroundColor: 'background.default',
    }}
  >
    <Box>{actions}</Box>
    {children}
  </Stack>
);
