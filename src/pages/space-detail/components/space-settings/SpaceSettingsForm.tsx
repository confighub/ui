// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

// The settings of one Space: its name, metadata, the entities it references and how it selects
// Triggers and Attributes. The Space page shows it in its Settings tab and the Space list in a
// drawer, so both edit a Space the same way.

import { type ReactNode, useEffect, useRef } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Link as RouterLink } from 'react-router-dom';

import { CopyToClipboard } from '@/components/copy-to-clipboard/CopyToClipboard';
import { EntityRefSelect } from '@/components/entity-ref-select/EntityRefSelect';
import {
  useComponentRefOptions,
  useFilterRefOptions,
  useTargetRefOptions,
} from '@/components/entity-ref-select/useEntityRefOptions';
import { LabelTextField } from '@/components/label-text-field/LabelTextField';
import { MapFieldSection } from '@/components/map-field-editor/MapFieldSection';
import { type MapRow, mapToRows, rowsToGates, rowsToMap } from '@/components/map-field-editor/map-rows';
import { SettingsFormFooter } from '@/components/settings-form-footer/SettingsFormFooter';
import { SectionCard } from '@/components/styled';
import { useApiErrorMessage } from '@/hooks/useApiErrorMessage';
import { ExtendedSpaceRead, SpaceRead, useUpdateSpaceMutation } from '@confighub/rtk-query';
import { SLUG_PATTERN, SLUG_PATTERN_MESSAGE } from '@confighub/api';
import { formatRelative } from '@/utility/date-format';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Grid from '@mui/material/Grid2';
import Link from '@mui/material/Link';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';

// The entities the settings name, which a read of the Space includes.
export const SPACE_SETTINGS_INCLUDE =
  'ComponentID,ReleaseTargetID,TriggerFilterID,TriggerIDs,AttributeFilterID';

interface SpaceFormData {
  Slug: string;
  DisplayName: string;
  Labels: MapRow[];
  Annotations: MapRow[];
  DeleteGates: MapRow[];
  ComponentID: string;
  ReleaseTargetID: string;
  WhereTrigger: string;
  TriggerFilterID: string;
  WhereAttribute: string;
  AttributeFilterID: string;
}

const spaceFormValues = (space: SpaceRead | undefined): SpaceFormData => ({
  Slug: space?.Slug || '',
  DisplayName: space?.DisplayName || '',
  Labels: mapToRows(space?.Labels),
  Annotations: mapToRows(space?.Annotations),
  DeleteGates: mapToRows(space?.DeleteGates),
  ComponentID: space?.ComponentID || '',
  ReleaseTargetID: space?.ReleaseTargetID || '',
  WhereTrigger: space?.WhereTrigger || '',
  TriggerFilterID: space?.TriggerFilterID || '',
  WhereAttribute: space?.WhereAttribute || '',
  AttributeFilterID: space?.AttributeFilterID || '',
});

// How many applied Triggers the settings name before linking to the rest.
const APPLIED_TRIGGER_CHIP_LIMIT = 8;

const ReadOnlyField = ({ label, text, copy }: { label: string; text: string; copy?: boolean }) => (
  <LabelTextField
    label={label}
    text={text || 'N/A'}
    textColor='text.primary'
    labelColor='text.secondary'
    labelVariant='caption'
    textVariant='body1'
    endAdornment={copy && text ? <CopyToClipboard text={text} /> : undefined}
  />
);

export interface SpaceSettingsFormProps {
  /** The Space, with the entities it references */
  extendedSpace: ExtendedSpaceRead;
  onSpaceUpdated: () => void;
  setServerError: (message: string) => void;
  /** Shows the Triggers applied to the Space in place, with a way to refresh them */
  onShowAppliedTriggers?: () => void;
  /** The page that shows the Triggers applied to the Space. Use instead of
   *  `onShowAppliedTriggers` where that list is on a different page. */
  appliedTriggersTo?: string;
  /** Drawn beside the Save button, such as a link to the Space's page */
  actions?: ReactNode;
}

export const SpaceSettingsForm = ({
  extendedSpace,
  onSpaceUpdated,
  setServerError,
  onShowAppliedTriggers,
  appliedTriggersTo,
  actions,
}: SpaceSettingsFormProps) => {
  const space = extendedSpace.Space;

  const [updateSpace, { isSuccess, error, isLoading: isSaving }] = useUpdateSpaceMutation();

  const { options: componentOptions, isFetching: isComponentsLoading } = useComponentRefOptions();
  const { options: targetOptions, isFetching: isTargetsLoading } = useTargetRefOptions();
  const { options: triggerFilterOptions, isFetching: isTriggerFiltersLoading } =
    useFilterRefOptions('Trigger');
  const { options: attributeFilterOptions, isFetching: isAttributeFiltersLoading } =
    useFilterRefOptions('Attribute');

  const {
    control,
    handleSubmit,
    formState: { errors },
    reset,
  } = useForm<SpaceFormData>({
    defaultValues: spaceFormValues(space),
  });

  // Only another version of the Space replaces what the form shows, so a refetch of an unchanged
  // Space does not discard an edit.
  const loadedVersion = useRef('');
  useEffect(() => {
    const version = `${space?.SpaceID}:${space?.Version}`;
    if (!space?.SpaceID || loadedVersion.current === version) return;
    loadedVersion.current = version;
    reset(spaceFormValues(space));
  }, [space, reset]);

  useApiErrorMessage(error, isSuccess, setServerError);

  const onSubmit = async (data: SpaceFormData) => {
    const response = await updateSpace({
      spaceId: space?.SpaceID || '',
      space: {
        ...space,
        Slug: data.Slug,
        DisplayName: data.DisplayName || undefined,
        // An empty reference or expression is cleared rather than kept
        ComponentID: data.ComponentID || undefined,
        ReleaseTargetID: data.ReleaseTargetID || undefined,
        WhereTrigger: data.WhereTrigger.trim(),
        TriggerFilterID: data.TriggerFilterID || undefined,
        WhereAttribute: data.WhereAttribute.trim(),
        AttributeFilterID: data.AttributeFilterID || undefined,
        Labels: rowsToMap(data.Labels),
        Annotations: rowsToMap(data.Annotations),
        DeleteGates: rowsToGates(data.DeleteGates),
      },
    });

    if (response.data?.SpaceID) {
      onSpaceUpdated();
    }
  };

  const appliedTriggers = extendedSpace.Triggers || [];
  const appliedTriggerCount = space?.TriggerIDs?.length || 0;

  return (
    <Box component='form' onSubmit={handleSubmit(onSubmit)} data-testid='space-settings-form'>
      <SectionCard title='Basic Information'>
        <Grid container spacing={2}>
          <Grid size={{ xs: 12, md: 6 }}>
            <ReadOnlyField label='Space ID' text={space?.SpaceID || ''} copy />
          </Grid>
          <Grid size={{ xs: 12, md: 6 }}>
            <ReadOnlyField label='Organization ID' text={space?.OrganizationID || ''} copy />
          </Grid>
          <Grid size={{ xs: 6 }}>
            <ReadOnlyField label='Created At' text={formatRelative(space?.CreatedAt) || ''} />
          </Grid>
          <Grid size={{ xs: 6 }}>
            <ReadOnlyField label='Updated At' text={formatRelative(space?.UpdatedAt) || ''} />
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
              name='DisplayName'
              control={control}
              render={({ field }) => (
                <TextField
                  fullWidth
                  label='Display Name'
                  size='small'
                  placeholder='Defaults to the name'
                  slotProps={{ inputLabel: { shrink: true } }}
                  {...field}
                />
              )}
            />
          </Grid>
          <Grid size={{ xs: 12, md: 6 }}>
            <Controller
              name='ComponentID'
              control={control}
              render={({ field }) => (
                <EntityRefSelect
                  label='Component'
                  value={field.value}
                  onChange={field.onChange}
                  options={componentOptions}
                  currentLabel={extendedSpace.Component?.Slug}
                  loading={isComponentsLoading}
                  helperText='The Component this Space is a Variant of'
                  testId='space-component-select'
                />
              )}
            />
          </Grid>
          <Grid size={{ xs: 12, md: 6 }}>
            <Controller
              name='ReleaseTargetID'
              control={control}
              render={({ field }) => (
                <EntityRefSelect
                  label='Release Target'
                  value={field.value}
                  onChange={field.onChange}
                  options={targetOptions}
                  currentLabel={extendedSpace.ReleaseTarget?.Slug}
                  loading={isTargetsLoading}
                  helperText='The default Target of its Units'
                  testId='space-release-target-select'
                />
              )}
            />
          </Grid>
          {space?.UpstreamSpaceID && (
            <Grid size={{ xs: 12 }}>
              <Typography variant='caption' color='text.secondary' sx={{ display: 'block' }}>
                Cloned from
              </Typography>
              <Link component={RouterLink} to={`/spaces/${space.UpstreamSpaceID}`} variant='body2'>
                {space.UpstreamSpaceID}
              </Link>
            </Grid>
          )}
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
        testId='space-labels'
      />
      <MapFieldSection
        control={control}
        name='Annotations'
        title='Annotations'
        itemLabel='annotation'
        validation='annotation'
        multilineValues
        testId='space-annotations'
      />

      <SectionCard title='Triggers'>
        <Typography variant='body2' color='text.secondary' sx={{ mb: 2 }}>
          The Triggers invoked on this Space&apos;s Units, from any Space. With neither a Where
          Trigger nor a Trigger Filter, the Triggers in this Space apply; with both, a Trigger must
          match both.
        </Typography>
        <Grid container spacing={2}>
          <Grid size={{ xs: 12 }}>
            <Controller
              name='WhereTrigger'
              control={control}
              render={({ field }) => (
                <TextField
                  fullWidth
                  multiline
                  minRows={1}
                  label='Where Trigger'
                  size='small'
                  placeholder="Labels.Purpose = 'validation'"
                  slotProps={{
                    inputLabel: { shrink: true },
                    htmlInput: {
                      'data-testid': 'space-where-trigger-input',
                      style: { fontFamily: 'monospace' },
                    },
                  }}
                  {...field}
                />
              )}
            />
          </Grid>
          <Grid size={{ xs: 12 }}>
            <Controller
              name='TriggerFilterID'
              control={control}
              render={({ field }) => (
                <EntityRefSelect
                  label='Trigger Filter'
                  value={field.value}
                  onChange={field.onChange}
                  options={triggerFilterOptions}
                  currentLabel={extendedSpace.TriggerFilter?.Slug}
                  loading={isTriggerFiltersLoading}
                  helperText='A Trigger Filter from any Space'
                  testId='space-trigger-filter-select'
                />
              )}
            />
          </Grid>
          <Grid size={{ xs: 12 }}>
            <Stack direction='row' alignItems='center' spacing={1} sx={{ mb: 0.5 }}>
              <Typography variant='caption' color='text.secondary'>
                Applied Triggers ({appliedTriggerCount})
              </Typography>
              {appliedTriggersTo ? (
                <Link
                  component={RouterLink}
                  to={appliedTriggersTo}
                  variant='caption'
                  data-testid='space-applied-triggers-link'
                >
                  Show and refresh
                </Link>
              ) : (
                <Link
                  component='button'
                  type='button'
                  variant='caption'
                  onClick={onShowAppliedTriggers}
                  data-testid='space-applied-triggers-link'
                >
                  Show and refresh
                </Link>
              )}
            </Stack>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
              {appliedTriggerCount === 0 && (
                <Typography variant='body2' color='text.secondary'>
                  None
                </Typography>
              )}
              {appliedTriggers.slice(0, APPLIED_TRIGGER_CHIP_LIMIT).map((trigger) => (
                <Chip
                  key={trigger.TriggerID}
                  size='small'
                  variant='outlined'
                  label={trigger.Slug}
                  title={`${trigger.FunctionName} on ${trigger.Event}`}
                  component={RouterLink}
                  to={`/spaces/${trigger.SpaceID}?tab=1&edit=${trigger.TriggerID}`}
                  clickable
                />
              ))}
              {appliedTriggerCount > APPLIED_TRIGGER_CHIP_LIMIT && (
                appliedTriggersTo ? (
                  <Chip
                    size='small'
                    label={`+${appliedTriggerCount - APPLIED_TRIGGER_CHIP_LIMIT} more`}
                    component={RouterLink}
                    to={appliedTriggersTo}
                    clickable
                  />
                ) : (
                  <Chip
                    size='small'
                    label={`+${appliedTriggerCount - APPLIED_TRIGGER_CHIP_LIMIT} more`}
                    onClick={onShowAppliedTriggers}
                  />
                )
              )}
            </Box>
          </Grid>
        </Grid>
      </SectionCard>

      <SectionCard title='Attributes'>
        <Typography variant='body2' color='text.secondary' sx={{ mb: 2 }}>
          The Attributes registered for this Space&apos;s Units, from any Space. With neither a
          Where Attribute nor an Attribute Filter, the Attributes in this Space are.
        </Typography>
        <Grid container spacing={2}>
          <Grid size={{ xs: 12 }}>
            <Controller
              name='WhereAttribute'
              control={control}
              render={({ field }) => (
                <TextField
                  fullWidth
                  multiline
                  minRows={1}
                  label='Where Attribute'
                  size='small'
                  slotProps={{
                    inputLabel: { shrink: true },
                    htmlInput: { style: { fontFamily: 'monospace' } },
                  }}
                  {...field}
                />
              )}
            />
          </Grid>
          <Grid size={{ xs: 12 }}>
            <Controller
              name='AttributeFilterID'
              control={control}
              render={({ field }) => (
                <EntityRefSelect
                  label='Attribute Filter'
                  value={field.value}
                  onChange={field.onChange}
                  options={attributeFilterOptions}
                  currentLabel={extendedSpace.AttributeFilter?.Slug}
                  loading={isAttributeFiltersLoading}
                  helperText='An Attribute Filter from any Space'
                />
              )}
            />
          </Grid>
        </Grid>
      </SectionCard>

      <MapFieldSection
        control={control}
        name='DeleteGates'
        title='Delete Gates'
        description='Delete gates prevent accidental deletion of this Space. Remove all gates before deletion.'
        itemLabel='delete gate'
        validation='label'
        keysOnly
        keyPlaceholder='e.g., manual-review, backup-verified'
        testId='space-delete-gates'
      />

      <SettingsFormFooter actions={actions}>
        <Button variant='contained' type='submit' disabled={isSaving} data-testid='space-settings-save'>
          Save
        </Button>
      </SettingsFormFooter>
    </Box>
  );
};
