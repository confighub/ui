// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { useEffect, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';

import { CopyToClipboard } from '@/components/copy-to-clipboard/CopyToClipboard';
import { AddLabelModal } from '@/components/forms/add-label-modal/AddLabelModal';
import { LabelTextField } from '@/components/label-text-field/LabelTextField';
import { LabelsAccordion } from '@/components/labels/LabelsAccordion';
import { SettingsTabs } from '@/components/settings-tabs/SettingsTabs';
import { Section } from '@/components/styled';
import { BorderedAccordion } from '@/components/styled';
import { useApiErrorMessage } from '@/hooks/useApiErrorMessage';
import { useKeyValueHandlers } from '@/hooks/useKeyValueHandlers';
import { usePageHeight } from '@/hooks/usePageHeight';
import { EntityRefSelect } from '@/components/entity-ref-select/EntityRefSelect';
import {
  useComponentRefOptions,
  useFilterRefOptions,
  useTargetRefOptions,
} from '@/components/entity-ref-select/useEntityRefOptions';
import {
  ExtendedSpaceRead,
  SpaceRead,
  useUpdateSpaceMutation,
} from '@confighub/rtk-query';
import { Direction } from '@/types/enums';
import { SLUG_PATTERN, SLUG_PATTERN_MESSAGE } from '@confighub/api';
import { FILTER_URL_PARAMS } from '@/utility/constants/url-params';
import { SPACE_SUMMARY_COUNTS, type SpaceSummaryCount } from '@/utility/space-summary-counts';
import TimelineIcon from '@mui/icons-material/Timeline';
import AccordionDetails from '@mui/material/AccordionDetails';
import AccordionSummary from '@mui/material/AccordionSummary';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Chip from '@mui/material/Chip';
import Divider from '@mui/material/Divider';
import Grid from '@mui/material/Grid2';
import Link from '@mui/material/Link';
import Skeleton from '@mui/material/Skeleton';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { styled } from '@mui/material/styles';

import { formatRelative } from '@/utility/date-format';

const Container = styled('div')`
  width: 100%;
`;

const Form = styled('form')`
  display: flex;
`;

const Main = styled('div')`
  width: 60%;
  overflow-y: auto;
  background-color: hsla(215, 15%, 97%, 0.5);

  /* Scrollbar */
  ::-webkit-scrollbar {
    width: 5px;
  }

  /* Track */
  ::-webkit-scrollbar-track {
    background: hsla(215, 15%, 97%, 0.5);
    border-radius: 10px;
  }

  /* Handle */
  ::-webkit-scrollbar-thumb {
    background: #ccc;
    border-radius: 10px;
  }
`;

const Aside = styled('aside')`
  display: flex;
  flex-direction: column;
  width: 40%;
  padding: 0 1rem;
  height: 100%;
  overflow-y: auto;

  border-left: 1px solid rgba(224, 224, 224, 1);
  /* Scrollbar */
  ::-webkit-scrollbar {
    width: 5px;
  }

  /* Track */
  ::-webkit-scrollbar-track {
    background: white;
    border-radius: 10px;
  }

  /* Handle */
  ::-webkit-scrollbar-thumb {
    background: #ccc;
    border-radius: 10px;
  }
`;

const StickyTab = styled(Box)`
  position: sticky;
  top: 0;
  z-index: 1000;
  background-color: white;
  padding-top: 5px;
`;

const sectionOffset = 212;

export interface SpaceDashboardProps {
  /** The Space with its summary counts and the entities it references */
  extendedSpace: ExtendedSpaceRead;
  isLoading?: boolean;
  onSpaceUpdated: () => void;
  setServerError: (message: string) => void;
  /** Switch to the Triggers tab, showing the Triggers applied to the Space */
  onShowAppliedTriggers: () => void;
}

interface SpaceFormData {
  Slug: string;
  DisplayName: string;
  Labels?: Record<string, string>;
  Annotations?: Record<string, string>;
  DeleteGates?: Record<string, string>;
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
  Labels: space?.Labels || {},
  Annotations: space?.Annotations || {},
  DeleteGates: space?.DeleteGates
    ? Object.fromEntries(
        Object.entries(space.DeleteGates).map(([key, value]) => [key, String(value)]),
      )
    : {},
  ComponentID: space?.ComponentID || '',
  ReleaseTargetID: space?.ReleaseTargetID || '',
  WhereTrigger: space?.WhereTrigger || '',
  TriggerFilterID: space?.TriggerFilterID || '',
  WhereAttribute: space?.WhereAttribute || '',
  AttributeFilterID: space?.AttributeFilterID || '',
});

// How many applied Triggers the settings panel names before linking to the rest.
const APPLIED_TRIGGER_CHIP_LIMIT = 8;

const StatCard = ({
  title,
  value,
  loading,
  onClick,
}: {
  title: string;
  value: number | string;
  loading?: boolean;
  onClick?: () => void;
}) => {
  return (
    <Card
      elevation={0}
      onClick={onClick}
      sx={{
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: 2,
        transition: 'all 0.2s ease-in-out',
        height: '100%',
        cursor: onClick ? 'pointer' : 'default',
        '&:hover': onClick
          ? {
              borderColor: 'primary.main',
              boxShadow: '0px 4px 12px rgba(0,0,0,0.08)',
              transform: 'translateY(-1px)',
            }
          : {},
      }}
    >
      <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 } }}>
        <Stack direction='row' spacing={1.5} alignItems='center'>
          <Box sx={{ minWidth: 0 }}>
            <Typography
              variant='caption'
              color='text.secondary'
              sx={{ display: 'block', lineHeight: 1.2 }}
            >
              {title}
            </Typography>
            {loading ? (
              <Skeleton width={40} height={24} />
            ) : (
              <Typography variant='h5' fontWeight={600} sx={{ lineHeight: 1.2 }}>
                {value}
              </Typography>
            )}
          </Box>
        </Stack>
      </CardContent>
    </Card>
  );
};

export const SpaceDashboard = ({
  extendedSpace,
  isLoading = false,
  onSpaceUpdated,
  setServerError,
  onShowAppliedTriggers,
}: SpaceDashboardProps) => {
  const navigate = useNavigate();
  const space = extendedSpace.Space;

  const [selectedTab, setSelectedTab] = useState(0);
  const [isAddLabelModalOpen, setIsAddLabelModalOpen] = useState(false);
  const [isAddAnnotationModalOpen, setIsAddAnnotationModalOpen] = useState(false);
  const [isAddDeleteGateModalOpen, setIsAddDeleteGateModalOpen] = useState(false);

  const [updateSpace, { isSuccess, error }] = useUpdateSpaceMutation();
  const editorHeight = usePageHeight(sectionOffset);

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
    watch,
    setValue,
    reset,
  } = useForm<SpaceFormData>({
    values: spaceFormValues(space),
  });

  const { labelHandlers, annotationHandlers, deleteGateHandlers } = useKeyValueHandlers(
    setValue,
    watch,
  );

  useEffect(() => {
    if (!space?.SpaceID) return;
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
        Labels: data.Labels || {},
        Annotations: data.Annotations || {},
        DeleteGates: Object.fromEntries(
          Object.entries(data.DeleteGates || {}).map(([key, value]) => [
            key,
            typeof value === 'string' ? value === 'true' : value === true,
          ]),
        ),
      },
    });

    if (response.data?.SpaceID) {
      onSpaceUpdated();
    }
  };

  const handleNavigateToUnits = (whereClause: string) => {
    const params = new URLSearchParams();
    const spaceFilter = `SpaceID = '${space?.SpaceID}'`;
    const fullWhere = whereClause ? `${spaceFilter} AND ${whereClause}` : spaceFilter;
    params.set(FILTER_URL_PARAMS.WHERE, fullWhere);
    navigate(`/units?${params.toString()}`);
  };

  const handleNavigateToTargets = () => {
    const params = new URLSearchParams();
    params.set(FILTER_URL_PARAMS.WHERE, `SpaceID = '${space?.SpaceID}'`);
    navigate(`/targets?${params.toString()}`);
  };

  // A Unit count opens the Units it counts; Targets and Triggers open their lists.
  const statClickHandler = (c: SpaceSummaryCount): (() => void) | undefined => {
    if (c.unitWhere !== undefined) return () => handleNavigateToUnits(c.unitWhere || '');
    if (c.field === 'TotalTargetCount') return handleNavigateToTargets;
    if (c.field === 'TriggerCountByEventType') return onShowAppliedTriggers;
    return undefined;
  };

  const appliedTriggers = extendedSpace.Triggers || [];
  const appliedTriggerCount = space?.TriggerIDs?.length || 0;

  return (
    <Container>
      <BorderedAccordion expanded>
        <AccordionSummary>
          <Typography sx={{ pl: 1 }} variant='h6'>
            Dashboard
          </Typography>
        </AccordionSummary>
        <Divider />
        <AccordionDetails
          sx={{
            display: 'flex',
            flexDirection: 'row',
            borderBottomLeftRadius: '8px',
            borderBottomRightRadius: '8px',
            height: editorHeight,
            overflowY: 'none',
            padding: 0,
          }}
        >
          <Main
            sx={{
              backgroundColor: 'white',
              borderBottomLeftRadius: '8px',
              p: 2,
            }}
          >
            <Stack spacing={2.5}>
              {(['Units', 'Entities'] as const).map((group) => (
                <Box key={group}>
                  <Stack direction='row' alignItems='center' spacing={1} mb={1.5}>
                    {group === 'Units' && <TimelineIcon />}
                    <Typography variant={group === 'Units' ? 'h6' : 'subtitle2'} color={group === 'Units' ? undefined : 'text.secondary'}>
                      {group === 'Units' ? 'Units' : 'Contents'}
                    </Typography>
                  </Stack>
                  <Grid container spacing={1.5}>
                    {SPACE_SUMMARY_COUNTS.filter((c) => c.group === group).map((c) => (
                      <Grid key={c.field} size={{ xs: 6, sm: 4, md: 3 }}>
                        <StatCard
                          title={c.label}
                          value={c.getValue(extendedSpace)}
                          loading={isLoading}
                          onClick={statClickHandler(c)}
                        />
                      </Grid>
                    ))}
                  </Grid>
                </Box>
              ))}
            </Stack>
          </Main>

          <Aside>
            <StickyTab>
              <SettingsTabs
                tabs={['Settings']}
                onTabSelected={(tab: number) => setSelectedTab(tab)}
                defaultValue={selectedTab}
              />
              <Divider />
            </StickyTab>
            <Section $display={selectedTab === 0} $direction={Direction.FadeIn}>
              <Form onSubmit={handleSubmit(onSubmit)}>
                <Grid sx={{ pt: 1, pb: 1 }} container spacing={1.5}>
                  <Grid size={{ xs: 6 }}>
                    <LabelTextField
                      label='Space ID'
                      text={space?.SpaceID || 'N/A'}
                      textColor='text.primary'
                      labelColor='text.secondary'
                      labelVariant='caption'
                      textVariant='body1'
                      endAdornment={<CopyToClipboard text={space?.SpaceID || ''} />}
                    />
                  </Grid>
                  <Grid size={{ xs: 6 }} sx={{ mt: 1 }}>
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
                          variant='outlined'
                          slotProps={{
                            inputLabel: {
                              shrink: true,
                            },
                          }}
                          {...field}
                        />
                      )}
                    />
                  </Grid>

                  <Grid size={{ xs: 6 }}>
                    <LabelTextField
                      label='Organization ID'
                      text={space?.OrganizationID || 'N/A'}
                      textColor='text.primary'
                      labelColor='text.secondary'
                      labelVariant='caption'
                      textVariant='body1'
                      endAdornment={<CopyToClipboard text={space?.OrganizationID || ''} />}
                    />
                  </Grid>
                  <Grid size={{ xs: 6 }}>
                    <LabelsAccordion
                      onLabelAddClicked={() => setIsAddLabelModalOpen(true)}
                      onLabelDeleted={labelHandlers.onDeleted}
                      labels={watch('Labels') || {}}
                      variant='outlined'
                      limit={1}
                    />
                  </Grid>

                  <Grid size={{ xs: 6 }}>
                    <LabelTextField
                      label='Created At'
                      text={formatRelative(space?.CreatedAt) || 'N/A'}
                      textColor='text.primary'
                      labelColor='text.secondary'
                      labelVariant='caption'
                      textVariant='body1'
                    />
                  </Grid>

                  <Grid size={{ xs: 6 }}>
                    <LabelsAccordion
                      onLabelAddClicked={() => setIsAddAnnotationModalOpen(true)}
                      onLabelDeleted={annotationHandlers.onDeleted}
                      type='Annotations'
                      labels={watch('Annotations') || {}}
                      variant='outlined'
                      limit={1}
                    />
                  </Grid>

                  <Grid size={{ xs: 6 }}>
                    <LabelTextField
                      label='Updated At'
                      text={formatRelative(space?.UpdatedAt) || 'N/A'}
                      textColor='text.primary'
                      labelColor='text.secondary'
                      labelVariant='caption'
                      textVariant='body1'
                    />
                  </Grid>

                  <Grid size={{ xs: 6 }}>
                    <LabelsAccordion
                      onLabelAddClicked={() => setIsAddDeleteGateModalOpen(true)}
                      onLabelDeleted={deleteGateHandlers.onDeleted}
                      type='DeleteGates'
                      labels={watch('DeleteGates') || {}}
                      variant='outlined'
                      limit={2}
                    />
                  </Grid>

                  <Grid size={{ xs: 12 }}>
                    <Controller
                      name='DisplayName'
                      control={control}
                      render={({ field }) => (
                        <TextField
                          fullWidth
                          label='Display Name'
                          size='small'
                          slotProps={{ inputLabel: { shrink: true } }}
                          {...field}
                        />
                      )}
                    />
                  </Grid>

                  <Grid size={{ xs: 6 }}>
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

                  <Grid size={{ xs: 6 }}>
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

                  <Grid size={{ xs: 12 }}>
                    <Divider textAlign='left' sx={{ my: 0.5 }}>
                      <Typography variant='caption' color='text.secondary'>
                        Triggers
                      </Typography>
                    </Divider>
                    <Typography variant='body2' color='text.secondary'>
                      The Triggers invoked on this Space&apos;s Units, from any Space. With neither a
                      Where Trigger nor a Trigger Filter, the Triggers in this Space apply; with both,
                      a Trigger must match both.
                    </Typography>
                  </Grid>

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
                            htmlInput: { 'data-testid': 'space-where-trigger-input', style: { fontFamily: 'monospace' } },
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
                      <Link
                        component='button'
                        type='button'
                        variant='caption'
                        onClick={onShowAppliedTriggers}
                        data-testid='space-applied-triggers-link'
                      >
                        Show and refresh
                      </Link>
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
                          onClick={() =>
                            navigate(
                              trigger.SpaceID === space?.SpaceID
                                ? `?tab=1&edit=${trigger.TriggerID}`
                                : `/spaces/${trigger.SpaceID}?tab=1&edit=${trigger.TriggerID}`,
                            )
                          }
                        />
                      ))}
                      {appliedTriggerCount > APPLIED_TRIGGER_CHIP_LIMIT && (
                        <Chip
                          size='small'
                          label={`+${appliedTriggerCount - APPLIED_TRIGGER_CHIP_LIMIT} more`}
                          onClick={onShowAppliedTriggers}
                        />
                      )}
                    </Box>
                  </Grid>

                  <Grid size={{ xs: 12 }}>
                    <Divider textAlign='left' sx={{ my: 0.5 }}>
                      <Typography variant='caption' color='text.secondary'>
                        Attributes
                      </Typography>
                    </Divider>
                    <Typography variant='body2' color='text.secondary'>
                      The Attributes registered for this Space&apos;s Units, from any Space. With
                      neither a Where Attribute nor an Attribute Filter, the Attributes in this Space
                      are.
                    </Typography>
                  </Grid>

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

                  {space?.UpstreamSpaceID && (
                    <Grid size={{ xs: 12 }}>
                      <Typography variant='caption' color='text.secondary' sx={{ display: 'block' }}>
                        Cloned from
                      </Typography>
                      <Link
                        component='button'
                        type='button'
                        variant='body2'
                        onClick={() => navigate(`/spaces/${space.UpstreamSpaceID}`)}
                      >
                        {space.UpstreamSpaceID}
                      </Link>
                    </Grid>
                  )}

                  <Grid size={{ xs: 12 }}>
                    <Button variant='contained' fullWidth type='submit'>
                      Save
                    </Button>
                  </Grid>
                </Grid>
              </Form>
            </Section>
          </Aside>
        </AccordionDetails>
        <AddLabelModal
          isAddModalOpen={isAddLabelModalOpen}
          onAddModalClosed={() => setIsAddLabelModalOpen(false)}
          onLabelAdded={labelHandlers.onAdded}
        />
        <AddLabelModal
          isAddModalOpen={isAddAnnotationModalOpen}
          onAddModalClosed={() => setIsAddAnnotationModalOpen(false)}
          onLabelAdded={annotationHandlers.onAdded}
          type='Annotations'
        />
        <AddLabelModal
          isAddModalOpen={isAddDeleteGateModalOpen}
          onAddModalClosed={() => setIsAddDeleteGateModalOpen(false)}
          onLabelAdded={deleteGateHandlers.onAdded}
          type='DeleteGates'
        />
      </BorderedAccordion>
    </Container>
  );
};
