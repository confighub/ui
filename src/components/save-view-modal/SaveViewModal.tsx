// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { useEffect, useRef, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';

import { ErrorList } from '@/components/error-list/ErrorList';
import { useAdvancedSearchQueryParams } from '@/hooks/useAdvancedSearchQueryParams';
import { useAnalytics } from '@/hooks/useAnalytics';
import { useApiErrorMessage } from '@/hooks/useApiErrorMessage';
import {
  FilterRead,
  SpaceRead,
  useCreateViewMutation,
  useListAllFiltersQuery,
  useListAllViewsQuery,
  useListSpacesQuery,
  usePatchViewMutation,
} from '@confighub/rtk-query';
import { ENTITY_TYPES } from '@/utility/analytics-constants';
import {
  DEFAULT_UNIT_COLUMNS,
  decodeColumnDelta,
  getColumnsFromDelta,
} from '@/utility/column-delta-functions';
import { FILTER_URL_PARAMS, VIEW_URL_PARAMS } from '@/utility/constants/url-params';
import Autocomplete from '@mui/material/Autocomplete';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Grid from '@mui/material/Grid2';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';

interface SaveViewFormData {
  displayName: string;
  spaceID: string;
  filterID: string;
}

export interface SaveViewModalProps {
  open: boolean;
  onClose: () => void;
  /**
   * When provided, overrides the groupBy URL param in the saved view.
   * Supports multi-level grouping: index 0 → view.GroupBy, indices 1+ → column.GroupBy flags.
   */
  localGroupByColumns?: string[];
  /**
   * Force "create new view" mode even when a viewID is present in the URL.
   * Used by the "New view" / "Save as new view" affordances on the Views tab strip
   * so the user can keep the original view intact while persisting a copy.
   */
  forceCreate?: boolean;
}

/**
 * SaveViewModal Component
 *
 * Modal for saving or updating a view based on current query string parameters.
 * - If viewID exists in query string, updates the existing view
 * - If no viewID, creates a new view
 * - Reads filter, columns, groupBy, orderBy, and orderByDirection from query params
 */
export const SaveViewModal = ({
  open,
  onClose,
  localGroupByColumns,
  forceCreate = false,
}: SaveViewModalProps) => {
  const { searchParams, updateSearchParam } = useAdvancedSearchQueryParams();
  const [serverError, setServerError] = useState<string>('');
  const hasInitializedRef = useRef(false);

  // Get view configuration from query params. When `forceCreate` is set, ignore
  // any viewID in the URL so the modal stays in "create" mode regardless of
  // which view is currently active — this powers the "Save as new view" flow.
  const viewIDFromUrl = searchParams.get(VIEW_URL_PARAMS.VIEW_ID);
  const viewID = forceCreate ? null : viewIDFromUrl;
  const filterID =
    searchParams.get(VIEW_URL_PARAMS.FILTER_ID) ||
    searchParams.get(FILTER_URL_PARAMS.FILTER_ID);
  const groupBy = searchParams.get(VIEW_URL_PARAMS.GROUP_BY);
  const columns = searchParams.get(VIEW_URL_PARAMS.COLUMNS);
  const orderBy = searchParams.get(VIEW_URL_PARAMS.ORDER_BY);
  const orderByDirection = searchParams.get(VIEW_URL_PARAMS.ORDER_BY_DIRECTION);

  // Fetch available spaces
  const { spaces = [] } = useListSpacesQuery(
    {},
    {
      selectFromResult: (result) => ({
        spaces: result?.data?.map((space) => space.Space).filter(Boolean) as SpaceRead[],
      }),
    },
  );

  // Fetch available filters
  const { filters = [] } = useListAllFiltersQuery(
    {},
    {
      selectFromResult: (result) => ({
        filters: result?.data?.map((filter) => filter.Filter).filter(Boolean) as FilterRead[],
      }),
    },
  );

  // Fetch all views to find the current view if updating
  const { data: savedViews = [] } = useListAllViewsQuery({
    include: 'FilterID',
  });

  const currentView = savedViews?.find((v) => v.View?.ViewID === viewID)?.View || null;

  // API mutation hooks
  const [
    createView,
    { error: createViewError, isLoading: isSaving, isSuccess: isCreateSuccess },
  ] = useCreateViewMutation();
  const [patchView, { error: patchViewError, isSuccess: isPatchSuccess }] =
    usePatchViewMutation();
  const { trackEntityCreated } = useAnalytics();

  // React Hook Form setup
  const {
    control,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors },
  } = useForm<SaveViewFormData>({
    defaultValues: {
      displayName: '',
      spaceID: '',
      filterID: '',
    },
  });

  // Watch the filterID field to enable/disable submit button
  const selectedFilterID = watch('filterID');

  // Handle API success/error states
  useApiErrorMessage(createViewError, isCreateSuccess, setServerError, {
    onSuccess: () => {
      onClose();
      reset();
    },
  });

  useApiErrorMessage(patchViewError, isPatchSuccess, setServerError, {
    onSuccess: () => {
      onClose();
      reset();
    },
  });

  // Pre-populate form when modal opens (only once per open session)
  useEffect(() => {
    if (!open) {
      // Reset initialization flag when modal closes
      hasInitializedRef.current = false;
      return;
    }

    // Only initialize once per modal open
    if (hasInitializedRef.current) return;

    if (currentView) {
      // Updating existing view
      setValue('displayName', currentView.DisplayName || '');
      setValue('spaceID', currentView.SpaceID || '');
      setValue('filterID', filterID || currentView.FilterID || '');
    } else {
      // Creating new view - set defaults
      if (spaces.length > 0) {
        setValue('spaceID', spaces[0]?.SpaceID || '');
      }
      if (filterID) {
        setValue('filterID', filterID);
      }
    }

    hasInitializedRef.current = true;
  }, [open, currentView, spaces, filterID, setValue]);

  const handleClose = () => {
    onClose();
    reset();
    setServerError('');
  };

  const onSubmit = async (data: SaveViewFormData) => {
    if (!data.spaceID || !data.filterID) {
      setServerError('Space and Filter are required to save a view');
      return;
    }

    // Decode column delta from URL to get full column list.
    // GroupBy is now sidebar-only (GroupNavPanel) — GroupBy levels are no longer injected
    // into the Columns list.
    const finalColumns = columns
      ? getColumnsFromDelta(columns)
      : DEFAULT_UNIT_COLUMNS.map((col) => ({ Name: col }));

    // localGroupByColumns[0] is the live primary GroupBy; fall back to the URL param.
    const finalGroupBy: string | undefined =
      (localGroupByColumns && localGroupByColumns.length > 0 ? localGroupByColumns[0] : groupBy) || undefined;

    try {
      if (currentView) {
        // Patch existing view - only send fields that need updating
        await patchView({
          spaceId: data.spaceID,
          viewId: viewID || '',
          // @ts-expect-error https://stackoverflow.com/questions/68283492/rtk-query-merge-patchjson-content-type-ruins-request-body
          body: JSON.stringify({
            Version: currentView.Version, // Required for optimistic locking to prevent 409 conflicts
            DisplayName: data.displayName,
            FilterID: data.filterID,
            GroupBy: finalGroupBy,
            Columns: finalColumns,
            OrderBy: orderBy || undefined,
            OrderByDirection: (orderByDirection as 'ASC' | 'DESC') || undefined,
          }),
        }).unwrap();
      } else {
        // Create new view
        const result = await createView({
          spaceId: data.spaceID,
          view: {
            DisplayName: data.displayName,
            Slug: data.displayName.toLowerCase().replace(/\s+/g, '-'),
            FilterID: data.filterID,
            GroupBy: finalGroupBy,
            Columns: finalColumns,
            OrderBy: orderBy || undefined,
            OrderByDirection: (orderByDirection as 'ASC' | 'DESC') || undefined,
          },
        }).unwrap();

        if (result?.ViewID) {
          // Track view creation (no user input, only entity ID)
          trackEntityCreated({
            entity_type: ENTITY_TYPES.VIEW,
            entity_id: result.ViewID,
          });

          // Update URL with new viewID
          updateSearchParam(VIEW_URL_PARAMS.VIEW_ID, result.ViewID);
          updateSearchParam(VIEW_URL_PARAMS.FILTER_ID, result.FilterID || '');
          updateSearchParam(VIEW_URL_PARAMS.SAVED, 'true');
        }
      }
    } catch (error) {
      console.error('Failed to save view:', error);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      maxWidth='sm'
      fullWidth
      slotProps={{
        paper: {
          component: 'form',
          onSubmit: handleSubmit(onSubmit),
        },
      }}
    >
      <DialogTitle>{viewID ? 'Update View' : 'Save View'}</DialogTitle>
      <DialogContent>
        <ErrorList errors={[serverError]} onClose={() => setServerError('')} />

        <Typography variant='body2' color='text.secondary' sx={{ mb: 2, mt: 1 }}>
          {viewID
            ? 'Update the current view configuration with the latest settings from the table.'
            : 'Save the current table configuration as a new view for easy access later.'}
        </Typography>

        <Grid container spacing={2}>
          <Grid size={{ xs: 12 }}>
            <Controller
              name='displayName'
              control={control}
              rules={{ required: 'View name is required' }}
              render={({ field }) => (
                <TextField
                  {...field}
                  size='small'
                  fullWidth
                  label='View Name'
                  placeholder='Enter a name for this view...'
                  error={!!errors.displayName}
                  helperText={errors.displayName?.message}
                  autoFocus
                />
              )}
            />
          </Grid>

          <Grid size={{ xs: 6 }}>
            <Controller
              name='filterID'
              control={control}
              rules={{ required: 'Filter is required' }}
              render={({ field }) => (
                <Autocomplete
                  size='small'
                  options={filters}
                  getOptionLabel={(option) => option.DisplayName || 'Unnamed Filter'}
                  value={filters.find((filter) => filter.FilterID === field.value) || null}
                  onChange={(_, newValue) => {
                    field.onChange(newValue?.FilterID ?? '');
                  }}
                  renderInput={(params) => (
                    <TextField
                      {...params}
                      label='Saved Filter'
                      error={!!errors.filterID}
                      helperText={errors.filterID?.message || 'Select a saved filter for this view'}
                    />
                  )}
                />
              )}
            />
          </Grid>

          <Grid size={{ xs: 6 }}>
            <Controller
              name='spaceID'
              control={control}
              rules={{ required: 'Space is required' }}
              render={({ field }) => (
                <Autocomplete
                  size='small'
                  options={spaces}
                  getOptionLabel={(option) => option.DisplayName || ''}
                  value={spaces.find((space) => space.SpaceID === field.value) || null}
                  onChange={(_, newValue) => {
                    field.onChange(newValue?.SpaceID ?? '');
                  }}
                  renderInput={(params) => (
                    <TextField
                      {...params}
                      label='Space'
                      error={!!errors.spaceID}
                      helperText={errors.spaceID?.message}
                    />
                  )}
                />
              )}
            />
          </Grid>

          {columns && (
            <Grid size={{ xs: 12 }}>
              <Typography variant='caption' color='text.secondary'>
                Columns: {getColumnsFromDelta(columns).length} selected
                {(() => {
                  const delta = decodeColumnDelta(columns);
                  const parts = [];
                  if (delta.add.length > 0) {
                    parts.push(`+${delta.add.length} added`);
                  }
                  if (delta.remove.length > 0) {
                    parts.push(`-${delta.remove.length} removed`);
                  }
                  return parts.length > 0 ? ` (${parts.join(', ')})` : '';
                })()}
              </Typography>
            </Grid>
          )}
        </Grid>
      </DialogContent>
      <DialogActions>
        <Button variant='outlined' onClick={handleClose}>
          Cancel
        </Button>
        <Button variant='contained' type='submit' disabled={isSaving || !selectedFilterID}>
          {isSaving ? 'Saving...' : viewID ? 'Update' : 'Save'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};
