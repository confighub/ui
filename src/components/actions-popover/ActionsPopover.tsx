// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import Draggable from 'react-draggable';

import Box from '@mui/material/Box';

export interface IActionsPopoverProps {
  isActionsPopoverOpen?: boolean;
  onActionsPopoverClosed?: () => void;
  actions: React.ReactNode;
  anchorEl?: HTMLElement | null;
}

export const ActionsPopover = ({ actions }: IActionsPopoverProps) => {
  const position = { x: 10, y: -10 };

  return (
    <Draggable defaultPosition={position}>
      <Box
        sx={{
          border: '1px solid #ccc',
          boxShadow: '0px 2px 8px rgba(0,0,0,0.1)',
          backgroundColor: 'white',
          borderRadius: 2,
          p: 1,
          display: 'flex',
          flexDirection: 'row',
          cursor: 'move',
          zIndex: 2,
        }}
      >
        {actions}
      </Box>
    </Draggable>
  );
};
