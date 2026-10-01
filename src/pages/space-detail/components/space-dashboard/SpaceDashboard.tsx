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
import {
  ExtendedSpaceRead,
  SpaceRead,
  useListSpacesQuery,
  useUpdateSpaceMutation,
} from '@confighub/rtk-query';
import { Direction } from '@/types/enums';
import { SLUG_PATTERN, SLUG_PATTERN_MESSAGE } from '@confighub/api';
import { FILTER_URL_PARAMS } from '@/utility/constants/url-params';
import { sumMap } from '@/utility/object-functions';
import TimelineIcon from '@mui/icons-material/Timeline';
import AccordionDetails from '@mui/material/AccordionDetails';
import AccordionSummary from '@mui/material/AccordionSummary';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Divider from '@mui/material/Divider';
import Grid from '@mui/material/Grid2';
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
  space: SpaceRead;
  onSpaceUpdated: () => void;
  setServerError: (message: string) => void;
}

interface SpaceFormData {
  Slug: string;
  Labels?: Record<string, string>;
  Annotations?: Record<string, string>;
  DeleteGates?: Record<string, string>;
}

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
  space,
  onSpaceUpdated,
  setServerError,
}: SpaceDashboardProps) => {
  const navigate = useNavigate();

  const [selectedTab, setSelectedTab] = useState(0);
  const [isAddLabelModalOpen, setIsAddLabelModalOpen] = useState(false);
  const [isAddAnnotationModalOpen, setIsAddAnnotationModalOpen] = useState(false);
  const [isAddDeleteGateModalOpen, setIsAddDeleteGateModalOpen] = useState(false);

  const [updateSpace, { isSuccess, error }] = useUpdateSpaceMutation();
  const editorHeight = usePageHeight(sectionOffset);

  // Fetch extended space data with all statistics
  const { data: spaces = [], isLoading: isSpacesLoading } = useListSpacesQuery({
    summary: true,
  });

  const extendedSpace = spaces.find((s) => s?.Space?.SpaceID === space?.SpaceID) as
    | ExtendedSpaceRead
    | undefined;

  const {
    control,
    handleSubmit,
    formState: { errors },
    watch,
    setValue,
    reset,
  } = useForm<SpaceFormData>({
    values: {
      Slug: space?.Slug || '',
      Labels: space?.Labels || {},
      Annotations: space?.Annotations || {},
      DeleteGates: space?.DeleteGates
        ? Object.fromEntries(
            Object.entries(space.DeleteGates).map(([key, value]) => [key, String(value)]),
          )
        : {},
    },
  });

  const { labelHandlers, annotationHandlers, deleteGateHandlers } = useKeyValueHandlers(
    setValue,
    watch,
  );

  useEffect(() => {
    if (!space?.SpaceID) return;

    reset({
      Slug: space?.Slug || '',
      Labels: space?.Labels || {},
      Annotations: space?.Annotations || {},
      DeleteGates: space?.DeleteGates
        ? Object.fromEntries(
            Object.entries(space.DeleteGates).map(([key, value]) => [key, String(value)]),
          )
        : {},
    });
  }, [space, reset]);

  useApiErrorMessage(error, isSuccess, setServerError);

  const onSubmit = async (data: SpaceFormData) => {
    const response = await updateSpace({
      spaceId: space?.SpaceID || '',
      space: {
        ...space,
        Slug: data.Slug,
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
    const spaceFilter = `SpaceID = '${space.SpaceID}'`;
    const fullWhere = whereClause ? `${spaceFilter} AND ${whereClause}` : spaceFilter;
    params.set(FILTER_URL_PARAMS.WHERE, fullWhere);
    navigate(`/units?${params.toString()}`);
  };

  const handleNavigateToBridgeWorkers = () => {
    const params = new URLSearchParams();
    params.set(FILTER_URL_PARAMS.WHERE, `SpaceID = '${space.SpaceID}'`);
    navigate(`/bridge-workers?${params.toString()}`);
  };

  const handleNavigateToTargets = () => {
    const params = new URLSearchParams();
    params.set(FILTER_URL_PARAMS.WHERE, `SpaceID = '${space.SpaceID}'`);
    navigate(`/targets?${params.toString()}`);
  };

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
              {/* Primary Statistics Section */}
              <Box>
                <Stack direction='row' alignItems='center' spacing={1} mb={1.5}>
                  <TimelineIcon />
                  <Typography variant='h6'>Overview</Typography>
                </Stack>
                <Grid container spacing={1.5}>
                  <Grid size={{ xs: 6, sm: 4 }}>
                    <StatCard
                      title='Total Units'
                      value={extendedSpace?.TotalUnitCount || 0}
                      loading={isSpacesLoading}
                      onClick={() => handleNavigateToUnits('')}
                    />
                  </Grid>
                  <Grid size={{ xs: 6, sm: 4 }}>
                    <StatCard
                      title='Bridge Workers'
                      value={extendedSpace?.TotalBridgeWorkerCount || 0}
                      loading={isSpacesLoading}
                      onClick={handleNavigateToBridgeWorkers}
                    />
                  </Grid>
                  <Grid size={{ xs: 6, sm: 4 }}>
                    <StatCard
                      title='Event Triggers'
                      value={sumMap(extendedSpace?.TriggerCountByEventType) || 0}
                      loading={isSpacesLoading}
                    />
                  </Grid>
                  <Grid size={{ xs: 6, sm: 4 }}>
                    <StatCard
                      title='Targets'
                      value={extendedSpace?.TotalTargetCount || 0}
                      loading={isSpacesLoading}
                      onClick={handleNavigateToTargets}
                    />
                  </Grid>
                </Grid>
              </Box>

              {/* Status & Issues Section */}
              <Box>
                <Typography variant='subtitle2' color='text.secondary' mb={1.5}>
                  Status & Issues
                </Typography>
                <Grid container spacing={1.5}>
                  <Grid size={{ xs: 6, sm: 3 }}>
                    <StatCard
                      title='Upgradable Units'
                      value={extendedSpace?.UpgradableUnitCount || 0}
                      loading={isSpacesLoading}
                      onClick={() =>
                        handleNavigateToUnits(
                          'UpstreamRevisionNum < UpstreamUnit.HeadRevisionNum',
                        )
                      }
                    />
                  </Grid>
                  <Grid size={{ xs: 6, sm: 3 }}>
                    <StatCard
                      title='Unreleased Units'
                      value={extendedSpace?.UnreleasedUnitCount || 0}
                      loading={isSpacesLoading}
                      onClick={() =>
                        handleNavigateToUnits('HeadRevisionNum > LastReleasedRevisionNum')
                      }
                    />
                  </Grid>
                  <Grid size={{ xs: 6, sm: 3 }}>
                    <StatCard
                      title='Gated Units'
                      value={extendedSpace?.GatedUnitCount || 0}
                      loading={isSpacesLoading}
                      onClick={() => handleNavigateToUnits('LEN(ValidationErrors) > 0')}
                    />
                  </Grid>
                  <Grid size={{ xs: 6, sm: 3 }}>
                    <StatCard
                      title='Unlinked Units'
                      value={extendedSpace?.UnlinkedUnitCount || 0}
                      loading={isSpacesLoading}
                    />
                  </Grid>
                </Grid>
              </Box>
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
