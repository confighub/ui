// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { FunctionResultList } from '@/components/function-result-list/FunctionResultList';
import { ServerErrorBox } from '@/components/styled';
import type {
  ExtendedUnitRead,
  FunctionInvocationsResponse,
  FunctionSignature,
} from '@confighub/rtk-query';
import { type OutputType } from '@/types';
import { TOP_NAV_HEIGHT } from '@/utility/constants';
import CloseIcon from '@mui/icons-material/Close';
import FunctionsIcon from '@mui/icons-material/Functions';
import MinimizeIcon from '@mui/icons-material/Minimize';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import Drawer from '@mui/material/Drawer';
import IconButton from '@mui/material/IconButton';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemText from '@mui/material/ListItemText';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { styled } from '@mui/material/styles';

import { useFunctionInvocationResults } from '../../hooks/useFunctionInvocationResults';

const MinimizedView = styled(Paper)(({ theme }) => ({
  position: 'fixed',
  bottom: theme.spacing(10),
  right: theme.spacing(2),
  padding: theme.spacing(1, 2),
  borderRadius: theme.shape.borderRadius * 2,
  backgroundColor: theme.palette.background.paper,
  boxShadow: theme.shadows[8],
  cursor: 'pointer',
  transition: 'all 0.2s ease-in-out',
  zIndex: theme.zIndex.snackbar,
  '&:hover': {
    boxShadow: theme.shadows[12],
    transform: 'translateY(-2px)',
  },
}));

export interface IFunctionInvocationDrawerProps {
  isOpen: boolean;
  isMinimized: boolean;
  onClose: () => void;
  onMinimize: () => void;
  onMaximize: () => void;
  onCancelAll: () => void;

  functionInvocationResponse: FunctionInvocationsResponse[];
  preInvocationUnits: ExtendedUnitRead[];
  functionSignature: FunctionSignature | null;
  apiError?: string;
  onClearErrors: () => void;
}

export const FunctionInvocationDrawer = ({
  isMinimized,
  onMaximize,
  isOpen,
  onMinimize,
  onClose,
  onClearErrors,
  functionSignature,
  functionInvocationResponse,
  preInvocationUnits,
  apiError,
}: IFunctionInvocationDrawerProps) => {
  const { items, isMutating, isValidating, errors, isLoading } = useFunctionInvocationResults({
    functionInvocationResponse,
    preInvocationUnits,
    functionSignature,
    apiError,
  });

  if (isMinimized) {
    return (
      <MinimizedView onClick={onMaximize}>
        <Stack direction='row' alignItems='center' spacing={1}>
          <Stack direction='row' alignItems='center' spacing={1}>
            <FunctionsIcon color='primary' />
            <Typography variant='body2' fontWeight='medium'>
              {functionSignature?.FunctionName || 'Function'}
            </Typography>
          </Stack>

          <Chip label={`${items.length} result(s)`} size='small' variant='outlined' />
          {errors.length > 0 && (
            <Chip
              label={`${errors.length} error(s)`}
              size='small'
              color='error'
              variant='outlined'
            />
          )}
        </Stack>
      </MinimizedView>
    );
  }

  return (
    <Drawer
      anchor='right'
      open={isOpen && !isMinimized}
      onClose={onMinimize}
      variant='persistent'
      sx={{
        '& .MuiDrawer-paper': {
          width: { xs: 1200 },
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
          }}
        >
          {/* Top row with minimize and close buttons */}
          <Stack direction='row' justifyContent='space-between' alignItems='center'>
            {/* Title */}
            <Typography variant='h6' fontWeight='bold'>
              Function Invocation Results
            </Typography>
            <Stack direction='row' spacing={1}>
              <IconButton
                onClick={onMinimize}
                size='small'
                sx={{ color: 'text.secondary' }}
                title='Minimize'
              >
                <MinimizeIcon />
              </IconButton>
              <IconButton
                onClick={onClose}
                size='small'
                sx={{ color: 'text.secondary' }}
                title='Close'
              >
                <CloseIcon />
              </IconButton>
            </Stack>
          </Stack>
        </Box>
        {/* Content */}
        <Box>
          {errors.length > 0 && (
            <ServerErrorBox
              $display={true}
              sx={{ mx: 2, mt: 2, maxHeight: '50px', overflowY: 'auto', p: 1 }}
            >
              <List
                data-testid='server-error-list'
                sx={{
                  listStyleType: 'disc',
                  pl: 2,
                  borderRadius: '8px',
                  height: '-webkit-fill-available',
                }}
              >
                {errors.map((error, index) => (
                  <ListItem
                    key={index}
                    sx={{
                      display: 'list-item',
                      p: 0,
                    }}
                  >
                    <ListItemText
                      primary={<Typography variant='caption'>Error: {error}</Typography>}
                    />
                  </ListItem>
                ))}
              </List>

              <IconButton
                aria-label='close'
                onClick={onClearErrors}
                sx={{
                  color: (theme) => theme.palette.error.main,
                }}
                size='small'
              >
                <CloseIcon />
              </IconButton>
            </ServerErrorBox>
          )}

          <FunctionResultList
            items={items}
            isValidating={isValidating}
            isMutating={isMutating}
            isLoading={isLoading}
            treeViewTitle='Functions'
            containerHeight={`calc(100vh - ${TOP_NAV_HEIGHT + 68}px)`}
            mainSectionHeight={`calc(100vh - ${TOP_NAV_HEIGHT + 130}px)`}
            outputType={(functionSignature?.OutputInfo?.OutputType as OutputType) || 'YAML'}
          />
        </Box>
      </Box>
    </Drawer>
  );
};
