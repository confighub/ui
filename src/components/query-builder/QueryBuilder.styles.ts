// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import Box from '@mui/material/Box';
import { alpha, styled } from '@mui/material/styles';

// Container - minimal layout
export const Container = styled(Box)(({ theme }) => ({
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  gap: theme.spacing(1),
  padding: 0,
}));

// Wrapper for filter chips
export const FiltersWrapper = styled(Box)(({ theme }) => ({
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  gap: theme.spacing(1),
}));

// Action button base style
export const ActionButton = styled('button')(({ theme }) => ({
  display: 'inline-flex',
  alignItems: 'center',
  gap: theme.spacing(0.5),
  padding: theme.spacing(0.5, 1),
  fontSize: '0.8125rem',
  fontWeight: 500,
  color: theme.palette.text.secondary,
  backgroundColor: 'transparent',
  border: 'none',
  borderRadius: 4,
  cursor: 'pointer',
  fontFamily: theme.typography.fontFamily,
  transition: 'all 0.2s ease-in-out',
  '& svg': {
    fontSize: 16,
  },
}));

// Clear all button - matches ConfigHub link style
export const ClearButton = styled(ActionButton)(({ theme }) => ({
  '&:hover': {
    color: theme.palette.error.main,
    backgroundColor: alpha(theme.palette.error.main, 0.08),
  },
}));


// Popout header
export const PopoutHeader = styled(Box)(({ theme }) => ({
  display: 'flex',
  alignItems: 'center',
  gap: theme.spacing(1),
  marginBottom: theme.spacing(2),
  color: theme.palette.text.primary,
  fontSize: '0.875rem',
  fontWeight: 600,
  fontFamily: theme.typography.fontFamily,
  '& svg': {
    color: theme.palette.primary.main,
  },
}));

// Form field wrapper
export const FormField = styled(Box)(({ theme }) => ({
  marginBottom: theme.spacing(2),
  '&:last-of-type': {
    marginBottom: 0,
  },
}));

// Save confirm button in popout
export const SaveConfirmButton = styled('button', {
  shouldForwardProp: (prop) => prop !== '$loading',
})<{ $loading?: boolean }>(({ theme, $loading }) => ({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: theme.spacing(0.75),
  width: '100%',
  padding: theme.spacing(1, 2),
  marginTop: theme.spacing(2),
  fontSize: '0.875rem',
  fontWeight: 500,
  color: theme.palette.primary.contrastText,
  backgroundColor: theme.palette.primary.main,
  border: 'none',
  borderRadius: 8,
  cursor: $loading ? 'wait' : 'pointer',
  fontFamily: theme.typography.fontFamily,
  transition: 'all 0.2s ease-in-out',
  opacity: $loading ? 0.7 : 1,
  '&:hover:not(:disabled)': {
    backgroundColor: theme.palette.primary.dark,
  },
  '&:disabled': {
    opacity: 0.5,
    cursor: 'not-allowed',
  },
  '& svg': {
    fontSize: 18,
  },
}));

// Error message
export const ErrorMessage = styled(Box)(({ theme }) => ({
  display: 'flex',
  alignItems: 'flex-start',
  gap: theme.spacing(1),
  padding: theme.spacing(1.5),
  marginTop: theme.spacing(1.5),
  backgroundColor: alpha(theme.palette.error.main, 0.08),
  borderRadius: 8,
  color: theme.palette.error.main,
  fontSize: '0.8125rem',
  fontWeight: 500,
  lineHeight: 1.4,
}));
