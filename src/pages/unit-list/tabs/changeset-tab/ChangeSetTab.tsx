// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { useEffect, useMemo, useState } from 'react';

import { DiffTreeView } from '@/components/diff-tree-view/DiffTreeView';
import { ErrorList } from '@/components/error-list/ErrorList';
import { Section } from '@/components/styled';
import { useChangesetRevisions } from '@/hooks/useChangesetRevisions';
import {
  type ChangeSetRead,
  useBulkPatchUnitsMutation,
  useGetChangeSetQuery,
  useGetMeQuery,
  useListAllRevisionsQuery,
  useListAllUnitsQuery,
  usePatchChangeSetMutation,
} from '@confighub/rtk-query';
import type { UnitRead } from '@confighub/rtk-query';
import {
  ChangesetStatus,
  getChangesetStatus,
  getChangesetStatusColor,
} from '@/types/changeset';
import { Direction } from '@/types/enums';
import { COMPONENT_DIMENSIONS } from '@/utility/constants';
import { calculateTotalChanges } from '@/utility/diff-methods';
import { getInitials } from '@/utility/name-format-functions';
import Add from '@mui/icons-material/Add';
import CallMerge from '@mui/icons-material/CallMerge';
import GitBranch from '@mui/icons-material/ChangeHistory';
import Close from '@mui/icons-material/Close';
import Done from '@mui/icons-material/Done';
import Autocomplete from '@mui/material/Autocomplete';
import Avatar from '@mui/material/Avatar';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import Container from '@mui/material/Container';
import Divider from '@mui/material/Divider';
import Grid from '@mui/material/Grid2';
import IconButton from '@mui/material/IconButton';
import Popover from '@mui/material/Popover';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { styled } from '@mui/material/styles';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { useUploadUnitData } from '@/hooks/useUnitData';

dayjs.extend(relativeTime);

const Layout = styled('div')`
  display: flex;
  flex-direction: column;
  min-width: 100%;
  height: 100%;
`;

const getUniqueUnitsIDs = (units: UnitRead[]): string[] => {
  const uniqueUnitsMap = new Map();

  units.forEach((unit) => {
    uniqueUnitsMap.set(unit.UnitID, unit); // Use unitID as the key to ensure uniqueness
  });

  return Array.from(uniqueUnitsMap.keys()); // Return the unique units as an array
};

export interface IChangeSetTabProps {
  changeSet: ChangeSetRead | null;
  isVisible: boolean;
  isEditMode?: boolean;
  onSaveChanges?: (slug: string, description: string) => void;
  errorMessages?: string[];
  /** Array of selected unit IDs from parent DataGrid */
  selectedUnitIds?: string[];
  /** Callback when unit selection changes */
  onSelectionChange?: (unitIds: string[]) => void;
  refreshChangesets?: boolean;
}

export const ChangeSetTab = ({
  changeSet,
  isVisible,
  isEditMode = false,
  onSaveChanges,
  errorMessages = [],
  selectedUnitIds = [],
  onSelectionChange,
  refreshChangesets,
}: IChangeSetTabProps) => {
  const ChangeSetID = changeSet?.ChangeSetID ?? '';
  const SpaceID = changeSet?.SpaceID ?? '';
  const StartTag = changeSet?.StartTagID ?? '';
  const [errorMessage, setErrorMessage] = useState<string[]>([]);
  const [newLabelKey, setNewLabelKey] = useState('');
  const [newLabelValue, setNewLabelValue] = useState('');
  const [labelPopoverAnchor, setLabelPopoverAnchor] = useState<HTMLButtonElement | null>(null);
  const [editedDescription, setEditedDescription] = useState('');
  const [editedSlug, setEditedSlug] = useState('');
  const [addUnitsPopoverAnchor, setAddUnitsPopoverAnchor] = useState<HTMLButtonElement | null>(
    null,
  );
  const [selectedUnitsToAdd, setSelectedUnitsToAdd] = useState<UnitRead[]>([]);
  const [isAddingUnits, setIsAddingUnits] = useState(false);

  const { data: meData } = useGetMeQuery();

  const [patchChangeSet] = usePatchChangeSetMutation();
  const [bulkPatchUnits] = useBulkPatchUnitsMutation();
  const [uploadUnitData] = useUploadUnitData();

  // Fetch changeset
  const { data: changesetData, isLoading: isLoadingChangeset } = useGetChangeSetQuery(
    {
      spaceId: SpaceID || '',
      changeSetId: ChangeSetID || '',
    },
    {
      skip: !ChangeSetID || !SpaceID,
    },
  );

  const changeset = changesetData?.ChangeSet;

  // Initialize edit fields when edit mode is turned on
  useEffect(() => {
    if (isEditMode && changeset) {
      setEditedSlug(changeset.Slug || '');
      setEditedDescription(changeset.Description || '');
    }
  }, [isEditMode, changeset]);

  // Update error messages
  useEffect(() => {
    setErrorMessage(errorMessages);
  }, [errorMessages]);

  // Notify parent of changes
  useEffect(() => {
    if (isEditMode && onSaveChanges) {
      onSaveChanges(editedSlug, editedDescription);
    }
  }, [editedSlug, editedDescription, isEditMode, onSaveChanges]);

  const {
    data: allUnits = [],
    isLoading: isLoadingUnits,
    refetch: refetchUnits,
  } = useListAllUnitsQuery(
    {
      where: `ChangeSetID = '${ChangeSetID}'`,
      include: 'SpaceID,HeadRevisionNum,LastReleasedRevisionNum,ChangeSetID',
    },
    {
      skip: !SpaceID,
    },
  );

  // To show the proper diff we need to diff the head for the revisions associated with the change set WHERE ChangeSetID = changeSet.ChangeSetID as Live
  // With the revision before the start tag as Head WHERE Tag ? 'null' or the current unit...
  const { changeSetUnits = [], refetchRevisions } = useChangesetRevisions({
    units: allUnits,
    changesetId: ChangeSetID,
    startTagId: StartTag,
  });

  // Fetch available units that can be added (units not in this changeset)
  const { data: availableUnits = [] } = useListAllUnitsQuery(
    {
      include: 'SpaceID,TargetID',
      select: 'UnitID,Slug,SpaceID,TargetID,ToolchainType,Space.DisplayName,Target.Slug',
    },
    {
      skip: !SpaceID || !addUnitsPopoverAnchor,
    },
  );

  // Fetch revisions for this changeset
  const { data: revisionsData = [] } = useListAllRevisionsQuery(
    {
      where: `ChangeSetID = '${ChangeSetID}'`,
      include: 'UserID,UnitID',
    },
    {
      skip: !ChangeSetID,
    },
  );

  // TODO: create unit list from units returned from revision data for is closed...
  const closedUnitsIds = getUniqueUnitsIDs(revisionsData.map((rev) => rev.Unit as UnitRead));

  const { data: closedUnits = [] } = useListAllUnitsQuery(
    {
      where: `UnitID IN (${closedUnitsIds.map((uid) => `'${uid}'`).join(',')})`,
      include: 'SpaceID,HeadRevisionNum,LastReleasedRevisionNum,ChangeSetID',
    },
    {
      skip: !SpaceID,
    },
  );

  const status: ChangesetStatus = useMemo(
    () => getChangesetStatus(changeset?.State),
    [changeset?.State],
  );

  useEffect(() => {
    if (changeSet?.ChangeSetID) {
      refetchUnits();
      refetchRevisions();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshChangesets]);

  const statusColor = getChangesetStatusColor(status);

  const isClosed = status === 'closed';

  // Get status icon
  const StatusIcon = () => {
    switch (status) {
      case 'open':
        return <GitBranch sx={{ color: 'success.main', fontSize: 20 }} />;
      case 'applied':
        return <Done sx={{ color: 'success.main', fontSize: 20 }} />;
      case 'closed':
        return <CallMerge sx={{ color: 'text.disabled', fontSize: 20 }} />;
      default:
        return <GitBranch sx={{ fontSize: 20 }} />;
    }
  };

  // Calculate stats
  const totalChanges = useMemo(() => calculateTotalChanges(allUnits), [allUnits]);

  // Calculate which units can be upgraded
  const upgradeableUnits = useMemo(() => {
    return allUnits.filter((extendedUnit) => {
      const unit = extendedUnit.Unit;
      const upstreamUnit = extendedUnit.UpstreamUnit;
      return (
        unit &&
        upstreamUnit &&
        (upstreamUnit.HeadRevisionNum ?? 0) > (unit.UpstreamRevisionNum ?? 0)
      );
    });
  }, [allUnits]);

  const handleAddLabel = async () => {
    if (!newLabelKey.trim() || !newLabelValue.trim() || !ChangeSetID || !SpaceID) {
      setLabelPopoverAnchor(null);
      setNewLabelKey('');
      setNewLabelValue('');
      return;
    }

    try {
      const currentLabels = changeset?.Labels || {};
      await patchChangeSet({
        spaceId: SpaceID,
        changeSetId: ChangeSetID,
        body: {
          Labels: {
            ...currentLabels,
            [newLabelKey.trim()]: newLabelValue.trim(),
          },
        },
      });

      setNewLabelKey('');
      setNewLabelValue('');
      setLabelPopoverAnchor(null);
    } catch (error) {
      console.error('Failed to add label:', error);
    }
  };

  const handleCloseLabelPopover = () => {
    handleAddLabel();
  };

  const handleDeleteLabel = async (labelKey: string) => {
    if (!SpaceID || !ChangeSetID) return;

    try {
      const currentLabels = { ...(changeset?.Labels || {}) };
      delete currentLabels[labelKey];

      await patchChangeSet({
        spaceId: SpaceID,
        changeSetId: ChangeSetID,
        body: {
          Labels: currentLabels,
        },
      });
    } catch (error) {
      console.error('Failed to delete label:', error);
    }
  };

  const handleAddUnitsToChangeset = async () => {
    if (selectedUnitsToAdd.length === 0 || !ChangeSetID || !SpaceID) {
      setAddUnitsPopoverAnchor(null);
      setSelectedUnitsToAdd([]);
      return;
    }

    try {
      setIsAddingUnits(true);
      const unitIds = selectedUnitsToAdd.map((u) => `'${u.UnitID}'`).join(',');

      await bulkPatchUnits({
        where: `UnitID IN (${unitIds})`,
        changeSetId: ChangeSetID,
        // @ts-expect-error TODO: fix API type
        body: JSON.stringify({
          ChangeSetID: ChangeSetID,
        }),
      });

      // Refresh the units list to show newly added units
      await refetchUnits();

      setSelectedUnitsToAdd([]);
      setAddUnitsPopoverAnchor(null);
    } catch (error) {
      console.error('Failed to add units to changeset:', error);
    } finally {
      setIsAddingUnits(false);
    }
  };

  const handleCloseAddUnitsPopover = () => {
    setAddUnitsPopoverAnchor(null);
    setSelectedUnitsToAdd([]);
  };

  const handleSaveUnit = async (unitId: string, newData: string) => {
    const unit = allUnits.find((u) => u.Unit?.UnitID === unitId);
    if (!unit?.Unit || !SpaceID) {
      throw new Error('Unit or Space not found');
    }

    // Configuration is written through the Unit's data endpoint, not the Unit body.
    await uploadUnitData({
      spaceId: SpaceID,
      unitId: unitId,
      changeSetId: ChangeSetID,
      body: newData,
    });

    // Refetch both units and revisions to get updated data
    await refetchUnits();
    refetchRevisions();
  };

  const handleRefreshData = async () => {
    await Promise.all([refetchUnits(), refetchRevisions()]);
  };

  if (isLoadingChangeset && changeSetUnits.length === 0) {
    return (
      <Section $display={isVisible} $direction={Direction.FadeIn}>
        <Container maxWidth='xl' sx={{ py: 8 }}>
          <Box sx={{ display: 'flex', justifyContent: 'center' }}>
            <CircularProgress />
          </Box>
        </Container>
      </Section>
    );
  }

  if (!changeset) {
    return (
      <Section $display={isVisible} $direction={Direction.FadeIn}>
        <Container maxWidth='xl' sx={{ py: 8 }}>
          <Typography variant='h6' color='text.secondary'>
            Changeset not found
          </Typography>
        </Container>
      </Section>
    );
  }

  const displayName = changeset.DisplayName || changeset.Slug;
  const description = changeset.Description || 'No description provided';

  return (
    <Section $display={isVisible} $direction={Direction.FadeIn}>
      <Layout>
        <Container
          maxWidth='xl'
          sx={{ p: 0, paddingLeft: '0px !important', paddingRight: '0px !important' }}
        >
          <Grid container>
            {/* Main Content */}
            <Grid size={10}>
              {/* Files Changed Tab */}
              <Section $display={true} $direction={Direction.FadeIn}>
                {isLoadingUnits ? (
                  <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
                    <CircularProgress />
                  </Box>
                ) : (
                  <DiffTreeView
                    title={
                      <Box sx={{ p: 2 }}>
                        <ErrorList errors={errorMessage} onClose={() => setErrorMessage([])} />
                        <Stack direction='row' spacing={2} alignItems='center' mb={1}>
                          <StatusIcon />
                          {!isEditMode ? (
                            <>
                              <Typography variant='h4' fontWeight='bold'>
                                {displayName}
                              </Typography>
                            </>
                          ) : (
                            <Stack direction='row' spacing={1} alignItems='center'>
                              <TextField
                                value={editedSlug}
                                onChange={(e) => setEditedSlug(e.target.value)}
                                size='small'
                                placeholder='Enter changeset name...'
                                sx={{
                                  flex: 1,
                                  minWidth: COMPONENT_DIMENSIONS.AUTOCOMPLETE_MIN_WIDTH,
                                  '& .MuiInputBase-root': {
                                    height: COMPONENT_DIMENSIONS.INPUT_HEIGHT,
                                  },
                                }}
                              />
                            </Stack>
                          )}
                          <Chip label={status} size='small' color={statusColor} />
                        </Stack>
                        <Stack direction='row' spacing={1}>
                          <Avatar
                            src={meData?.ProfilePictureURL}
                            sx={{ width: 24, height: 24 }}
                          >
                            {getInitials(meData?.DisplayName || '')}
                          </Avatar>
                          <Typography variant='body2' color='text.secondary'>
                            wants to apply config changes to {allUnits.length} Units
                          </Typography>
                          <Chip
                            label={`${totalChanges} ${totalChanges === 1 ? 'unit changed' : 'units changed'}`}
                            size='small'
                            color='primary'
                            variant='outlined'
                          />
                        </Stack>
                        {/* Description Section */}
                        <Box sx={{ mt: 1, mb: 1 }}>
                          {!isEditMode ? (
                            <Typography
                              variant='body1'
                              sx={{ whiteSpace: 'pre-wrap', flex: 1 }}
                            >
                              {description}
                            </Typography>
                          ) : (
                            <TextField
                              fullWidth
                              multiline
                              rows={4}
                              value={editedDescription}
                              onChange={(e) => setEditedDescription(e.target.value)}
                              placeholder='Enter changeset description...'
                              size='small'
                            />
                          )}
                        </Box>
                      </Box>
                    }
                    units={isClosed ? closedUnits : changeSetUnits}
                    editorOffset='360px'
                    containerHeight='calc(100vh - 140px)'
                    selectedUnitIds={selectedUnitIds}
                    onSelectionChange={onSelectionChange}
                    headerToolbar={
                      !isClosed && (
                        <IconButton
                          size='small'
                          onClick={(e) => setAddUnitsPopoverAnchor(e.currentTarget)}
                        >
                          <Add fontSize='small' />
                        </IconButton>
                      )
                    }
                    enableEditMode={!isClosed}
                    onSave={handleSaveUnit}
                    onRefresh={handleRefreshData}
                  />
                )}
              </Section>
            </Grid>

            {/* Sidebar */}
            <Grid size={2} sx={{ overflow: 'auto' }}>
              {/* Labels Section */}
              <Box sx={{ mt: 2, p: 2 }}>
                <Stack
                  direction='row'
                  alignItems='center'
                  justifyContent='space-between'
                  mb={2}
                >
                  <Typography fontWeight='bold' variant='subtitle2'>
                    Labels
                  </Typography>
                  <IconButton
                    size='small'
                    onClick={(e) => setLabelPopoverAnchor(e.currentTarget)}
                  >
                    <Add fontSize='small' />
                  </IconButton>
                </Stack>

                <Popover
                  open={Boolean(labelPopoverAnchor)}
                  anchorEl={labelPopoverAnchor}
                  onClose={handleCloseLabelPopover}
                  anchorOrigin={{
                    vertical: 'bottom',
                    horizontal: 'left',
                  }}
                  transformOrigin={{
                    vertical: 'top',
                    horizontal: 'left',
                  }}
                >
                  <Box
                    sx={{
                      backgroundColor: '#fafafa',
                      px: 0.5,
                      minWidth: 300,
                    }}
                  >
                    <Typography variant='overline' color='text.secondary'>
                      Add Label
                    </Typography>
                  </Box>
                  <Divider />
                  <Box>
                    <Box sx={{ p: 1, minWidth: 200 }}>
                      <Stack spacing={1}>
                        <TextField
                          size='small'
                          fullWidth
                          placeholder='Key'
                          value={newLabelKey}
                          onChange={(e) => setNewLabelKey(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              handleAddLabel();
                            } else if (e.key === 'Escape') {
                              setNewLabelKey('');
                              setNewLabelValue('');
                              setLabelPopoverAnchor(null);
                            }
                          }}
                          sx={{
                            '& .MuiFormLabel-root': {
                              lineHeight: COMPONENT_DIMENSIONS.INPUT_LINE_HEIGHT,
                            },
                            '& .MuiInputBase-root': {
                              height: COMPONENT_DIMENSIONS.INPUT_HEIGHT,
                            },
                          }}
                          autoFocus
                        />
                        <TextField
                          size='small'
                          fullWidth
                          placeholder='Value'
                          value={newLabelValue}
                          onChange={(e) => setNewLabelValue(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              handleAddLabel();
                            } else if (e.key === 'Escape') {
                              setNewLabelKey('');
                              setNewLabelValue('');
                              setLabelPopoverAnchor(null);
                            }
                          }}
                          sx={{
                            '& .MuiFormLabel-root': {
                              lineHeight: COMPONENT_DIMENSIONS.INPUT_LINE_HEIGHT,
                            },
                            '& .MuiInputBase-root': {
                              height: COMPONENT_DIMENSIONS.INPUT_HEIGHT,
                            },
                          }}
                        />
                      </Stack>
                    </Box>
                  </Box>
                </Popover>

                <Divider sx={{ mb: 2 }} />

                {!changeset?.Labels || Object.keys(changeset.Labels).length === 0 ? (
                  <Typography
                    variant='body2'
                    color='text.secondary'
                    sx={{ py: 2, fontSize: 12 }}
                  >
                    No labels yet
                  </Typography>
                ) : (
                  <Stack spacing={1}>
                    {Object.entries(changeset.Labels).map(([key, value]) => (
                      <Chip
                        key={key}
                        label={`${key}: ${value}`}
                        size='small'
                        onDelete={() => handleDeleteLabel(key)}
                        deleteIcon={<Close fontSize='small' />}
                        sx={{
                          justifyContent: 'space-between',
                          '& .MuiChip-label': {
                            flex: 1,
                          },
                        }}
                      />
                    ))}
                  </Stack>
                )}
              </Box>

              {/* Upgrades Section */}
              {upgradeableUnits.length > 0 && (
                <Box sx={{ mt: 2, p: 2 }}>
                  <Stack
                    direction='row'
                    alignItems='center'
                    justifyContent='space-between'
                    mb={2}
                  >
                    <Typography fontWeight='bold' variant='subtitle2'>
                      Upgrades Available
                    </Typography>
                    <Chip
                      label={upgradeableUnits.length}
                      size='small'
                      color='warning'
                      sx={{ fontWeight: 600 }}
                    />
                  </Stack>

                  <Divider sx={{ mb: 2 }} />

                  <Stack mb={2}>
                    {upgradeableUnits.map((extendedUnit) => {
                      const unit = extendedUnit.Unit;
                      const upstreamUnit = extendedUnit.UpstreamUnit;
                      return (
                        <Stack
                          key={unit?.UnitID}
                          sx={{
                            p: 0.5,
                            backgroundColor: 'grey.50',
                            borderRadius: 1,
                            '&:hover': {
                              backgroundColor: 'grey.100',
                            },
                          }}
                        >
                          <Typography variant='body2' fontWeight={600}>
                            {unit?.Slug}
                          </Typography>
                          <Typography variant='caption' color='text.secondary'>
                            {unit?.UpstreamRevisionNum ?? 0} →{' '}
                            {upstreamUnit?.HeadRevisionNum ?? 0}
                          </Typography>
                        </Stack>
                      );
                    })}
                  </Stack>

                  <Button
                    variant='contained'
                    color='warning'
                    fullWidth
                    size='small'
                    disabled={allUnits.length === 0}
                  >
                    Upgrade Units
                  </Button>
                </Box>
              )}
            </Grid>
          </Grid>
        </Container>

        {/* Add Units Popover - Available globally */}
        <Popover
          open={Boolean(addUnitsPopoverAnchor)}
          anchorEl={addUnitsPopoverAnchor}
          onClose={handleCloseAddUnitsPopover}
          anchorOrigin={{
            vertical: 'bottom',
            horizontal: 'left',
          }}
          transformOrigin={{
            vertical: 'top',
            horizontal: 'left',
          }}
        >
          <Box
            sx={{
              backgroundColor: '#fafafa',
              px: 0.5,
              minWidth: 300,
            }}
          >
            <Typography variant='overline' color='text.secondary'>
              Add Units to Changeset
            </Typography>
          </Box>
          <Divider />
          <Box sx={{ p: 2, minWidth: 400 }}>
            <Stack spacing={2}>
              <Autocomplete
                multiple
                options={availableUnits.map((u) => u.Unit).filter(Boolean) as UnitRead[]}
                getOptionLabel={(option) => option?.Slug || ''}
                value={selectedUnitsToAdd}
                onChange={(_, newValue) => setSelectedUnitsToAdd(newValue)}
                renderOption={(props, option) => {
                  const { key, ...optionProps } = props;
                  const extendedUnit = availableUnits.find(
                    (u) => u.Unit?.UnitID === option?.UnitID,
                  );
                  const spaceName = extendedUnit?.Space?.DisplayName || 'Unknown Space';
                  const toolchainType = option?.ToolchainType || 'Unknown';
                  const targetSlug = extendedUnit?.Target?.Slug;

                  return (
                    <li key={key} {...optionProps}>
                      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                        <Typography variant='body2' fontWeight={600}>
                          {option?.Slug}
                        </Typography>
                        <Typography variant='caption' color='text.secondary'>
                          {spaceName} • {toolchainType}
                          {targetSlug ? ` • ${targetSlug}` : ''}
                        </Typography>
                      </Box>
                    </li>
                  );
                }}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    size='small'
                    placeholder='Search units...'
                    autoFocus
                  />
                )}
                size='small'
              />
              <Stack direction='row' spacing={1} justifyContent='flex-end'>
                <Button
                  size='small'
                  variant='outlined'
                  onClick={handleCloseAddUnitsPopover}
                  disabled={isAddingUnits}
                >
                  Cancel
                </Button>
                <Button
                  size='small'
                  variant='contained'
                  onClick={handleAddUnitsToChangeset}
                  disabled={selectedUnitsToAdd.length === 0 || isAddingUnits}
                >
                  {isAddingUnits
                    ? 'Adding...'
                    : `Add ${selectedUnitsToAdd.length} Unit${selectedUnitsToAdd.length !== 1 ? 's' : ''}`}
                </Button>
              </Stack>
            </Stack>
          </Box>
        </Popover>
      </Layout>
    </Section>
  );
};
