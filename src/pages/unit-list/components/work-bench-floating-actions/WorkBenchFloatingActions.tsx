// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { useState } from 'react';

import { RebaseEditIcon } from '@/components/icons/RebaseEditIcon';
import { useApiErrorMessage } from '@/hooks/useApiErrorMessage';
import { ChangeSetRead, useDeleteChangeSetMutation } from '@confighub/rtk-query';
import { type ChangesetStatus, getChangesetStatusColor } from '@/types/changeset';
import AddIcon from '@mui/icons-material/Add';
import ChangeHistoryIcon from '@mui/icons-material/ChangeHistory';
import ClearIcon from '@mui/icons-material/Clear';
import CloseIcon from '@mui/icons-material/Close';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import SaveAsIcon from '@mui/icons-material/SaveAs';
import {
  Autocomplete,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  IconButton,
  Paper,
  TextField,
  Tooltip,
  Typography,
  styled,
} from '@mui/material';
import Chip from '@mui/material/Chip';

export interface IWorkBenchFloatingActionsProps {
  /** Available open changesets */
  changesets: ChangeSetRead[];
  /** Currently selected changeset */
  selectedChangeset: ChangeSetRead | null;
  /** Callback when changeset is selected */
  onChangesetSelect: (changeset: ChangeSetRead | null) => void;
  /** Callback when close button is clicked */
  onClose: () => void;
  /** Currently selected workflow tab index */
  selectedTab?: number;
  onCreateChangeSet?: () => void;
  onCloseChangeSetModalOpened: () => void;
  /** Whether edit mode is active */
  isEditMode?: boolean;
  /** Toggle edit mode */
  onToggleEditMode?: () => void;
  /** Callback when save is clicked in edit mode */
  onSave?: () => void;
  onRestoreChanges?: () => void;
  /** Callback to refetch changesets after deletion */
  onChangesetDeleted?: () => void;
  setErrorMessage: (errorMessage: string) => void;
}

const FloatingContainer = styled(Paper)(({ theme }) => ({
  position: 'fixed',
  bottom: theme.spacing(3),
  left: '50%',
  transform: 'translateX(-50%)',
  display: 'flex',
  alignItems: 'center',
  gap: theme.spacing(1),
  padding: theme.spacing(1, 2),
  borderRadius: theme.spacing(3),
  boxShadow: theme.shadows[8],
  backgroundColor: theme.palette.background.paper,
  border: `1px solid ${theme.palette.divider}`,
  zIndex: theme.zIndex.speedDial,
  transition: 'all 225ms cubic-bezier(0.4, 0, 0.2, 1)',
}));

const ActionButton = styled(IconButton, {
  shouldForwardProp: (prop) => prop !== '$active',
})<{ $active?: boolean }>(({ theme, $active }) => ({
  width: 40,
  height: 40,
  borderRadius: theme.spacing(1),
  backgroundColor: $active ? theme.palette.primary.main : 'transparent',
  color: $active ? theme.palette.primary.contrastText : theme.palette.text.secondary,
  '&:hover': {
    backgroundColor: $active ? theme.palette.primary.dark : theme.palette.action.hover,
  },
  transition: 'all 150ms cubic-bezier(0.4, 0, 0.2, 1)',
}));

// const SelectedCountBadge = styled(Box)(({ theme }) => ({
//   display: 'flex',
//   alignItems: 'center',
//   gap: theme.spacing(0.5),
//   padding: theme.spacing(0.5, 1.5),
//   borderRadius: theme.spacing(2),
//   backgroundColor: theme.palette.primary.main,
//   color: theme.palette.primary.contrastText,
// }));

const Divider = styled(Box)(({ theme }) => ({
  width: 1,
  height: 24,
  backgroundColor: theme.palette.divider,
  margin: theme.spacing(0, 0.5),
}));

const StyledAutocomplete = styled(Autocomplete)(({ theme }) => ({
  width: 300,
  '& .MuiInputBase-root': {
    height: 35,
    borderRadius: theme.spacing(1),
    fontSize: '0.875rem',
  },
  '& .MuiOutlinedInput-notchedOutline': {
    borderColor: theme.palette.divider,
  },
})) as typeof Autocomplete;

/**
 * Floating action panel for changeset workflow mode
 * Inspired by Figma's floating design tools
 */
export const WorkBenchFloatingActions = ({
  changesets,
  selectedChangeset,
  onChangesetSelect,
  onClose,
  onCreateChangeSet,
  selectedTab = 0,
  onCloseChangeSetModalOpened,
  isEditMode = false,
  onToggleEditMode,
  onSave,
  onRestoreChanges,
  onChangesetDeleted,
  setErrorMessage,
}: IWorkBenchFloatingActionsProps) => {
  const [inputValue, setInputValue] = useState('');
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [changesetToDelete, setChangesetToDelete] = useState<ChangeSetRead | null>(null);

  const isClosed = selectedChangeset?.State?.toLowerCase() === 'closed';
  const showAddControls = !selectedChangeset && !isClosed;
  const showChangeSetActions = selectedChangeset && selectedTab === 0 && !isClosed;

  // Delete mutation
  const [deleteChangeSet, { error: deleteError, isSuccess: isDeleteSuccess }] =
    useDeleteChangeSetMutation();

  useApiErrorMessage(deleteError, isDeleteSuccess, setErrorMessage);

  /**
   * Handles opening the delete confirmation dialog
   */
  const handleDeleteClick = (event: React.MouseEvent, changeset: ChangeSetRead) => {
    event.stopPropagation(); // Prevent the autocomplete from selecting this option
    setChangesetToDelete(changeset);
    setDeleteDialogOpen(true);
  };

  /**
   * Handles confirming deletion
   */
  const handleConfirmDelete = async () => {
    if (!changesetToDelete) return;

    try {
      const spaceID = changesetToDelete.SpaceID;
      const changeSetID = changesetToDelete.ChangeSetID;

      if (spaceID && changeSetID) {
        await deleteChangeSet({ spaceId: spaceID, changeSetId: changeSetID }).unwrap();

        // Clear selection if the deleted changeset was selected
        if (selectedChangeset?.ChangeSetID === changesetToDelete.ChangeSetID) {
          onChangesetSelect(null);
        }

        // Notify parent to refetch changesets
        onChangesetDeleted?.();
      }
    } catch (error) {
      console.error('Failed to delete changeset:', error);
    } finally {
      setDeleteDialogOpen(false);
      setChangesetToDelete(null);
    }
  };

  return (
    <FloatingContainer elevation={8}>
      <StyledAutocomplete
        size='small'
        options={changesets}
        value={selectedChangeset}
        onChange={(_, newValue) => onChangesetSelect(newValue)}
        inputValue={inputValue}
        onInputChange={(_, newInputValue) => setInputValue(newInputValue)}
        getOptionLabel={(option) => option.DisplayName || option.Slug || 'Unnamed Changeset'}
        renderInput={(params) => (
          <TextField {...params} placeholder='Select Change Set...' variant='outlined' />
        )}
        renderOption={(props, option) => (
          <Box
            {...props}
            key={`${option.Slug}`}
            component='li'
            sx={{ display: 'flex', alignItems: 'center', gap: 1 }}
          >
            <Typography variant='body2' fontWeight={500} sx={{ flexGrow: 1 }}>
              {option.Slug || 'Unnamed Changeset'}
            </Typography>
            <Chip
              label={option.State}
              size='small'
              sx={{ height: 20 }}
              color={getChangesetStatusColor(
                option?.State?.toLocaleLowerCase() as ChangesetStatus,
              )}
            />
            <IconButton
              size='small'
              onClick={(event) => handleDeleteClick(event, option)}
              sx={{
                padding: '4px',
              }}
            >
              <ClearIcon fontSize='small' />
            </IconButton>
          </Box>
        )}
        isOptionEqualToValue={(option, value) => option.ChangeSetID === value.ChangeSetID}
      />

      {showAddControls && (
        <>
          <Divider />
          <Tooltip title='Add Change Set' placement='top'>
            <ActionButton onClick={onCreateChangeSet} size='small'>
              <AddIcon color='primary' />
            </ActionButton>
          </Tooltip>
        </>
      )}

      {showChangeSetActions && (
        <>
          <Divider />
          <Tooltip title={isEditMode ? 'Cancel edit' : 'Edit changeset'} placement='top'>
            <ActionButton onClick={onToggleEditMode} size='small'>
              <ChangeHistoryIcon color='primary' />
            </ActionButton>
          </Tooltip>
        </>
      )}

      {showChangeSetActions && isEditMode && (
        <>
          <Divider />
          <Tooltip title='Save changes' placement='top'>
            <ActionButton onClick={onSave} size='small'>
              <SaveAsIcon color='primary' />
            </ActionButton>
          </Tooltip>
        </>
      )}

      {showChangeSetActions && (
        <>
          <Divider />
          <Tooltip title='Restore changes' placement='top'>
            <ActionButton onClick={onRestoreChanges} size='small'>
              <RebaseEditIcon color='primary' />
            </ActionButton>
          </Tooltip>
        </>
      )}

      {showChangeSetActions && (
        <>
          <Divider />
          <Tooltip title='Close Change Set' placement='top'>
            <ActionButton onClick={onCloseChangeSetModalOpened} size='small'>
              <DeleteOutlineIcon color='primary' />
            </ActionButton>
          </Tooltip>
        </>
      )}

      <Divider />

      <ActionButton onClick={onClose} size='small'>
        <CloseIcon fontSize='small' />
      </ActionButton>

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={deleteDialogOpen}
        onClose={() => setDeleteDialogOpen(false)}
        maxWidth='sm'
        fullWidth
      >
        <DialogTitle>Delete Change Set?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Are you sure you want to delete "
            {changesetToDelete?.DisplayName || changesetToDelete?.Slug}"? This action cannot be
            undone.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialogOpen(false)} variant='text'>
            Cancel
          </Button>
          <Button onClick={handleConfirmDelete} variant='contained'>
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </FloatingContainer>
  );
};
