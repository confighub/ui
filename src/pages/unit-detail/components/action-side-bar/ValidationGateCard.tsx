// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { HoverCard } from '@/components/styled';
import {
  ExtendedTriggerRead,
  FunctionSignature,
  useListFunctionsQuery,
} from '@confighub/rtk-query';
import { parseGateName } from '@/utility/name-format-functions';
import { parseValidationResult } from '@/utility/object-functions';
import { isIDInvalid } from '@/utility/validation-functions';
import ExpandLess from '@mui/icons-material/ExpandLess';
import ExpandMore from '@mui/icons-material/ExpandMore';
import PlayArrowRoundedIcon from '@mui/icons-material/PlayArrowRounded';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Collapse,
  Link,
  Stack,
  Typography,
} from '@mui/material';

import { ValidationResult } from './ActionSideBar';

const formatGateName = (name: string) => {
  return name.replace(/-/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase());
};

const formatRelativeTime = (timestamp: number): string => {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);

  if (seconds < 60) {
    return 'just now';
  }

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  }

  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  }

  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
};

interface ValidationGateCardProps {
  gateName: string;
  trigger: ExtendedTriggerRead | undefined;
  validation: ValidationResult | undefined;
  selectedFunction: FunctionSignature | undefined;
  isValidating: boolean;
  isWarning?: boolean;
  spaceId: string | undefined;
  onRunClick: () => void;
}

export const ValidationGateCard = ({
  gateName,
  trigger,
  validation,
  selectedFunction,
  isValidating,
  isWarning = false,
  spaceId,
  onRunClick,
}: ValidationGateCardProps) => {
  const navigate = useNavigate();
  const [expanded, setExpanded] = useState(false);
  // Which of the Trigger's results is this gate's: a numbered gate names its function's position.
  const resultIndex = (parseGateName(gateName).functionIndex ?? 1) - 1;

  // A Trigger's function is hosted on the worker referenced by the Trigger's own
  // BridgeWorkerID, which is independent of the Unit's Target worker. Fetch that worker's
  // functions to resolve the signature (e.g. Description). Skipped for builtin triggers,
  // which have no BridgeWorkerID and are covered by the passed-in `selectedFunction`.
  const bridgeWorkerID = trigger?.Trigger?.BridgeWorkerID;
  const toolchainType = trigger?.Trigger?.ToolchainType;
  const functionName = trigger?.Trigger?.FunctionName;
  const { data: workerFunctions } = useListFunctionsQuery(
    {
      spaceId: spaceId || '',
      entity: 'worker',
      id: bridgeWorkerID || '',
    },
    {
      skip: isIDInvalid(spaceId) || isIDInvalid(bridgeWorkerID),
    },
  );
  // The function name is carried directly on the Trigger; the signature (for Description)
  // comes from the builtin catalog or, for custom functions, the Trigger's worker.
  const resolvedFunction =
    selectedFunction ||
    (toolchainType && functionName
      ? workerFunctions?.[toolchainType]?.[functionName]
      : undefined);

  // Determine validation state for visual indicators
  const getValidationState = () => {
    if (validation?.loading) return 'loading';
    if (validation?.error) return 'error';
    if (validation?.result?.Error) return 'error';

    if (
      validation?.result?.Outputs?.['ValidationResult'] ||
      validation?.result?.Outputs?.['ValidationResultList']
    ) {
      const validationCheck = parseValidationResult(
        validation.result.Outputs['ValidationResult'] ||
          validation.result.Outputs['ValidationResultList'] ||
          '',
        resultIndex,
      );
      return validationCheck.passed ? 'success' : 'error';
    }

    return null;
  };

  const validationState = getValidationState();

  const handleRunClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onRunClick();
  };

  const handleToggleExpand = (e: React.MouseEvent) => {
    e.stopPropagation();
    setExpanded(!expanded);
  };

  const handleCardClick = (e: React.MouseEvent<HTMLDivElement>) => {
    // Don't expand if clicking on interactive elements
    const target = e.target as HTMLElement;
    if (
      target.closest('button') ||
      target.closest('a') ||
      target.tagName === 'BUTTON' ||
      target.tagName === 'A'
    ) {
      return;
    }

    // Don't expand if user is selecting text
    const selection = window.getSelection();
    if (selection && selection.toString().length > 0) {
      return;
    }

    setExpanded(!expanded);
  };

  return (
    <HoverCard
      variant='outlined'
      onClick={handleCardClick}
      sx={{
        borderLeft: validationState === 'error' ? '4px solid' : undefined,
        borderLeftColor:
          validationState === 'error'
            ? isWarning
              ? 'warning.main'
              : 'error.main'
            : undefined,
        borderColor:
          validationState === 'success'
            ? 'success.main'
            : isWarning
              ? 'warning.light'
              : undefined,
        cursor: 'pointer',
        transition: 'border-color 0.2s, box-shadow 0.2s',
        '&:hover': {
          borderColor: 'primary.main',
          boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
          '& .show-details-icon': {
            transform: expanded ? 'translateY(-2px)' : 'translateY(2px)',
          },
        },
      }}
    >
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'start',
          mb: 0.5,
        }}
      >
        <Stack direction='column' spacing={0.5} alignItems='start' sx={{ flex: 1 }}>
          {spaceId ? (
            <Link
              href={`/spaces/${spaceId}?tab=1`}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                navigate(`/spaces/${spaceId}?tab=1`);
              }}
              sx={{
                textDecoration: 'underline',
                color: 'text.primary',
                fontFamily: 'Roboto, sans-serif',
                fontWeight: 600,
                fontSize: '0.8rem',
                '&:hover': {
                  opacity: 0.7,
                },
              }}
            >
              {formatGateName(trigger?.Trigger?.DisplayName || '')?.toLocaleUpperCase()}
            </Link>
          ) : (
            <Typography
              variant='body2'
              sx={{ fontWeight: 600, fontSize: '0.8rem', lineHeight: '20px' }}
            >
              {formatGateName(trigger?.Trigger?.DisplayName || '')?.toLocaleUpperCase()}
            </Typography>
          )}

          {validation?.timestamp && (
            <Typography
              variant='caption'
              sx={{ color: 'text.secondary', fontSize: '0.65rem' }}
            >
              Last checked: {formatRelativeTime(validation.timestamp)}
            </Typography>
          )}

          <Stack
            direction='row'
            spacing={0.5}
            alignItems='center'
            flexWrap='wrap'
            sx={{ gap: 0.5 }}
          >
            <Chip
              label={trigger?.Trigger?.Warn ? 'Warn' : 'Blocking'}
              color='primary'
              size='small'
              sx={{ height: 18, fontSize: '0.6rem' }}
            />
            <Chip
              label={isValidating ? 'Validating' : 'Non Validating'}
              size='small'
              color='info'
              sx={{ height: 18, fontSize: '0.6rem' }}
            />
            <Chip
              label={trigger?.Trigger?.Event}
              color='warning'
              size='small'
              sx={{ height: 18, fontSize: '0.6rem' }}
            />
            {validation?.loading && <CircularProgress color='primary' size={16} />}
          </Stack>
        </Stack>
        <Button
          variant='text'
          size='small'
          onClick={handleRunClick}
          sx={{
            minWidth: 'auto',
            textTransform: 'none',
          }}
          color='primary'
          endIcon={<PlayArrowRoundedIcon />}
        >
          Run
        </Button>
      </Box>

      {/* Show validation status inline when collapsed */}
      {validationState && !expanded && (
        <Box sx={{ mt: 1 }}>
          {validationState === 'loading' && (
            <Stack direction='row' spacing={0.5} alignItems='center'>
              <CircularProgress size={12} />
              <Typography
                variant='caption'
                sx={{ color: 'text.secondary', fontSize: '0.7rem' }}
              >
                Checking validation...
              </Typography>
            </Stack>
          )}
          {validationState === 'error' && (
            <Alert severity={isWarning ? 'warning' : 'error'} sx={{ py: 0.25, px: 1 }}>
              <Typography
                variant='caption'
                sx={{
                  fontSize: '0.7rem',
                  fontWeight: 600,
                  display: '-webkit-box',
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: 'vertical',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {validation?.error ||
                  validation?.result?.Error?.Message ||
                  parseValidationResult(
                    validation?.result?.Outputs?.['ValidationResult'] ||
                      validation?.result?.Outputs?.['ValidationResultList'] ||
                      '',
                    resultIndex,
                  ).message}
              </Typography>
            </Alert>
          )}
          {validationState === 'success' && (
            <Alert severity='success' sx={{ py: 0.25, px: 1 }}>
              <Typography variant='caption' sx={{ fontSize: '0.7rem', fontWeight: 600 }}>
                Validation passed
              </Typography>
            </Alert>
          )}
        </Box>
      )}

      <Box
        onClick={handleToggleExpand}
        className='show-details-button'
        sx={{
          display: 'inline-flex',
          alignItems: 'center',
          mt: 1,
          color: 'text.secondary',
          fontSize: '0.75rem',
          gap: 0.5,
          cursor: 'pointer',
        }}
      >
        <Typography variant='caption' sx={{ fontSize: '0.75rem' }}>
          {expanded ? 'Hide Details' : 'Show Details'}
        </Typography>
        <Box
          className='show-details-icon'
          sx={{
            display: 'flex',
            alignItems: 'center',
            transition: 'transform 0.2s',
          }}
        >
          {expanded ? <ExpandLess fontSize='small' /> : <ExpandMore fontSize='small' />}
        </Box>
      </Box>

      <Collapse in={expanded} timeout='auto' unmountOnExit>
        <Box sx={{ mt: 2, pt: 2, borderTop: '1px solid', borderColor: 'divider' }}>
          <Stack spacing={2}>
            {/* Function Information Section */}
            <Box>
              <Typography
                variant='caption'
                sx={{
                  color: 'text.secondary',
                  textTransform: 'uppercase',
                  fontSize: '0.65rem',
                  fontWeight: 600,
                  letterSpacing: '0.5px',
                }}
              >
                Function Details
              </Typography>
              <Stack spacing={0.75} sx={{ mt: 1 }}>
                <Box sx={{ display: 'flex', gap: 1 }}>
                  <Typography
                    variant='body2'
                    sx={{ fontSize: '0.75rem', fontWeight: 600, minWidth: '100px' }}
                  >
                    Name:
                  </Typography>
                  <Typography
                    variant='body2'
                    sx={{
                      fontSize: '0.75rem',
                      color: 'text.secondary',
                      wordBreak: 'break-word',
                    }}
                  >
                    {functionName || resolvedFunction?.FunctionName || 'N/A'}
                  </Typography>
                </Box>
                {resolvedFunction?.Description && (
                  <Box sx={{ display: 'flex', gap: 1 }}>
                    <Typography
                      variant='body2'
                      sx={{ fontSize: '0.75rem', fontWeight: 600, minWidth: '100px' }}
                    >
                      Description:
                    </Typography>
                    <Typography
                      variant='body2'
                      sx={{
                        fontSize: '0.75rem',
                        color: 'text.secondary',
                        wordBreak: 'break-word',
                      }}
                    >
                      {resolvedFunction.Description}
                    </Typography>
                  </Box>
                )}
              </Stack>
            </Box>

            {/* Parameters Section */}
            {trigger?.Trigger?.Arguments && trigger.Trigger.Arguments.length > 0 && (
              <Box>
                <Typography
                  variant='caption'
                  sx={{
                    color: 'text.secondary',
                    textTransform: 'uppercase',
                    fontSize: '0.65rem',
                    fontWeight: 600,
                    letterSpacing: '0.5px',
                  }}
                >
                  Parameters
                </Typography>
                <Stack spacing={0.75} sx={{ mt: 1 }}>
                  {trigger.Trigger.Arguments.map((argument) => (
                    <Box key={argument.ParameterName} sx={{ display: 'flex', gap: 1 }}>
                      <Typography
                        variant='body2'
                        sx={{ fontSize: '0.75rem', fontWeight: 600, minWidth: '100px' }}
                      >
                        {argument.ParameterName}:
                      </Typography>
                      <Typography
                        variant='body2'
                        sx={{
                          fontSize: '0.75rem',
                          color: 'text.secondary',
                          wordBreak: 'break-word',
                        }}
                      >
                        {argument.Value}
                      </Typography>
                    </Box>
                  ))}
                </Stack>
              </Box>
            )}

            {/* Validation Results Section */}
            {isValidating && validation && !validation.loading && (
              <Box>
                <Typography
                  variant='caption'
                  sx={{
                    color: 'text.secondary',
                    textTransform: 'uppercase',
                    fontSize: '0.65rem',
                    fontWeight: 600,
                    letterSpacing: '0.5px',
                    mb: 1,
                    display: 'block',
                  }}
                >
                  Validation Result
                </Typography>
                {validation.error ? (
                  <Alert severity='error' sx={{ py: 0.5 }}>
                    <Typography variant='caption' sx={{ fontSize: '0.75rem' }}>
                      {validation.error}
                    </Typography>
                  </Alert>
                ) : validation.result?.Error ? (
                  <Alert severity='error' sx={{ py: 0.5 }}>
                    <Typography
                      variant='caption'
                      fontWeight={600}
                      sx={{ fontSize: '0.75rem' }}
                    >
                      {validation.result.Error.Message}
                    </Typography>
                    {validation.result.Error.Details?.map((detail, index) => (
                      <Typography
                        key={index}
                        variant='caption'
                        display='block'
                        sx={{ mt: 0.5, fontSize: '0.7rem' }}
                      >
                        • {detail}
                      </Typography>
                    ))}
                  </Alert>
                ) : validation.result?.Outputs?.['ValidationResult'] ||
                  validation.result?.Outputs?.['ValidationResultList'] ? (
                  <Alert
                    severity={
                      parseValidationResult(
                        validation?.result?.Outputs?.['ValidationResult'] ||
                          validation?.result?.Outputs?.['ValidationResultList'] ||
                          '',
                        resultIndex,
                      ).passed
                        ? 'success'
                        : 'error'
                    }
                    sx={{ py: 0.5 }}
                  >
                    <Typography
                      variant='caption'
                      fontWeight='bold'
                      display='block'
                      sx={{ fontSize: '0.75rem' }}
                    >
                      {
                        parseValidationResult(
                          validation?.result?.Outputs?.['ValidationResult'] ||
                            validation?.result?.Outputs?.['ValidationResultList'] ||
                            '',
                          resultIndex,
                        ).message
                      }
                    </Typography>
                  </Alert>
                ) : (
                  <Alert severity='success' sx={{ py: 0.5 }}>
                    <Typography variant='caption' sx={{ fontSize: '0.75rem' }}>
                      Validation completed successfully
                    </Typography>
                  </Alert>
                )}
              </Box>
            )}
          </Stack>
        </Box>
      </Collapse>
    </HoverCard>
  );
};
