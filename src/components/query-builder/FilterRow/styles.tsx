// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import Box from '@mui/material/Box';
import TextField from '@mui/material/TextField';
import { alpha, styled } from '@mui/material/styles';

/**
 * Filter chip - main container for a filter row
 * Matches ConfigHub design patterns
 */
export const FilterChip = styled(Box, {
  shouldForwardProp: (prop) => prop !== '$locked',
})<{
  $locked?: boolean;
}>(({ theme, $locked }) => ({
  display: 'inline-flex',
  alignItems: 'center',
  height: 30,
  borderRadius: 8,
  backgroundColor: $locked
    ? alpha(theme.palette.action.selected, 0.08)
    : theme.palette.background.paper,
  border: `1px solid ${$locked
    ? 'transparent'
    : theme.palette.divider}`,
  fontSize: '0.875rem',
  color: $locked ? theme.palette.text.secondary : theme.palette.text.primary,
  overflow: 'hidden',
  transition: 'all 0.2s ease-in-out',
  ...(!$locked && {
    '&:hover': {
      borderColor: theme.palette.primary.main,
      boxShadow: '0px 2px 4px rgba(0, 0, 0, 0.05)',
    },
  }),
}));

/**
 * Field label section - clickable to change field type
 */
export const FieldSection = styled('button')(({ theme }) => ({
  display: 'flex',
  alignItems: 'center',
  gap: 4,
  height: '100%',
  padding: theme.spacing(0, 1.5),
  backgroundColor: 'transparent',
  border: 'none',
  borderRight: `1px solid ${theme.palette.divider}`,
  color: theme.palette.text.secondary,
  fontSize: '0.75rem',
  fontWeight: 600,
  cursor: 'pointer',
  fontFamily: theme.typography.fontFamily,
  letterSpacing: '0.5px',
  transition: 'all 0.2s ease-in-out',
  flexShrink: 0,
  whiteSpace: 'nowrap',
  '&:hover': {
    backgroundColor: alpha(theme.palette.primary.main, 0.08),
  },
  '& svg': {
    fontSize: 14,
    color: theme.palette.text.secondary,
  },
}));

/**
 * Operator section - clickable dropdown for operator selection
 */
export const OperatorSection = styled('button')(({ theme }) => ({
  display: 'flex',
  alignItems: 'center',
  gap: 2,
  height: '100%',
  padding: theme.spacing(0, 1),
  backgroundColor: 'transparent',
  border: 'none',
  borderRight: `1px solid ${theme.palette.divider}`,
  color: theme.palette.text.primary,
  fontSize: '0.8125rem',
  fontWeight: 400,
  cursor: 'pointer',
  fontFamily: theme.typography.fontFamily,
  transition: 'all 0.2s ease-in-out',
  '&:hover': {
    backgroundColor: alpha(theme.palette.primary.main, 0.08),
  },
  '& svg': {
    fontSize: 16,
    color: theme.palette.text.secondary,
  },
}));

/**
 * Value section container
 */
export const ValueSection = styled(Box)({
  display: 'flex',
  alignItems: 'center',
  height: '100%',
  minWidth: 80,
});

/**
 * Inline input for text/number/date values
 */
export const InlineInput = styled(TextField)(({ theme }) => ({
  '& .MuiInputBase-root': {
    height: 28,
    fontSize: '0.875rem',
    backgroundColor: 'transparent',
    fontFamily: theme.typography.fontFamily,
    '& fieldset': {
      border: 'none',
    },
  },
  '& .MuiInputBase-input': {
    padding: theme.spacing(0.5, 1),
    color: theme.palette.text.primary,
    '&::placeholder': {
      color: theme.palette.text.secondary,
      opacity: 0.6,
    },
  },
}));

/**
 * Select-style value button
 */
export const ValueButton = styled('button')(({ theme }) => ({
  display: 'flex',
  alignItems: 'center',
  gap: 4,
  height: '100%',
  padding: theme.spacing(0, 1.5),
  backgroundColor: 'transparent',
  border: 'none',
  color: theme.palette.text.primary,
  fontSize: '0.875rem',
  cursor: 'pointer',
  fontFamily: theme.typography.fontFamily,
  transition: 'all 0.2s ease-in-out',
  minWidth: 80,
  whiteSpace: 'nowrap',
  '&:hover': {
    backgroundColor: alpha(theme.palette.primary.main, 0.08),
  },
  '& svg': {
    fontSize: 16,
    color: theme.palette.text.secondary,
    flexShrink: 0,
  },
}));

/**
 * Remove button
 */
export const RemoveButton = styled('button')(({ theme }) => ({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  height: '100%',
  width: 28,
  minWidth: 28,
  padding: 0,
  backgroundColor: 'transparent',
  border: 'none',
  borderLeft: `1px solid ${theme.palette.divider}`,
  color: theme.palette.text.secondary,
  cursor: 'pointer',
  transition: 'all 0.2s ease-in-out',
  flexShrink: 0,
  '&:hover': {
    backgroundColor: alpha(theme.palette.error.main, 0.1),
    color: theme.palette.error.main,
  },
  '& svg': {
    fontSize: 16,
  },
}));

/**
 * Locked indicator - shows a lock icon for non-removable filters
 */
export const LockedIndicator = styled(Box)(({ theme }) => ({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  height: '100%',
  width: 28,
  minWidth: 28,
  padding: 0,
  color: theme.palette.text.disabled,
  flexShrink: 0,
  '& svg': {
    fontSize: 14,
  },
}));

/**
 * Static field label for locked filters
 */
export const LockedFieldSection = styled('span')(({ theme }) => ({
  display: 'flex',
  alignItems: 'center',
  gap: 4,
  height: '100%',
  padding: theme.spacing(0, 1.5),
  backgroundColor: 'transparent',
  borderRight: `1px solid ${alpha(theme.palette.divider, 0.5)}`,
  color: theme.palette.text.disabled,
  fontSize: '0.75rem',
  fontWeight: 600,
  fontFamily: theme.typography.fontFamily,
  letterSpacing: '0.5px',
  flexShrink: 0,
  whiteSpace: 'nowrap',
}));

/**
 * Static operator for locked filters
 */
export const LockedOperatorSection = styled('span')(({ theme }) => ({
  display: 'flex',
  alignItems: 'center',
  gap: 2,
  height: '100%',
  padding: theme.spacing(0, 1),
  backgroundColor: 'transparent',
  borderRight: `1px solid ${alpha(theme.palette.divider, 0.5)}`,
  color: theme.palette.text.secondary,
  fontSize: '0.8125rem',
  fontWeight: 400,
  fontFamily: theme.typography.fontFamily,
}));

/**
 * Static value for locked filters
 */
export const LockedValueSection = styled('span')(({ theme }) => ({
  display: 'flex',
  alignItems: 'center',
  height: '100%',
  padding: theme.spacing(0, 1.5),
  color: theme.palette.text.secondary,
  fontSize: '0.875rem',
  fontFamily: theme.typography.fontFamily,
}));
