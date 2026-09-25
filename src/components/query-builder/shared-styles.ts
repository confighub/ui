// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import { alpha, styled } from '@mui/material/styles';

/**
 * Dropdown menu container - used for filter field, operator, and value dropdowns
 */
export const DropdownMenu = styled(Paper)(({ theme }) => ({
  minWidth: 180,
  maxHeight: 480,
  overflow: 'auto',
  borderRadius: 8,
  backgroundColor: theme.palette.background.paper,
  border: `1px solid ${theme.palette.divider}`,
  boxShadow: '0px 4px 12px rgba(0, 0, 0, 0.08)',
  marginTop: theme.spacing(0.5),
  padding: theme.spacing(0, 0, 0.5, 0),
  '& .MuiMenuItem-root': {
    fontSize: '0.875rem',
    padding: theme.spacing(1, 1.5),
    minHeight: 36,
    fontFamily: theme.typography.fontFamily,
    '&:hover': {
      backgroundColor: alpha(theme.palette.primary.main, 0.08),
    },
  },
}));

/**
 * Menu section header - used for grouping menu items
 */
export const MenuSection = styled(Typography)(({ theme }) => ({
  padding: theme.spacing(1, 1.5, 0.5),
  fontSize: '0.6875rem',
  fontWeight: 600,
  color: theme.palette.text.secondary,
  textTransform: 'uppercase',
  letterSpacing: '0.5px',
}));

/**
 * Submenu container - positioned adjacent to parent menu for OS-style submenus
 */
export const SubmenuContainer = styled(Paper)(({ theme }) => ({
  minWidth: 220,
  maxWidth: 280,
  maxHeight: 320,
  overflow: 'auto',
  borderRadius: 8,
  backgroundColor: theme.palette.background.paper,
  border: `1px solid ${theme.palette.divider}`,
  boxShadow: '0px 4px 12px rgba(0, 0, 0, 0.08)',
  padding: theme.spacing(0.5, 0),
  '& .MuiMenuItem-root': {
    fontSize: '0.875rem',
    padding: theme.spacing(1, 1.5),
    minHeight: 'auto',
    fontFamily: theme.typography.fontFamily,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: theme.spacing(0.25),
    '&:hover': {
      backgroundColor: alpha(theme.palette.primary.main, 0.08),
    },
  },
}));

/**
 * Details text shown below submenu item title
 */
export const SubmenuItemDetails = styled('span')(({ theme }) => ({
  fontSize: '0.75rem',
  color: theme.palette.text.secondary,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  maxWidth: '100%',
}));

/**
 * Enhanced card-style submenu item for filters and views
 */
export const SavedItemCard = styled('div')(({ theme }) => ({
  display: 'flex',
  flexDirection: 'column',
  gap: theme.spacing(0.75),
  width: '100%',
  padding: theme.spacing(1.5),
  borderRadius: 6,
  transition: 'all 0.2s ease-in-out',
  cursor: 'pointer',
  border: `1px solid transparent`,
  '&:hover': {
    backgroundColor: alpha(theme.palette.primary.main, 0.04),
    border: `1px solid ${alpha(theme.palette.primary.main, 0.2)}`,
    transform: 'translateY(-1px)',
    boxShadow: `0 2px 8px ${alpha(theme.palette.primary.main, 0.12)}`,
  },
}));

/**
 * Title for saved filter/view card
 */
export const SavedItemTitle = styled(Typography)(({ theme }) => ({
  fontSize: '0.875rem',
  fontWeight: 600,
  color: theme.palette.text.primary,
  lineHeight: 1.4,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  display: '-webkit-box',
  WebkitLineClamp: 2,
  WebkitBoxOrient: 'vertical',
}));

/**
 * Description for saved filter/view card
 */
export const SavedItemDescription = styled(Typography)(({ theme }) => ({
  fontSize: '0.75rem',
  color: theme.palette.text.secondary,
  lineHeight: 1.5,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  display: '-webkit-box',
  WebkitLineClamp: 2,
  WebkitBoxOrient: 'vertical',
  fontStyle: 'italic',
}));

/**
 * Filter details/tags container
 */
export const SavedItemTags = styled('div')(({ theme }) => ({
  display: 'flex',
  flexWrap: 'wrap',
  gap: theme.spacing(0.5),
  marginTop: theme.spacing(0.25),
}));

/**
 * Individual tag for filter attributes
 */
export const SavedItemTag = styled('span')(({ theme }) => ({
  fontSize: '0.6875rem',
  fontWeight: 500,
  padding: theme.spacing(0.25, 0.75),
  borderRadius: 4,
  backgroundColor: alpha(theme.palette.primary.main, 0.08),
  color: theme.palette.primary.main,
  border: `1px solid ${alpha(theme.palette.primary.main, 0.2)}`,
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  maxWidth: 200,
}));

/**
 * Empty state message for saved items
 */
export const EmptyStateText = styled(Typography)(({ theme }) => ({
  fontSize: '0.8125rem',
  color: theme.palette.text.disabled,
  padding: theme.spacing(3, 2),
  textAlign: 'center',
  fontStyle: 'italic',
}));
