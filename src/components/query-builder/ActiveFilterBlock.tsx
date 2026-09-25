// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import BookmarkIcon from '@mui/icons-material/Bookmark';
import CloseIcon from '@mui/icons-material/Close';
import EditIcon from '@mui/icons-material/Edit';
import FilterListIcon from '@mui/icons-material/FilterList';
import Box from '@mui/material/Box';
import Tooltip from '@mui/material/Tooltip';
import { alpha, styled } from '@mui/material/styles';

import type { ExtendedFilterRead, ExtendedViewRead } from '@confighub/rtk-query';

/**
 * Styled chip for active view/filter display
 * Shows before regular filters with distinct styling based on type (view vs filter)
 */
const ActiveChip = styled(Box)<{ $type: 'view' | 'filter' }>(({ theme, $type }) => ({
  display: 'inline-flex',
  alignItems: 'center',
  height: 30,
  borderRadius: 8,
  backgroundColor: $type === 'view'
    ? alpha(theme.palette.info.main, 0.08)
    : alpha(theme.palette.primary.main, 0.06),
  border: `1px solid ${$type === 'view'
    ? alpha(theme.palette.info.main, 0.3)
    : alpha(theme.palette.primary.main, 0.25)}`,
  fontSize: '0.875rem',
  color: theme.palette.text.primary,
  overflow: 'hidden',
  transition: 'all 0.2s ease-in-out',
  '&:hover': {
    borderColor: $type === 'view'
      ? theme.palette.info.main
      : theme.palette.primary.main,
    boxShadow: '0px 2px 4px rgba(0, 0, 0, 0.05)',
  },
}));

/**
 * Label section showing the icon and name
 */
const LabelSection = styled('span')<{ $type: 'view' | 'filter' }>(({ theme, $type }) => ({
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  height: '100%',
  padding: theme.spacing(0, 1.5),
  backgroundColor: 'transparent',
  color: $type === 'view'
    ? theme.palette.info.main
    : theme.palette.primary.main,
  fontSize: '0.75rem',
  fontWeight: 600,
  fontFamily: theme.typography.fontFamily,
  letterSpacing: '0.5px',
  flexShrink: 0,
  whiteSpace: 'nowrap',
  '& svg': {
    fontSize: 16,
  },
}));

/**
 * Name section showing the view/filter name
 */
const NameSection = styled('span')(({ theme }) => ({
  display: 'flex',
  alignItems: 'center',
  height: '100%',
  padding: theme.spacing(0, 1.5),
  paddingLeft: 0,
  color: theme.palette.text.primary,
  fontSize: '0.875rem',
  fontFamily: theme.typography.fontFamily,
  maxWidth: 200,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
}));

/**
 * Modified indicator with orange icon
 */
const ModifiedIndicator = styled('span')(({ theme }) => ({
  display: 'flex',
  alignItems: 'center',
  height: '100%',
  padding: theme.spacing(0, 0.75),
  borderLeft: `1px solid ${theme.palette.divider}`,
  color: theme.palette.warning.main,
  '& svg': {
    fontSize: 14,
  },
}));

/**
 * Remove button
 */
const RemoveButton = styled('button')(({ theme }) => ({
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

interface ActiveViewBlockProps {
  view: ExtendedViewRead;
  isModified?: boolean;
  onRemove: () => void;
}

/**
 * Display block for active view
 */
export const ActiveViewBlock = ({ view, isModified = false, onRemove }: ActiveViewBlockProps) => {
  const name = view.View?.DisplayName || 'Unnamed View';

  return (
    <ActiveChip $type="view">
      <LabelSection $type="view">
        <BookmarkIcon />
        VIEW
      </LabelSection>
      <NameSection title={name}>{name}</NameSection>
      {isModified && (
        <Tooltip
          title="This view has been modified. The displayed filters differ from the saved view."
          placement="top"
          arrow
        >
          <ModifiedIndicator>
            <EditIcon />
          </ModifiedIndicator>
        </Tooltip>
      )}
      <Tooltip title="Remove view" placement="top">
        <RemoveButton onClick={onRemove} aria-label="Remove view">
          <CloseIcon />
        </RemoveButton>
      </Tooltip>
    </ActiveChip>
  );
};

interface ActiveFilterBlockProps {
  filter: ExtendedFilterRead;
  isModified?: boolean;
  onRemove: () => void;
}

/**
 * Display block for active filter
 */
export const ActiveFilterBlock = ({ filter, isModified = false, onRemove }: ActiveFilterBlockProps) => {
  const name = filter.Filter?.DisplayName || 'Unnamed Filter';

  return (
    <ActiveChip $type="filter">
      <LabelSection $type="filter">
        <FilterListIcon />
        FILTER
      </LabelSection>
      <NameSection title={name}>{name}</NameSection>
      {isModified && (
        <Tooltip
          title="This filter has been modified. The displayed filters differ from the saved filter."
          placement="top"
          arrow
        >
          <ModifiedIndicator>
            <EditIcon />
          </ModifiedIndicator>
        </Tooltip>
      )}
      <Tooltip title="Remove filter" placement="top">
        <RemoveButton onClick={onRemove} aria-label="Remove filter">
          <CloseIcon />
        </RemoveButton>
      </Tooltip>
    </ActiveChip>
  );
};
