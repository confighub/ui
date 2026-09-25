// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import { useCallback, useMemo, useRef, useState } from 'react';

import BookmarkOutlined from '@mui/icons-material/BookmarkOutlined';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import DeleteIcon from '@mui/icons-material/Delete';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import ClickAwayListener from '@mui/material/ClickAwayListener';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';
import IconButton from '@mui/material/IconButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import MenuItem from '@mui/material/MenuItem';
import MenuList from '@mui/material/MenuList';
import Popper from '@mui/material/Popper';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';

import {
  type ExtendedViewRead,
  useDeleteViewMutation,
  useListAllViewsQuery,
} from '@confighub/rtk-query';

import { FIELD_ICONS } from '../field-icons';
import { FIELD_CONFIGS, FIELD_DESCRIPTIONS, getAvailableFieldsForEntity } from '../operators';
import { useQueryBuilderContext } from '../QueryBuilderContext';
import { DropdownMenu, MenuSection, SubmenuContainer } from '../shared-styles';
import type { FilterFieldType } from '../types';

import { FieldSection } from './styles';

interface FieldDropdownProps {
  currentField: FilterFieldType;
  onChange: (field: FilterFieldType) => void;
  disabled?: boolean;
}

/**
 * Dropdown for selecting filter field type
 * Includes saved filters and views submenus
 */
export const FieldDropdown = ({
  currentField,
  onChange,
  disabled = false,
}: FieldDropdownProps) => {
  const { entityType, onSelectSavedView } = useQueryBuilderContext();
  const config = FIELD_CONFIGS[currentField];

  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const [viewsSubmenuOpen, setViewsSubmenuOpen] = useState(false);

  const viewsItemRef = useRef<HTMLLIElement>(null);
  const viewsSubmenuTimeout = useRef<NodeJS.Timeout | null>(null);

  // Delete confirmation dialog state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [itemToDelete, setItemToDelete] = useState<{
    type: 'view';
    id: string;
    spaceId: string;
    name: string;
  } | null>(null);

  // Delete mutations
  const [deleteView] = useDeleteViewMutation();

  // Fetch all views with their associated filter data
  // Note: View entity doesn't have a 'From' field - that's on Filter, so we filter client-side
  const { data: allViewsData = [] } = useListAllViewsQuery({
    include: 'FilterID',
  });

  // Filter views by entity type and sort alphabetically
  const sortedViews = useMemo(() => {
    return allViewsData
      .filter(view => view.Filter?.From === entityType)
      .sort((a, b) => {
        const aName = a.View?.DisplayName || '';
        const bName = b.View?.DisplayName || '';
        return aName.localeCompare(bName);
      });
  }, [allViewsData, entityType]);

  const closeDropdown = useCallback(() => {
    // Clear all pending timeout refs to prevent delayed reopening
    if (viewsSubmenuTimeout.current) {
      clearTimeout(viewsSubmenuTimeout.current);
      viewsSubmenuTimeout.current = null;
    }
    setAnchorEl(null);
    setViewsSubmenuOpen(false);
  }, []);

  const handleViewsMenuEnter = useCallback(() => {
    if (viewsSubmenuTimeout.current) {
      clearTimeout(viewsSubmenuTimeout.current);
    }
    setViewsSubmenuOpen(true);
  }, []);

  const handleViewsMenuLeave = useCallback(() => {
    viewsSubmenuTimeout.current = setTimeout(() => {
      setViewsSubmenuOpen(false);
    }, 150);
  }, []);

  // Keep submenu open when hovering over it
  const handleSubmenuEnter = useCallback(() => {
    if (viewsSubmenuTimeout.current) {
      clearTimeout(viewsSubmenuTimeout.current);
    }
  }, []);

  const handleSubmenuLeave = useCallback(() => {
    handleViewsMenuLeave();
  }, [handleViewsMenuLeave]);

  const handleSelectSavedView = useCallback((view: ExtendedViewRead) => {
    // Immediately close submenus before async operations
    setViewsSubmenuOpen(false);
    onSelectSavedView?.(view);
    closeDropdown();
  }, [onSelectSavedView, closeDropdown]);

  const handleFieldChange = (field: FilterFieldType) => {
    onChange(field);
    closeDropdown();
  };

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      closeDropdown();
    }
  };

  const handleDeleteConfirm = useCallback(async () => {
    if (!itemToDelete) return;

    setDeleteError(null);
    try {
      await deleteView({ viewId: itemToDelete.id, spaceId: itemToDelete.spaceId }).unwrap();
      setDeleteDialogOpen(false);
      setItemToDelete(null);
      // RTK Query will automatically refetch the lists
    } catch (error) {
      console.error('Failed to delete:', error);
      // Extract error message from RTK Query error
      let errorMessage = 'Failed to delete view. Please try again.';
      if (error && typeof error === 'object') {
        const err = error as { data?: { message?: string; detail?: string }; message?: string };
        if (err.data?.message) {
          errorMessage = err.data.message;
        } else if (err.data?.detail) {
          errorMessage = err.data.detail;
        } else if (err.message) {
          errorMessage = err.message;
        }
      }
      setDeleteError(errorMessage);
    }
  }, [itemToDelete, deleteView]);

  const availableFields = getAvailableFieldsForEntity(entityType);

  return (
    <>
      <Tooltip title={FIELD_DESCRIPTIONS[currentField]} placement="top" arrow>
        <FieldSection
          onClick={(e) => setAnchorEl(e.currentTarget)}
          disabled={disabled}
          aria-haspopup="listbox"
          aria-expanded={Boolean(anchorEl)}
          aria-label={`Filter by ${config.label}. Click to change filter type.`}
        >
          {FIELD_ICONS[currentField]}
          {config.label}
          <KeyboardArrowDownIcon />
        </FieldSection>
      </Tooltip>
      <Popper
        open={Boolean(anchorEl)}
        anchorEl={anchorEl}
        placement="bottom-start"
        style={{ zIndex: 1300 }}
      >
        <ClickAwayListener onClickAway={closeDropdown}>
          <DropdownMenu onKeyDown={handleKeyDown}>
            <MenuList autoFocusItem={Boolean(anchorEl)}>
              {/* Saved Views - single item with submenu */}
              {sortedViews.length > 0 && onSelectSavedView && (
                <MenuItem
                  ref={viewsItemRef}
                  onMouseEnter={handleViewsMenuEnter}
                  onMouseLeave={handleViewsMenuLeave}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowRight') {
                      e.preventDefault();
                      handleViewsMenuEnter();
                    }
                  }}
                  aria-haspopup="menu"
                  aria-expanded={viewsSubmenuOpen}
                >
                  <ListItemIcon sx={{ minWidth: 32, color: 'primary.main' }}>
                    <BookmarkOutlined fontSize="small" />
                  </ListItemIcon>
                  Saved Views
                  <ChevronRightIcon sx={{ fontSize: 18, color: 'text.secondary', ml: 'auto' }} />
                </MenuItem>
              )}

              {/* Attribute filters section */}
              <MenuSection variant="caption">Attributes</MenuSection>
              {availableFields.filter(f => !['where', 'whereData'].includes(f)).map((field) => {
                const fieldConfig = FIELD_CONFIGS[field];
                return (
                  <MenuItem
                    key={field}
                    selected={currentField === field}
                    onClick={() => handleFieldChange(field)}
                  >
                    <Tooltip title={FIELD_DESCRIPTIONS[field]} placement="right" arrow>
                      <Box sx={{ display: 'flex', alignItems: 'center', width: '100%' }}>
                        <ListItemIcon sx={{ minWidth: 32 }}>
                          {FIELD_ICONS[field]}
                        </ListItemIcon>
                        {fieldConfig.label}
                      </Box>
                    </Tooltip>
                  </MenuItem>
                );
              })}

              {/* Advanced section */}
              <MenuSection variant="caption">Advanced</MenuSection>
              {availableFields.filter(f => ['where', 'whereData'].includes(f)).map((field) => {
                const fieldConfig = FIELD_CONFIGS[field];
                return (
                  <MenuItem
                    key={field}
                    selected={currentField === field}
                    onClick={() => handleFieldChange(field)}
                  >
                    <Tooltip title={FIELD_DESCRIPTIONS[field]} placement="right" arrow>
                      <Box sx={{ display: 'flex', alignItems: 'center', width: '100%' }}>
                        <ListItemIcon sx={{ minWidth: 32 }}>
                          {FIELD_ICONS[field]}
                        </ListItemIcon>
                        {fieldConfig.label}
                      </Box>
                    </Tooltip>
                  </MenuItem>
                );
              })}
            </MenuList>
          </DropdownMenu>
        </ClickAwayListener>
      </Popper>

      {/* Saved Views Submenu */}
      <Popper
        open={viewsSubmenuOpen && Boolean(viewsItemRef.current)}
        anchorEl={viewsItemRef.current}
        placement="right-start"
        style={{ zIndex: 1301 }}
        modifiers={[
          { name: 'offset', options: { offset: [-8, 0] } },
          { name: 'flip', enabled: true, options: { fallbackPlacements: ['left-start'] } },
        ]}
      >
        <SubmenuContainer
          onMouseEnter={handleSubmenuEnter}
          onMouseLeave={handleSubmenuLeave}
        >
          <MenuList>
            {sortedViews.map((view) => {
              const v = view.View;
              const description = v?.Annotations?.description;
              const name = v?.DisplayName || 'Unnamed View';

              // Build view details
              const details: string[] = [];
              if (v?.Columns?.length) details.push(`${v.Columns.length} columns`);
              if (v?.GroupBy) details.push(`Grouped by ${v.GroupBy}`);
              if (v?.OrderBy) details.push(`Sorted by ${v.OrderBy}`);
              if (view.Filter?.DisplayName) details.push(`Filter: ${view.Filter.DisplayName}`);
              const viewDetails = details.join(' · ');

              return (
                <MenuItem
                  key={v?.ViewID}
                  onClick={() => handleSelectSavedView(view)}
                  sx={{ py: 1, pr: 1, '&:hover .delete-icon': { opacity: 1 } }}
                  title={viewDetails || ''}
                >
                  <ListItemText
                    primary={name}
                    secondary={
                      <Box component="span" sx={{ display: 'flex', flexDirection: 'column', gap: 0.25 }}>
                        {description && (
                          <Typography component="span" variant="body2" color="text.secondary">
                            {description}
                          </Typography>
                        )}
                        {viewDetails && (
                          <Typography component="span" sx={{ fontSize: '0.6875rem', color: 'text.secondary' }}>
                            {viewDetails}
                          </Typography>
                        )}
                      </Box>
                    }
                    primaryTypographyProps={{ variant: 'body2', noWrap: true }}
                    secondaryTypographyProps={{ component: 'div' }}
                  />
                  <IconButton
                    className="delete-icon"
                    size="small"
                    onClick={(e) => {
                      e.stopPropagation();
                      setItemToDelete({
                        type: 'view',
                        id: v?.ViewID || '',
                        spaceId: v?.SpaceID || '',
                        name: v?.DisplayName || 'Unnamed View',
                      });
                      setDeleteDialogOpen(true);
                    }}
                    sx={{ opacity: 0, transition: 'opacity 0.2s', flexShrink: 0 }}
                    aria-label="Delete view"
                  >
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </MenuItem>
              );
            })}
          </MenuList>
        </SubmenuContainer>
      </Popper>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onClose={() => { setDeleteDialogOpen(false); setDeleteError(null); }}>
        <DialogTitle>Delete View?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Are you sure you want to delete "{itemToDelete?.name}"? This action cannot be undone.
          </DialogContentText>
          {deleteError && (
            <Typography color="error" sx={{ mt: 2 }}>
              {deleteError}
            </Typography>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => { setDeleteDialogOpen(false); setDeleteError(null); }}>Cancel</Button>
          <Button onClick={handleDeleteConfirm} color="error" variant="contained">
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
};
