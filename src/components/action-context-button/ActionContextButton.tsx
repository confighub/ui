// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Tooltip from '@mui/material/Tooltip';

import { fadeIn } from '../styled';

export type ActionCondition = {
  condition: boolean;
  message: string;
  warn?: boolean;
  chain?: boolean;
};

export interface ActionContextButtonProps {
  disabled: boolean;
  conditions: Array<ActionCondition>;
  label: string;
  onActionSelected: () => void;
}

export const ActionContextButton = ({
  conditions,
  label,
  disabled,
  onActionSelected,
}: ActionContextButtonProps) => {
  // Filter messages where the condition is true
  const activeMessages = conditions.filter(({ condition }) => condition);

  return (
    <Box>
      <Tooltip title={activeMessages?.map((condition) => condition.message).join(' ')} arrow>
        <span>
          <Button
            variant='contained'
            onClick={onActionSelected}
            disabled={disabled}
            sx={{ animation: `${fadeIn} 0.3s ease-in` }}
            color='primary'
            size='small'
          >
            {label}
          </Button>
        </span>
      </Tooltip>
    </Box>
  );
};
