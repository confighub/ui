// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

// The settings of one Unit: its name, toolchain, whether it is released, and metadata. The Unit page shows it in
// its Settings tab and the Unit list in a drawer, so both edit a Unit the same way.

import { type ReactNode, useEffect, useRef } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Link as RouterLink } from 'react-router-dom';

import { CopyToClipboard } from '@/components/copy-to-clipboard/CopyToClipboard';
import { LabelTextField } from '@/components/label-text-field/LabelTextField';
import { MapFieldSection } from '@/components/map-field-editor/MapFieldSection';
import { type MapRow, mapToRows, rowsToGates, rowsToMap } from '@/components/map-field-editor/map-rows';
import { DEFAULT_TOOLCHAIN_TYPES } from '@/components/query-builder';
import { SettingsFormFooter } from '@/components/settings-form-footer/SettingsFormFooter';
import { SectionCard } from '@/components/styled';
import { useAppDispatch } from '@/hooks/useApp';
import { SpaceReleaseTargetField } from '@/components/unit-form';
import { ExtendedUnitRead, UnitRead, useUpdateUnitMutation } from '@confighub/rtk-query';
import { SLUG_PATTERN, SLUG_PATTERN_MESSAGE } from '@confighub/api';
import { setAlert } from '@/state/slices/alert';
import { formatRelative } from '@/utility/date-format';
import { getApiErrorMessage } from '@/utility/error-functions';
import { isIDInvalid } from '@/utility/validation-functions';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import FormControl from '@mui/material/FormControl';
import FormControlLabel from '@mui/material/FormControlLabel';
import IconButton from '@mui/material/IconButton';
import Grid from '@mui/material/Grid2';
import InputLabel from '@mui/material/InputLabel';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import TextField from '@mui/material/TextField';

interface UnitFormData {
  Slug: string;
  Unreleasable: boolean;
  ToolchainType: string;
  Labels: MapRow[];
  Annotations: MapRow[];
  DeleteGates: MapRow[];
  DestroyGates: MapRow[];
}

const unitFormValues = (unit: UnitRead | undefined): UnitFormData => ({
  Slug: unit?.Slug || '',
  Unreleasable: !!unit?.Unreleasable,
  ToolchainType: unit?.ToolchainType || '',
  Labels: mapToRows(unit?.Labels),
  Annotations: mapToRows(unit?.Annotations),
  DeleteGates: mapToRows(unit?.DeleteGates),
  DestroyGates: mapToRows(unit?.DestroyGates),
});

const ReadOnlyField = ({
  label,
  text,
  endAdornment,
}: {
  label: string;
  text: string;
  endAdornment?: ReactNode;
}) => (
  <LabelTextField
    label={label}
    text={text || 'N/A'}
    textColor='text.primary'
    labelColor='text.secondary'
    labelVariant='caption'
    textVariant='body1'
    endAdornment={endAdornment}
  />
);

export interface UnitSettingsFormProps {
  extendedUnit: ExtendedUnitRead;
  /** The Unit this one was cloned from, to name it */
  upstreamUnit?: UnitRead;
  onUnitUpdated: () => void;
  /** Drawn beside the Save button, such as a link to the Unit's page */
  actions?: ReactNode;
}

export const UnitSettingsForm = ({
  extendedUnit,
  upstreamUnit,
  onUnitUpdated,
  actions,
}: UnitSettingsFormProps) => {
  const dispatch = useAppDispatch();
  const unit = extendedUnit.Unit;

  const [updateUnit, { isLoading: isSaving }] = useUpdateUnitMutation();

  const {
    control,
    handleSubmit,
    formState: { errors },
    reset,
    watch,
  } = useForm<UnitFormData>({
    defaultValues: unitFormValues(unit),
  });

  // The Unit page polls, and a poll returns a new object for an unchanged Unit. Only another
  // version of the Unit replaces what the form shows, so a poll does not discard an edit.
  const loadedVersion = useRef('');
  useEffect(() => {
    const version = `${unit?.UnitID}:${unit?.Version}`;
    if (!unit?.UnitID || loadedVersion.current === version) return;
    loadedVersion.current = version;
    reset(unitFormValues(unit));
  }, [unit, reset]);

  const onSubmit = async (data: UnitFormData) => {
    const response = await updateUnit({
      unit: {
        ...unit,
        Slug: data.Slug,
        Labels: rowsToMap(data.Labels),
        Annotations: rowsToMap(data.Annotations),
        DeleteGates: rowsToGates(data.DeleteGates),
        DestroyGates: rowsToGates(data.DestroyGates),
        Unreleasable: data.Unreleasable,
        ToolchainType: data.ToolchainType,
      },
      spaceId: unit?.SpaceID ?? '',
      unitId: unit?.UnitID ?? '',
    });

    if (response.data?.Unit?.UnitID) {
      onUnitUpdated();
      dispatch(
        setAlert({
          message: 'The Unit was updated successfully.',
          type: 'success',
          isOpen: true,
        }),
      );
    } else {
      dispatch(
        setAlert({
          message: `There was an error updating the Unit. ${getApiErrorMessage(response.error, '')}`,
          type: 'error',
          isOpen: true,
        }),
      );
    }
  };

  return (
    <Box component='form' onSubmit={handleSubmit(onSubmit)} data-testid='unit-settings-form'>
      <SectionCard title='Basic Information'>
        <Grid container spacing={2}>
          <Grid size={{ xs: 12, md: 6 }}>
            <ReadOnlyField
              label='Unit ID'
              text={unit?.UnitID || ''}
              endAdornment={<CopyToClipboard text={unit?.UnitID || ''} />}
            />
          </Grid>
          <Grid size={{ xs: 12, md: 6 }}>
            <ReadOnlyField
              label='Upstream Unit'
              text={upstreamUnit?.Slug || unit?.UpstreamUnitID || ''}
              endAdornment={
                isIDInvalid(unit?.UpstreamUnitID) ? null : (
                  <>
                    <CopyToClipboard text={unit?.UpstreamUnitID || ''} />
                    <IconButton
                      size='small'
                      component={RouterLink}
                      to={`/units/${unit?.UpstreamSpaceID}/${unit?.UpstreamUnitID}`}
                      aria-label='Open upstream Unit'
                      title='Open upstream Unit'
                    >
                      <ArrowForwardIcon fontSize='small' />
                    </IconButton>
                  </>
                )
              }
            />
          </Grid>
          <Grid size={{ xs: 6 }}>
            <ReadOnlyField label='Created At' text={formatRelative(unit?.CreatedAt) || ''} />
          </Grid>
          <Grid size={{ xs: 6 }}>
            <ReadOnlyField label='Updated At' text={formatRelative(unit?.UpdatedAt) || ''} />
          </Grid>
          <Grid size={{ xs: 12 }}>
            <ReadOnlyField
              label='Last Change Description'
              text={unit?.LastChangeDescription || ''}
            />
          </Grid>
          <Grid size={{ xs: 12, md: 6 }}>
            <Controller
              name='Slug'
              control={control}
              rules={{
                required: 'Slug is required',
                pattern: {
                  value: SLUG_PATTERN,
                  message: SLUG_PATTERN_MESSAGE,
                },
              }}
              render={({ field }) => (
                <TextField
                  fullWidth
                  label='Name'
                  error={!!errors.Slug}
                  size='small'
                  helperText={errors.Slug?.message}
                  slotProps={{ inputLabel: { shrink: true } }}
                  {...field}
                />
              )}
            />
          </Grid>
          <Grid size={{ xs: 12, md: 6 }}>
            <Controller
              name='ToolchainType'
              control={control}
              render={({ field }) => (
                <FormControl fullWidth variant='outlined' size='small'>
                  <InputLabel id='toolchain-label'>Toolchain Type</InputLabel>
                  <Select
                    label='Toolchain Type'
                    labelId='toolchain-label'
                    id='toolchain-label-select'
                    size='small'
                    {...field}
                    value={field.value || ''}
                  >
                    {DEFAULT_TOOLCHAIN_TYPES.map((toolchain) => (
                      <MenuItem key={toolchain} value={toolchain}>
                        {toolchain}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              )}
            />
          </Grid>
          <Grid size={{ xs: 12, md: 6 }}>
            <SpaceReleaseTargetField spaceId={unit?.SpaceID} unreleasable={watch('Unreleasable')} />
          </Grid>
          <Grid size={{ xs: 12, md: 6 }}>
            <Controller
              name='Unreleasable'
              control={control}
              render={({ field }) => (
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={!!field.value}
                      onChange={(event) => field.onChange(event.target.checked)}
                      data-testid='unit-unreleasable-checkbox'
                    />
                  }
                  label='Leave out of releases (Unreleasable)'
                />
              )}
            />
          </Grid>
        </Grid>
      </SectionCard>

      <MapFieldSection
        control={control}
        name='Labels'
        title='Labels'
        itemLabel='label'
        validation='label'
        keyPlaceholder='Environment'
        valuePlaceholder='production'
        testId='unit-labels'
      />
      <MapFieldSection
        control={control}
        name='Annotations'
        title='Annotations'
        description='An annotation whose key starts with URL- is listed as a link in the Overview.'
        itemLabel='annotation'
        validation='annotation'
        multilineValues
        testId='unit-annotations'
      />
      <MapFieldSection
        control={control}
        name='DeleteGates'
        title='Delete Gates'
        description='Delete gates prevent accidental deletion of this Unit. Remove all gates before deletion.'
        itemLabel='delete gate'
        validation='label'
        keysOnly
        keyPlaceholder='e.g., manual-review, backup-verified'
        testId='unit-delete-gates'
      />
      <MapFieldSection
        control={control}
        name='DestroyGates'
        title='Destroy Gates'
        description='Destroy gates prevent destroying this Unit. Remove all gates before destroying it.'
        itemLabel='destroy gate'
        validation='label'
        keysOnly
        keyPlaceholder='e.g., production-protection'
        testId='unit-destroy-gates'
      />

      <SettingsFormFooter actions={actions}>
        <Button variant='contained' type='submit' disabled={isSaving} data-testid='unit-settings-save'>
          Save
        </Button>
      </SettingsFormFooter>
    </Box>
  );
};
