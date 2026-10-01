// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { useEffect, useMemo, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';

import { CopyToClipboard } from '@/components/copy-to-clipboard/CopyToClipboard';
import { DEFAULT_TOOLCHAIN_TYPES } from '@/components/query-builder';
import { AddLabelModal } from '@/components/forms/add-label-modal/AddLabelModal';
import { LabelTextField } from '@/components/label-text-field/LabelTextField';
import { LabelsAccordion } from '@/components/labels/LabelsAccordion';
import { SettingsTabs } from '@/components/settings-tabs/SettingsTabs';
import { SkeletonForm } from '@/components/skeleton-form/SkeletonForm';
import { Section } from '@/components/styled';
import { BorderedAccordion } from '@/components/styled';
import { useAppDispatch } from '@/hooks/useApp';
import { useKeyValueHandlers } from '@/hooks/useKeyValueHandlers';
import { usePageHeight } from '@/hooks/usePageHeight';
import {
  FunctionInvocationsResponse,
  ListFunctionsApiResponse,
  Unit,
  ExtendedUnitRead,
  UnitRead,
  useInvokeFunctionsMutation,
} from '@confighub/rtk-query';
import {
  RevisionRead,
  UpdateUnitApiArg,
  UserRead,
  useListExtendedRevisionsQuery,
} from '@confighub/rtk-query';
import { UnitEventRead, useListUnitEventsQuery } from '@confighub/rtk-query';
import { useUpdateUnitMutation } from '@confighub/rtk-query';
import { useListAllTargetsQuery } from '@confighub/rtk-query';
import { setAlert } from '@/state/slices/alert';
import { Direction } from '@/types/enums';
import { SLUG_PATTERN, SLUG_PATTERN_MESSAGE } from '@confighub/api';
import { isIDInvalid } from '@/utility/validation-functions';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import TimelineIcon from '@mui/icons-material/Timeline';
import Timeline from '@mui/lab/Timeline';
import TimelineConnector from '@mui/lab/TimelineConnector';
import TimelineContent from '@mui/lab/TimelineContent';
import TimelineDot from '@mui/lab/TimelineDot';
import TimelineItem, { timelineItemClasses } from '@mui/lab/TimelineItem';
import TimelineSeparator from '@mui/lab/TimelineSeparator';
import AccordionDetails from '@mui/material/AccordionDetails';
import AccordionSummary from '@mui/material/AccordionSummary';
import Alert from '@mui/material/Alert';
import Autocomplete from '@mui/material/Autocomplete';
import Avatar from '@mui/material/Avatar';
import Badge from '@mui/material/Badge';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Divider from '@mui/material/Divider';
import FormControl from '@mui/material/FormControl';
import Grid from '@mui/material/Grid2';
import InputLabel from '@mui/material/InputLabel';
import Link from '@mui/material/Link';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import Skeleton from '@mui/material/Skeleton';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { styled } from '@mui/material/styles';
import dayjs from 'dayjs';
import groupBy from 'lodash/groupBy';

import { formatRelative } from '@/utility/date-format';

import { ActionSidebar } from '../action-side-bar/ActionSideBar';

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

const isRevision = (item: RevisionRead): item is RevisionRead & UserRead => {
  return 'RevisionID' in item;
};

const isUnitEvent = (item: UnitEventRead): item is UnitEventRead => {
  return 'UnitEventID' in item;
};

const sectionOffset = 254;


export interface DashboardProps {
  currentUnitExtended: ExtendedUnitRead;
  setRefresh: () => void;
  onApplyGateClicked: (gateName: string) => void;
  functions: ListFunctionsApiResponse;
  upstreamUnit?: UnitRead;
  onUpgrade: () => void;
  isFetchingUnit?: boolean;
  lastPollTimestamp?: number;
}

export type UserExtendedRevision = RevisionRead & {
  DisplayName?: string;
  ProfilePictureURL?: string;
};

const sanitizeUrl = (url: string): string | null => {
  try {
    const trimmedUrl = url.trim();
    if (!trimmedUrl) return null;

    // If URL doesn't have a protocol, assume https://
    const urlWithProtocol = trimmedUrl.match(/^https?:\/\//i)
      ? trimmedUrl
      : `https://${trimmedUrl}`;

    // Validate the URL
    const urlObj = new URL(urlWithProtocol);

    // Only allow http and https protocols
    if (!['http:', 'https:'].includes(urlObj.protocol)) {
      return null;
    }

    return urlObj.href;
  } catch {
    return null;
  }
};

export const Dashboard = ({
  currentUnitExtended,
  setRefresh,
  onApplyGateClicked,
  functions,
  upstreamUnit,
  onUpgrade,
  isFetchingUnit,
  lastPollTimestamp,
}: DashboardProps) => {
  // Hooks
  const navigate = useNavigate();
  const dispatch = useAppDispatch();

  // State
  const [isAddLabelModalOpen, setIsAddLabelModalOpen] = useState(false);
  const [isAddAnnotationModalOpen, setIsAddAnnotationModalOpen] = useState(false);
  const [isAddDeleteGateModalOpen, setIsAddDeleteGateModalOpen] = useState(false);
  const [isAddDestroyGateModalOpen, setIsAddDestroyGateModalOpen] = useState(false);
  const [selectedTab, setSelectedTab] = useState(0);
  const [updateUnit] = useUpdateUnitMutation();

  // Api
  const { revisions = [], isRevisionsLoading } = useListExtendedRevisionsQuery(
    {
      spaceId: currentUnitExtended?.Unit?.SpaceID || '',
      unitId: currentUnitExtended?.Unit?.UnitID || '',
      include: 'UserID',
    },
    {
      skip: !currentUnitExtended?.Unit?.SpaceID || !currentUnitExtended?.Unit?.UnitID,
      selectFromResult: ({ data, isLoading }) => ({
        revisions: data?.map(
          (revision) =>
            ({
              ...revision?.Revision,
              DisplayName: revision?.User?.DisplayName,
              ProfilePictureURL: revision?.User?.ProfilePictureURL,
            }) as UserExtendedRevision, // Cast this this explicitly to UserExtendedRevision
        ),
        isRevisionsLoading: isLoading,
      }),
    },
  );

  const [invokeFunctionsMutation, { data: resources = [] }] = useInvokeFunctionsMutation();

  const editorHeight = usePageHeight(sectionOffset);

  const unit = currentUnitExtended?.Unit || ({} as UnitRead);

  const validationErrors = Object.entries(unit?.ValidationErrors ?? {}).map(([key, value]) => {
    return { name: key, value };
  });

  const {
    data: extendedTargets = [],
    isError: isTargetsError,
    isLoading: isTargetsLoading,
  } = useListAllTargetsQuery({ include: 'SpaceID' });

  const sortedTargets = useMemo(() => {
    return [...extendedTargets].sort((a, b) => {
      const aIsOwn = a.Space?.SpaceID === unit?.SpaceID;
      const bIsOwn = b.Space?.SpaceID === unit?.SpaceID;
      if (aIsOwn !== bIsOwn) return aIsOwn ? -1 : 1;
      const spaceCmp = (a.Space?.DisplayName ?? '').localeCompare(b.Space?.DisplayName ?? '');
      if (spaceCmp !== 0) return spaceCmp;
      return (a.Target?.Slug ?? '').localeCompare(b.Target?.Slug ?? '');
    });
  }, [extendedTargets, unit?.SpaceID]);

  const {
    data: events = [],
    isLoading: isEventsLoading,
    isUninitialized: isEventsUninitialized,
  } = useListUnitEventsQuery(
    { spaceId: unit?.SpaceID || '', unitId: unit?.UnitID || '' },
    { skip: !unit?.SpaceID || !unit?.UnitID },
  );

  // Load resources
  useEffect(() => {
    if (unit?.UnitID) {
      invokeFunctionsMutation({
        spaceId: unit?.SpaceID || '',
        // unitId: unit?.UnitID || '',
        where: `UnitID='${unit?.UnitID}'`,
        functionInvocationsRequest: {
          FunctionInvocations: [
            {
              FunctionName: 'get-resources',
              Arguments: [],
            },
          ],
        },
      });
    }
  }, [unit]);

  const currentUnit =
    resources?.find((item) => item?.UnitID === unit?.UnitID) ||
    ({} as FunctionInvocationsResponse);

  const mergedEvents = [...(events || []), ...revisions]
    .map((item: UserExtendedRevision | UnitEventRead) => {
      // Shared properties can be defined outside the if/else blocks
      const createdAt = dayjs(item.CreatedAt).toDate();

      // Use the type guards to handle each type of item separately
      if (isUnitEvent(item)) {
        // TypeScript now knows `item` is of type `UnitEventRead`
        return {
          id: item.UnitEventID,
          createdAt: createdAt,
          description: item.Message,
          action: item.Action,
          results: item.Result ? [{ status: 'info', value: item.Result }] : [],
          status: item.Status,
          userName: 'Automated', // Events are automated
          profileURL: '', // Events have no user profile
        };
      }

      if (isRevision(item)) {
        // TypeScript now knows `item` is of type `RevisionRead & UserRead`
        return {
          id: item.RevisionID,
          createdAt: createdAt,
          description: item.Description,
          action: `${item.UserAgent} ${item.Source}`,
          results: Object.entries(item.ValidationErrors || {}).map(([key]) => ({
            status: 'error',
            value: key,
          })),
          status: undefined, // Or a default status, as Revisions don't have this property
          userName: item.DisplayName,
          profileURL: item.ProfilePictureURL,
        };
      }

      // Return null for any items that don't match guards, just in case
      return null;
    })
    .filter((event): event is NonNullable<typeof event> => event !== null)
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  const groupedEvents = groupBy(
    mergedEvents,
    (event) => dayjs(event.createdAt).startOf('week').format('YYYY-MM-DD'), // Group by the start of the week
  );

  const {
    control,
    handleSubmit,
    formState: { errors },
    watch,
    setValue,
    reset,
  } = useForm<Unit>({
    values: {
      Slug: unit?.Slug,
      Labels: unit?.Labels,
      Annotations: unit?.Annotations,
      DeleteGates: unit?.DeleteGates,
      DestroyGates: unit?.DestroyGates,
      TargetID: unit?.TargetID,
      LastChangeDescription: unit?.LastChangeDescription,
      ToolchainType: unit?.ToolchainType,
      // TODO: ...
      SpaceID: '',
    },
  });

  const { labelHandlers, annotationHandlers, deleteGateHandlers, destroyGateHandlers } =
    useKeyValueHandlers(setValue, watch);

  // Extract and sanitize URL- annotations from currentUnitExtended
  const urlAnnotations = Object.entries(currentUnitExtended?.Unit?.Annotations || {})
    .filter(([key]) => key.startsWith('URL-'))
    .map(([key, value]) => ({
      name: key.substring(4), // Remove 'URL-' prefix
      url: sanitizeUrl(value),
    }))
    .filter((link) => link.url !== null) as Array<{ name: string; url: string }>;

  // Extract Status- annotations
  const statusAnnotations = Object.entries(currentUnitExtended?.Unit?.Annotations || {})
    .filter(([key]) => key.startsWith('Status-'))
    .map(([key, value]) => ({
      key: key.substring(7), // Remove 'Status-' prefix
      value,
    }));

  // TODO: Simplify.  And why did I do this?
  useEffect(() => {
    if (!unit?.UnitID) return;

    reset({
      Slug: unit?.Slug,
      Labels: unit?.Labels,
      Annotations: unit?.Annotations,
      DeleteGates: unit?.DeleteGates,
      DestroyGates: unit?.DestroyGates,
      TargetID: unit?.TargetID,
      LastChangeDescription: unit?.LastChangeDescription,
      ToolchainType: unit?.ToolchainType,
      SpaceID: unit?.SpaceID || '',
    });

    setValue('TargetID', unit?.TargetID);
  }, [unit]);

  const onSubmit = async (data: Unit) => {
    // TODO:  Swap this out for code gen and add error section above form in the aside and remove snackbars
    const input: UpdateUnitApiArg = {
      unit: {
        ...currentUnitExtended?.Unit,
        Slug: data.Slug,
        Labels: {
          ...data.Labels,
        },
        Annotations: {
          ...data.Annotations,
        },
        DeleteGates: {
          ...data.DeleteGates,
        },
        DestroyGates: {
          ...data.DestroyGates,
        },
        TargetID: data.TargetID,
        ToolchainType: data.ToolchainType,
      },
      spaceId: currentUnit.SpaceID ?? '',
      unitId: currentUnit.UnitID ?? '',
    };

    const response = await updateUnit(input);

    if (response.data?.Unit?.UnitID) {
      setRefresh();
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
          // @ts-expect-error TODO:
          message: `There was an error updating the Unit. ${response.error?.data?.message}`,
          type: 'error',
          isOpen: true,
        }),
      );
    }
  };

  return (
    <Container>
      <BorderedAccordion expanded>
        <AccordionSummary>
          <Typography sx={{ pl: 1 }} variant='h6'>
            Dashboard
          </Typography>
          <Stack direction='row' spacing={1} alignItems='center' sx={{ pl: 1 }}>
            {statusAnnotations.map((status, index) => (
              <Chip
                key={index}
                label={`${status.key}: ${status.value}`}
                color='warning'
                size='small'
              />
            ))}
          </Stack>
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
            {(upstreamUnit?.HeadRevisionNum ?? 0) > (unit?.UpstreamRevisionNum ?? 0) && (
              <Alert
                severity='warning'
                sx={{
                  mb: 2,
                  alignItems: 'center',
                  '& .MuiAlert-action': {
                    alignItems: 'center',
                    paddingTop: 0,
                  },
                }}
                action={
                  <Button variant='contained' color='primary' size='small' onClick={onUpgrade}>
                    Upgrade
                  </Button>
                }
              >
                This unit needs an upgrade. The upstream unit has a newer revision available.
              </Alert>
            )}
            <Stack direction='row' alignItems='center' spacing={1}>
              <TimelineIcon />
              <Typography variant='h6'>Activity</Typography>
            </Stack>
            {!isEventsUninitialized &&
            !isEventsLoading &&
            !isRevisionsLoading &&
            mergedEvents &&
            mergedEvents.length > 0 ? (
              <Timeline
                sx={{
                  padding: '0px',
                  mt: '0px',
                  [`& .${timelineItemClasses.root}:before`]: {
                    flex: 0,
                    padding: 0,
                  },
                }}
              >
                {Object.entries(groupedEvents).map(([week, events]) => (
                  <div key={week}>
                    <Divider textAlign='left' sx={{ pb: 2 }}>
                      <Chip
                        label={`Week of ${dayjs(week).format('MMMM D, YYYY')}`}
                        size='small'
                      />
                    </Divider>
                    {events.map((event) => (
                      <TimelineItem key={event.id}>
                        <TimelineSeparator>
                          <TimelineDot />
                          <TimelineConnector />
                        </TimelineSeparator>
                        <TimelineContent>
                          <Stack direction='row' alignItems='center' spacing={1}>
                            <Typography
                              sx={{ marginLeft: '2px' }}
                              variant='body1'
                              fontWeight={600}
                            >
                              {event.action}
                            </Typography>
                            <Typography variant='body1'>{event.userName}</Typography>
                            {event.profileURL && (
                              <Avatar src={event.profileURL} sx={{ width: 20, height: 20 }} />
                            )}
                          </Stack>
                          <Typography color='text.secondary' variant='body1'>
                            {event.description}
                          </Typography>
                          <Typography color='text.secondary' variant='caption'>
                            {formatRelative(event.createdAt)}
                          </Typography>
                          <Box>
                            {event?.results?.map((result, index) => (
                              <Chip
                                key={`${result.value}-${index}`}
                                sx={{ mr: 1 }}
                                // @ts-expect-error TODO:
                                color={result.status}
                                label={result.value}
                                size='small'
                              />
                            ))}
                          </Box>
                        </TimelineContent>
                      </TimelineItem>
                    ))}
                  </div>
                ))}
              </Timeline>
            ) : (
              <Timeline
                sx={{
                  [`& .${timelineItemClasses.root}:before`]: {
                    flex: 0,
                    padding: 0,
                  },
                }}
              >
                {Array.from({ length: 5 }).map((_, index) => (
                  <TimelineItem key={index}>
                    <TimelineSeparator>
                      <TimelineDot sx={{ backgroundColor: '#E0E0E0' }} />
                      {index < 4 && <TimelineConnector sx={{ backgroundColor: '#E0E0E0' }} />}
                    </TimelineSeparator>
                    <TimelineContent>
                      <Skeleton
                        variant='text'
                        width='80%'
                        height={20}
                        sx={{ marginBottom: '8px' }}
                      />
                      <Skeleton variant='text' width='40%' height={16} />
                    </TimelineContent>
                  </TimelineItem>
                ))}
              </Timeline>
            )}
          </Main>
          {/* TODO:  This should be moved into a new component */}
          <Aside>
            <StickyTab>
              <SettingsTabs
                tabs={[
                  'Settings',
                  <Stack direction='column' spacing={2}>
                    <Badge badgeContent={validationErrors?.length} color='error' />
                    Validation Errors
                  </Stack>,
                  'URLs',
                ]}
                onTabSelected={(tab: number) => setSelectedTab(tab)}
                defaultValue={selectedTab}
              />
              <Divider />
            </StickyTab>
            <Section $display={selectedTab === 0} $direction={Direction.FadeIn}>
              {currentUnitExtended?.Unit ? (
                <Form onSubmit={handleSubmit(onSubmit)}>
                  <Grid sx={{ pt: 1, pb: 1 }} container spacing={1.5}>
                    <Grid size={{ xs: 6 }}>
                      <LabelTextField
                        label='Unit ID'
                        text={unit?.UnitID || 'N/A'}
                        textColor='text.primary'
                        labelColor='text.secondary'
                        labelVariant='caption'
                        textVariant='body1'
                        endAdornment={<CopyToClipboard text={unit?.UnitID || ''} />}
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
                            InputLabelProps={{
                              shrink: true,
                            }}
                            {...field}
                          />
                        )}
                      />
                    </Grid>

                    <Grid size={{ xs: 6 }}>
                      <LabelTextField
                        label='Upstream Unit'
                        text={upstreamUnit?.Slug || unit?.UpstreamUnitID || 'N/A'}
                        textColor='text.primary'
                        labelColor='text.secondary'
                        labelVariant='caption'
                        textVariant='body1'
                        endAdornment={
                          isIDInvalid(unit?.UpstreamUnitID) ? null : (
                            <>
                              <CopyToClipboard text={unit?.UpstreamUnitID || ''} />
                              <OpenInNewIcon
                                sx={{
                                  color: 'text.secondary',
                                  cursor: 'pointer',
                                }}
                                onClick={() => {
                                  navigate(
                                    `/units/${unit?.UpstreamSpaceID}/${unit?.UpstreamUnitID}`,
                                  );
                                }}
                              />
                            </>
                          )
                        }
                      />
                    </Grid>
                    <Grid size={{ xs: 6 }}>
                      <Controller
                        name='TargetID'
                        control={control}
                        render={({ field: { onChange, value, ref, ...field } }) => (
                          <Autocomplete
                            {...field}
                            options={sortedTargets}
                            loading={isTargetsLoading}
                            loadingText='Loading targets...'
                            noOptionsText={
                              isTargetsError
                                ? 'Failed to load targets'
                                : 'No targets available'
                            }
                            disabled={isTargetsError}
                            groupBy={(option) => option.Space?.DisplayName ?? 'Unknown Space'}
                            getOptionLabel={(option) =>
                              option.Target?.Slug || option.Target?.TargetID || '(unnamed target)'
                            }
                            filterOptions={(options, state) => {
                              const input = state.inputValue.toLowerCase();
                              if (!input) return options;
                              return options.filter((option) => {
                                const name = (option.Target?.Slug ?? '').toLowerCase();
                                if (name.includes(input)) return true;
                                return Object.entries(option.Target?.Labels ?? {}).some(
                                  ([key, val]) =>
                                    key.toLowerCase().includes(input) ||
                                    val.toLowerCase().includes(input),
                                );
                              });
                            }}
                            value={sortedTargets.find((t) => t.Target?.TargetID === value) ?? null}
                            onChange={(_event, newValue) =>
                              onChange(newValue?.Target?.TargetID ?? undefined)
                            }
                            isOptionEqualToValue={(option, val) =>
                              option.Target?.TargetID === val.Target?.TargetID
                            }
                            size='small'
                            fullWidth
                            renderOption={(props, option) => {
                              const labels = Object.entries(option.Target?.Labels ?? {});
                              return (
                                <li {...props} key={option.Target?.TargetID}>
                                  <Stack>
                                    <Typography variant='body2'>
                                      {option.Target?.Slug}
                                    </Typography>
                                    {labels.length > 0 && (
                                      <Stack direction='row' spacing={0.5} flexWrap='wrap'>
                                        {labels.map(([key, val]) => (
                                          <Chip
                                            key={key}
                                            label={`${key}: ${val}`}
                                            size='small'
                                            variant='outlined'
                                            sx={{ height: 18, fontSize: '0.7rem' }}
                                          />
                                        ))}
                                      </Stack>
                                    )}
                                  </Stack>
                                </li>
                              );
                            }}
                            renderInput={(params) => (
                              <TextField {...params} label='Target' inputRef={ref} />
                            )}
                          />
                        )}
                      />
                    </Grid>

                    <Grid size={{ xs: 6 }}>
                      <LabelTextField
                        label='Created At'
                        text={formatRelative(unit?.CreatedAt)}
                        textColor='text.primary'
                        labelColor='text.secondary'
                        labelVariant='caption'
                        textVariant='body1'
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
                        label='Updated At'
                        text={formatRelative(unit?.UpdatedAt)}
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
                        label='Last Change Description'
                        text={`${unit?.LastChangeDescription}`}
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
                        limit={1}
                      />
                    </Grid>

                    <Grid size={{ xs: 6 }}>
                      <LabelsAccordion
                        onLabelAddClicked={() => setIsAddDestroyGateModalOpen(true)}
                        onLabelDeleted={destroyGateHandlers.onDeleted}
                        type='DestroyGates'
                        labels={watch('DestroyGates') || {}}
                        variant='outlined'
                        limit={1}
                      />
                    </Grid>

                    <Grid size={{ xs: 6 }}>
                      <Controller
                        name='ToolchainType'
                        control={control}
                        defaultValue={unit?.ToolchainType || ''}
                        render={({ field }) => (
                          <FormControl fullWidth variant='outlined' size='small'>
                            <InputLabel id='toolchain-label'>Toolchain Type</InputLabel>
                            <Select
                              label='Toolchain Type'
                              labelId='toolchain-label'
                              id='toolchain-label-select'
                              size='small'
                              {...field}
                              onChange={(event) => {
                                field.onChange(event.target.value);
                                setValue('ToolchainType', event.target.value);
                              }}
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

                    <Grid size={{ xs: 12 }}>
                      <Button variant='contained' fullWidth type='submit'>
                        Save
                      </Button>
                    </Grid>
                  </Grid>
                </Form>
              ) : (
                <SkeletonForm />
              )}
            </Section>
            <Section sx={{ pt: 2 }} $display={selectedTab === 1} $direction={Direction.FadeIn}>
              <ActionSidebar
                unit={currentUnitExtended}
                onApplyGateClicked={onApplyGateClicked}
                functions={functions}
                onRefresh={setRefresh}
                isFetchingUnit={isFetchingUnit}
                lastPollTimestamp={lastPollTimestamp}
              />
            </Section>
            <Section sx={{ pt: 2 }} $display={selectedTab === 2} $direction={Direction.FadeIn}>
              <Stack spacing={1}>
                {urlAnnotations.length > 0 ? (
                  <Box component='ul' sx={{ pl: 2, m: 0 }}>
                    {urlAnnotations.map((link, index) => (
                      <Box component='li' key={index} sx={{ mb: 1 }}>
                        <Link
                          href={link.url}
                          target='_blank'
                          rel='noopener noreferrer'
                          underline='hover'
                        >
                          {link.name}
                        </Link>
                      </Box>
                    ))}
                  </Box>
                ) : (
                  <Typography variant='body2' color='text.secondary'>
                    No URLs available. Add annotations with the prefix "URL-" to display URLs
                    here.
                  </Typography>
                )}
              </Stack>
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
        <AddLabelModal
          isAddModalOpen={isAddDestroyGateModalOpen}
          onAddModalClosed={() => setIsAddDestroyGateModalOpen(false)}
          onLabelAdded={destroyGateHandlers.onAdded}
          type='DestroyGates'
        />
      </BorderedAccordion>
    </Container>
  );
};
