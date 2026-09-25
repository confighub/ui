// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { CopyToClipboard } from '@/components/copy-to-clipboard/CopyToClipboard';
import { ArrowBack as ArrowBackIcon } from '@mui/icons-material';
import { Box, Button, Chip, Drawer, Stack, Typography } from '@mui/material';

import { getResourceTypeLabel } from '../../components';
import { ProcessedFunction } from '../../utils/function-browser-utils';

interface FunctionDetailsDrawerProps {
  open: boolean;
  onClose: () => void;
  function: ProcessedFunction | null;
}

export const FunctionDetailsDrawer = ({
  open,
  onClose,
  function: func,
}: FunctionDetailsDrawerProps) => {
  if (!func) return null;

  const resourceTypeLabel = getResourceTypeLabel(func?.resourceTypes);

  const handleClose = () => {
    onClose();
  };

  const renderParameters = () => {
    if (!func.Parameters || func.Parameters.length === 0) {
      return (
        <Typography variant='body2' color='text.secondary'>
          No parameters
        </Typography>
      );
    }

    const requiredCount = func.RequiredParameters || 0;

    return (
      <Stack spacing={1}>
        {func.Parameters.map((param, index) => {
          const isRequired = index < requiredCount;

          return (
            <Box
              key={param.ParameterName}
              sx={{
                p: 1.5,
                border: '1px solid',
                borderColor: 'divider',
                borderRadius: '6px',
                backgroundColor: 'background.paper',
              }}
            >
              <Stack direction='row' spacing={1} alignItems='center' sx={{ mb: 0.5 }}>
                <Typography
                  variant='body2'
                  component='code'
                  sx={{
                    fontWeight: 600,
                    fontFamily: 'monospace',
                  }}
                >
                  {param.ParameterName}
                </Typography>
                {isRequired && (
                  <Chip
                    label='Required'
                    size='small'
                    color='error'
                    sx={{
                      fontSize: '0.65rem',
                      height: '18px',
                    }}
                  />
                )}
                <Chip
                  label={param.DataType || 'string'}
                  size='small'
                  sx={{
                    fontSize: '0.65rem',
                    height: '18px',
                    backgroundColor: 'grey.100',
                  }}
                />
                {param.Example && (
                  <CopyToClipboard
                    text={param.Example ?? ''}
                    title='Copy example to clipboard'
                    sx={{ ml: 'auto !important' }}
                  />
                )}
              </Stack>
              <Typography variant='caption' color='text.secondary' sx={{ display: 'block' }}>
                {param.Description || 'No description provided'}
              </Typography>
              {param.Example && (
                <Typography
                  variant='caption'
                  sx={{
                    display: 'block',
                    mt: 0.5,
                    fontFamily: 'monospace',
                    color: 'text.secondary',
                    backgroundColor: 'grey.50',
                    p: 0.5,
                    borderRadius: '4px',
                  }}
                >
                  {param.Example}
                </Typography>
              )}
            </Box>
          );
        })}
      </Stack>
    );
  };

  const renderResourceTypes = () => {
    const resourceTypes = func.AffectedResourceTypes || [];

    if (resourceTypes.length === 0) {
      return (
        <Typography variant='body2' color='text.secondary'>
          No specific resource types
        </Typography>
      );
    }

    return (
      <Stack direction='row' spacing={0.5} sx={{ flexWrap: 'wrap', gap: 0.5 }}>
        {resourceTypes.map((type, index) => (
          <Chip
            key={index}
            label={type === '*' ? 'All Resource Types' : type}
            variant='outlined'
            size='small'
            sx={{ fontSize: '0.7rem', height: '22px' }}
          />
        ))}
      </Stack>
    );
  };

  return (
    <Drawer
      anchor='right'
      open={open}
      onClose={handleClose}
      sx={{
        '& .MuiDrawer-paper': {
          width: { xs: 1000 },
        },
      }}
    >
      <Box
        sx={{
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Header */}
        <Box
          sx={{
            p: 2,
            borderBottom: '1px solid',
            borderColor: 'divider',
          }}
        >
          <Stack direction='row' sx={{ justifyContent: 'space-between', mb: 2 }}>
            <Button
              startIcon={<ArrowBackIcon />}
              onClick={handleClose}
              sx={{ color: 'text.secondary' }}
            >
              Back to Functions
            </Button>
          </Stack>

          <Typography
            variant='h5'
            component='h1'
            sx={{
              fontWeight: 600,
              mb: 1,
            }}
          >
            {func.FunctionName}
          </Typography>

          <Typography variant='body2' color='text.secondary' sx={{ mb: 1.5 }}>
            {func.Description}
          </Typography>
        </Box>

        {/* Content */}
        <Box sx={{ flex: 1, overflow: 'auto', p: 2, backgroundColor: 'rgb(249, 250, 251)' }}>
          {/* Properties */}
          <Box
            sx={{
              backgroundColor: 'background.paper',
              border: '1px solid',
              borderColor: 'divider',
              borderRadius: '6px',
              overflow: 'hidden',
              mb: 1,
            }}
          >
            <Box
              sx={{
                px: 2,
                py: 1,
                borderBottom: '1px solid',
                borderColor: 'divider',
                backgroundColor: 'grey.50',
              }}
            >
              <Typography variant='caption' fontWeight={600} color='text.secondary'>
                PROPERTIES
              </Typography>
            </Box>
            <Box sx={{ p: 2 }}>
              <Stack
                divider={<Box sx={{ borderBottom: '1px solid', borderColor: 'divider' }} />}
              >
                {/* Type */}
                <Stack
                  direction='row'
                  sx={{
                    py: 1.25,
                    '&:hover': { backgroundColor: 'grey.50' },
                  }}
                >
                  <Typography
                    variant='caption'
                    color='text.secondary'
                    sx={{ minWidth: '120px', fontWeight: 500 }}
                  >
                    Type
                  </Typography>
                  <Typography variant='body2' fontWeight={500}>
                    {func.FunctionType}
                  </Typography>
                </Stack>

                {/* Resource Type */}
                <Stack
                  direction='row'
                  sx={{
                    py: 1.25,
                    '&:hover': { backgroundColor: 'grey.50' },
                  }}
                >
                  <Typography
                    variant='caption'
                    color='text.secondary'
                    sx={{ minWidth: '120px', fontWeight: 500 }}
                  >
                    Resource Type
                  </Typography>
                  <Typography variant='body2' fontWeight={500}>
                    {resourceTypeLabel || 'N/A'}
                  </Typography>
                </Stack>

                {/* Required Parameters */}
                <Stack
                  direction='row'
                  sx={{
                    py: 1.25,
                    '&:hover': { backgroundColor: 'grey.50' },
                  }}
                >
                  <Typography
                    variant='caption'
                    color='text.secondary'
                    sx={{ minWidth: '120px', fontWeight: 500 }}
                  >
                    Required Params
                  </Typography>
                  <Typography variant='body2' fontWeight={500}>
                    {func.RequiredParameters || 0}
                  </Typography>
                </Stack>

                {/* Variable Arguments */}
                <Stack
                  direction='row'
                  sx={{
                    py: 1.25,
                    '&:hover': { backgroundColor: 'grey.50' },
                  }}
                >
                  <Typography
                    variant='caption'
                    color='text.secondary'
                    sx={{ minWidth: '120px', fontWeight: 500 }}
                  >
                    Variable Args
                  </Typography>
                  <Typography variant='body2' fontWeight={500}>
                    {func.VarArgs ? 'Yes' : 'No'}
                  </Typography>
                </Stack>

                {/* Function Properties */}
                <Stack
                  direction='row'
                  sx={{
                    py: 1.25,
                    '&:hover': { backgroundColor: 'grey.50' },
                  }}
                >
                  <Typography
                    variant='caption'
                    color='text.secondary'
                    sx={{ minWidth: '120px', fontWeight: 500 }}
                  >
                    Attributes
                  </Typography>
                  <Stack direction='row' spacing={0.5} sx={{ flexWrap: 'wrap', gap: 0.5 }}>
                    {func.Mutating && (
                      <Chip
                        label='Mutating'
                        size='small'
                        sx={{
                          backgroundColor: 'transparent',
                          border: '1px solid',
                          borderColor: 'warning.main',
                          color: 'warning.main',
                          fontSize: '0.65rem',
                          height: '20px',
                        }}
                      />
                    )}
                    {func.Validating && (
                      <Chip
                        label='Validating'
                        size='small'
                        sx={{
                          backgroundColor: 'transparent',
                          border: '1px solid',
                          borderColor: 'success.main',
                          color: 'success.main',
                          fontSize: '0.65rem',
                          height: '20px',
                        }}
                      />
                    )}
                    {func.Idempotent && (
                      <Chip
                        label='Idempotent'
                        size='small'
                        sx={{
                          backgroundColor: 'transparent',
                          border: '1px solid',
                          borderColor: 'primary.main',
                          color: 'primary.main',
                          fontSize: '0.65rem',
                          height: '20px',
                        }}
                      />
                    )}
                    {func.Hermetic && (
                      <Chip
                        label='Hermetic'
                        size='small'
                        sx={{
                          backgroundColor: 'transparent',
                          border: '1px solid',
                          borderColor: 'info.main',
                          color: 'info.main',
                          fontSize: '0.65rem',
                          height: '20px',
                        }}
                      />
                    )}
                    {!func.Mutating &&
                      !func.Validating &&
                      !func.Idempotent &&
                      !func.Hermetic && (
                        <Typography variant='body2' color='text.secondary'>
                          None
                        </Typography>
                      )}
                  </Stack>
                </Stack>
              </Stack>
            </Box>
          </Box>

          {/* Parameters */}
          <Box
            sx={{
              backgroundColor: 'background.paper',
              border: '1px solid',
              borderColor: 'divider',
              borderRadius: '6px',
              overflow: 'hidden',
              mb: 1,
            }}
          >
            <Box
              sx={{
                px: 2,
                py: 1,
                borderBottom: '1px solid',
                borderColor: 'divider',
                backgroundColor: 'grey.50',
              }}
            >
              <Typography variant='caption' fontWeight={600} color='text.secondary'>
                PARAMETERS
                {func.Parameters && func.Parameters.length > 0 && (
                  <Chip
                    label={func.Parameters.length}
                    size='small'
                    sx={{
                      ml: 1,
                      height: '16px',
                      fontSize: '0.65rem',
                      backgroundColor: 'grey.300',
                    }}
                  />
                )}
              </Typography>
            </Box>
            <Box sx={{ p: 2 }}>{renderParameters()}</Box>
          </Box>

          {/* Affected Resource Types */}
          <Box
            sx={{
              backgroundColor: 'background.paper',
              border: '1px solid',
              borderColor: 'divider',
              borderRadius: '6px',
              overflow: 'hidden',
              mb: 1,
            }}
          >
            <Box
              sx={{
                px: 2,
                py: 1,
                borderBottom: '1px solid',
                borderColor: 'divider',
                backgroundColor: 'grey.50',
              }}
            >
              <Typography variant='caption' fontWeight={600} color='text.secondary'>
                AFFECTED RESOURCE TYPES
              </Typography>
            </Box>
            <Box sx={{ p: 2 }}>{renderResourceTypes()}</Box>
          </Box>
        </Box>
      </Box>
    </Drawer>
  );
};
