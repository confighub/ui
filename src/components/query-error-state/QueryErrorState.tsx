// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { useState } from 'react';

import { CopyToClipboard } from '@/components/copy-to-clipboard/CopyToClipboard';
import { classifyQueryError, getApiErrorMessage } from '@/utility/error-functions';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { SerializedError } from '@reduxjs/toolkit';
import { FetchBaseQueryError } from '@reduxjs/toolkit/query';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';

export interface QueryErrorStateProps {
  /** The error to classify and describe. `undefined` renders the generic fallback copy. */
  error: FetchBaseQueryError | SerializedError | undefined;
  /** Called when the user clicks Retry. */
  onRetry: () => void;
  /** What failed to load, for the technical-detail "Failed query" line when `failedQuery` is not set — e.g. `components`. */
  context: string;
  /** The request that failed, e.g. `GET /space`. RTK Query does not carry this on the error object. */
  endpoint: string;
  /** Which of several concurrent queries produced `error`, e.g. `live spaces`. Falls back to `context` when absent. */
  failedQuery?: string;
}

/**
 * Full-panel error state for a page load that failed. Shows a cause-aware
 * headline and suggested action, a Retry button, and a closed-by-default
 * "Technical detail" disclosure with the endpoint, status, server message,
 * and which query failed.
 *
 * This is not a replacement for `ErrorBox`: `ErrorBox` is a dismissible
 * banner for a failed mutation; this fills the panel for a failed query.
 */
export const QueryErrorState = ({ error, onRetry, context, endpoint, failedQuery }: QueryErrorStateProps) => {
  const [isDetailOpen, setIsDetailOpen] = useState(false);

  const { headline, suggestion } = classifyQueryError(error, context);
  const serverMessage = getApiErrorMessage(error, '—');
  const status = error && 'status' in error ? String(error.status) : '—';
  const detailLabel = failedQuery ?? context;
  const detailText = `Endpoint: ${endpoint}\nStatus: ${status}\nMessage: ${serverMessage}\nFailed query: ${detailLabel}`;

  return (
    <Box
      data-testid='query-error-state'
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 1.5,
        maxWidth: 420,
        textAlign: 'center',
        px: 2,
      }}
    >
      <ErrorOutlineIcon sx={{ color: 'error.main', fontSize: 32 }} />
      <Typography variant='h3'>{headline}</Typography>
      <Typography variant='body2' color='text.secondary'>
        {suggestion}
      </Typography>
      <Button data-testid='query-error-retry' variant='contained' color='primary' size='small' onClick={onRetry}>
        Retry
      </Button>
      <Box sx={{ width: '100%' }}>
        <Button
          data-testid='query-error-detail-toggle'
          variant='text'
          size='small'
          onClick={() => setIsDetailOpen((open) => !open)}
          endIcon={isDetailOpen ? <ExpandLessIcon /> : <ExpandMoreIcon />}
          sx={{ color: 'text.secondary' }}
        >
          Technical detail
        </Button>
        {isDetailOpen && (
          <Box
            data-testid='query-error-detail'
            sx={{
              mt: 1,
              p: 1.5,
              textAlign: 'left',
              border: '1px solid',
              borderColor: 'divider',
              borderRadius: 'var(--r-md)',
              bgcolor: 'background.default',
            }}
          >
            <Typography variant='body2' sx={{ fontFamily: 'var(--font-mono)' }}>
              Endpoint: {endpoint}
            </Typography>
            <Typography variant='body2' sx={{ fontFamily: 'var(--font-mono)' }}>
              Status: {status}
            </Typography>
            <Typography variant='body2' sx={{ fontFamily: 'var(--font-mono)' }}>
              Message: {serverMessage}
            </Typography>
            <Typography variant='body2' sx={{ fontFamily: 'var(--font-mono)' }}>
              Failed query: {detailLabel}
            </Typography>
            <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 0.5 }}>
              <CopyToClipboard text={detailText} title='Copy technical detail' />
            </Box>
          </Box>
        )}
      </Box>
    </Box>
  );
};
