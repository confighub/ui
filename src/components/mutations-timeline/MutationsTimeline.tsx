// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { useEffect, useMemo, useState } from 'react';

import { BorderedAccordion } from '@/components/styled';
import { useRevisionMutationSourcesMap } from '@/hooks/useUnitData';
import { RevisionRead, UnitRead, UserRead } from '@confighub/rtk-query';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import AccordionDetails from '@mui/material/AccordionDetails';
import AccordionSummary from '@mui/material/AccordionSummary';
import Avatar from '@mui/material/Avatar';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import Divider from '@mui/material/Divider';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemText from '@mui/material/ListItemText';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';

/** Width of the sidebar in pixels */
const SIDEBAR_WIDTH = 280;

/** Background color for the content area */
const CONTENT_BACKGROUND_COLOR = 'rgb(249, 250, 251)';

export interface MutationItem {
  unit: UnitRead;
  headRevision: RevisionRead;
  lastReleasedRevision: RevisionRead;
  user?: UserRead;
}

export interface MutationsTimelineProps {
  mutations: MutationItem[];
}

interface ProcessedMutation {
  path: string;
  value: string;
  resourceType: string;
  index: number;
}

interface UnitMutations {
  unitSlug: string;
  unitId: string;
  revisionNum: number;
  mutationsByResource: Record<string, ProcessedMutation[]>;
  user?: UserRead;
}

export const MutationsTimeline = ({ mutations }: MutationsTimelineProps) => {
  const [selectedUnitId, setSelectedUnitId] = useState<string | null>(
    mutations.length > 0 ? mutations[0].unit?.UnitID || null : null,
  );
  // Mutation sources are not on the Revision -- they are the largest column of the two the
  // configuration and they live behind their own endpoint. Every Revision this timeline
  // shows is read in one request rather than one per Unit.
  const { sourcesFor } = useRevisionMutationSourcesMap(
    mutations.map((item) => item.headRevision?.RevisionID),
  );

  const [expandedResources, setExpandedResources] = useState<Set<string>>(new Set());

  // Expand all resource types by default, once their sources have arrived.
  useEffect(() => {
    const allResourceTypes = new Set<string>();
    mutations.forEach((item) => {
      sourcesFor(item.headRevision?.RevisionID).forEach((source) => {
        allResourceTypes.add(source.Resource?.ResourceType || 'Unknown');
      });
    });
    if (allResourceTypes.size > 0) setExpandedResources(allResourceTypes);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mutations, sourcesFor]);

  // Process mutations by unit and group by resource type
  // Process mutations by unit and group by resource type
  const processedUnits = useMemo((): UnitMutations[] => {
    const units: UnitMutations[] = [];

    mutations.forEach((item) => {
      const itemSources = sourcesFor(item.headRevision?.RevisionID);
      if (itemSources.length > 0) {
        const mutationsByResource: Record<string, ProcessedMutation[]> = {};

        itemSources.forEach((source) => {
          const resourceType = source.Resource?.ResourceType || 'Unknown';
          const resourceName = source.Resource?.ResourceName || 'Unknown';

          // Check if there are path mutations
          if (source.PathMutationMap && Object.keys(source.PathMutationMap).length > 0) {
            Object.entries(source.PathMutationMap).forEach(([path, mutationInfo]) => {
              if (!mutationsByResource[resourceType]) {
                mutationsByResource[resourceType] = [];
              }

              mutationsByResource[resourceType].push({
                path,
                value: mutationInfo.Value || 'Unknown',
                resourceType,
                index: mutationInfo.Index || 0,
              });
            });
          } else if (source.ResourceMutationInfo) {
            // If no path mutations but there's a resource mutation, show it
            if (!mutationsByResource[resourceType]) {
              mutationsByResource[resourceType] = [];
            }

            mutationsByResource[resourceType].push({
              path: resourceName,
              value: source.ResourceMutationInfo.MutationType || 'Unknown',
              resourceType,
              index: source.ResourceMutationInfo.Index || 0,
            });
          }
        });

        if (Object.keys(mutationsByResource).length > 0) {
          units.push({
            unitSlug: item.unit?.Slug || 'Unknown Unit',
            unitId: item.unit?.UnitID || '',
            revisionNum: item.headRevision?.RevisionNum || 0,
            mutationsByResource,
            user: item.user,
          });
        }
      }
    });

    return units;
  }, [mutations]);

  const handleAccordionChange =
    (resourceType: string) => (_: React.SyntheticEvent, isExpanded: boolean) => {
      setExpandedResources((prev) => {
        const newSet = new Set(prev);
        if (isExpanded) {
          newSet.add(resourceType);
        } else {
          newSet.delete(resourceType);
        }
        return newSet;
      });
    };

  const selectedUnit = processedUnits.find((unit) => unit.unitId === selectedUnitId);

  if (processedUnits.length === 0) {
    return (
      <Box sx={{ p: 4, textAlign: 'center' }}>
        <Typography variant='body2' color='text.secondary'>
          No mutations found in these revisions
        </Typography>
      </Box>
    );
  }

  return (
    <Box
      sx={{
        display: 'flex',
        height: '100vh',
      }}
    >
      {/* Left Sidebar - Unit List */}
      <Box
        sx={{
          width: SIDEBAR_WIDTH,
          borderRight: '1px solid',
          borderColor: 'divider',
          backgroundColor: 'background.default',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <List sx={{ flex: 1, overflow: 'auto', py: 0 }}>
          {processedUnits.map((unit) => {
            const mutationCount = Object.values(unit.mutationsByResource).reduce(
              (sum, muts) => sum + muts.length,
              0,
            );
            const isActive = selectedUnitId === unit.unitId;

            return (
              <ListItem
                key={unit.unitId}
                sx={{
                  backgroundColor: isActive ? 'action.selected' : 'transparent',
                  borderLeft: '3px solid',
                  borderLeftColor: isActive ? 'primary.main' : 'transparent',
                }}
              >
                <ListItemButton
                  onClick={() => setSelectedUnitId(unit.unitId)}
                  dense
                  data-testid={`unit-item-${unit.unitSlug}`}
                >
                  <ListItemText
                    primary={
                      <Stack direction='row' spacing={1} alignItems='center'>
                        <Typography variant='body2' fontWeight={isActive ? 600 : 400}>
                          {unit.unitSlug}
                        </Typography>
                        <Chip label={mutationCount} size='small' sx={{ height: 18 }} />
                      </Stack>
                    }
                  />
                </ListItemButton>
              </ListItem>
            );
          })}
        </List>
      </Box>

      {/* Right: Mutation details */}
      <Box
        sx={{
          flex: 1,
          p: 2,
          overflowY: 'auto',
          backgroundColor: CONTENT_BACKGROUND_COLOR,
        }}
      >
        {selectedUnit ? (
          <>
            {/* Header */}
            <Box sx={{ mb: 2 }}>
              <Stack direction='row' spacing={1} alignItems='center'>
                <Typography variant='h6' fontWeight='bold' gutterBottom>
                  {selectedUnit.unitSlug}
                </Typography>

                <Chip label='Head' size='small' color='primary' variant='outlined' />
              </Stack>
            </Box>
            {/* Mutations grouped by resource */}
            <Stack spacing={1}>
              {Object.entries(selectedUnit.mutationsByResource).map(
                ([resourceType, mutations]) => {
                  const isExpanded = expandedResources.has(resourceType);
                  return (
                    <BorderedAccordion
                      key={resourceType}
                      expanded={isExpanded}
                      onChange={handleAccordionChange(resourceType)}
                    >
                      <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                        <Stack direction='row' alignItems='center' spacing={2} width='100%'>
                          <Typography variant='subtitle1' fontWeight='medium' flex={1}>
                            {resourceType}
                          </Typography>
                          <Chip
                            label={`${mutations.length} mutations`}
                            size='small'
                            variant='outlined'
                          />
                        </Stack>
                      </AccordionSummary>
                      <AccordionDetails sx={{ p: 1 }}>
                        <List disablePadding dense>
                          {mutations.map((mutation, idx) => {
                            const user = selectedUnit.user;

                            return (
                              <>
                                <ListItem sx={{ px: 1 }}>
                                  <Stack
                                    direction='row'
                                    spacing={2}
                                    alignItems='center'
                                    width='100%'
                                  >
                                    {/* User Avatar */}
                                    <Avatar
                                      src={user?.ProfilePictureURL}
                                      alt={user?.DisplayName || user?.Username}
                                      sx={{ width: 28, height: 28 }}
                                    >
                                      {user?.DisplayName?.[0] || user?.Username?.[0] || '?'}
                                    </Avatar>

                                    <ListItemText>
                                      <Stack
                                        direction='row'
                                        spacing={2}
                                        alignItems='center'
                                        justifyContent={'space-between'}
                                        key={idx}
                                      >
                                        {/* Resource Type */}
                                        <Box sx={{ minWidth: 140 }}>
                                          <Typography
                                            variant='body2'
                                            sx={{ fontWeight: 600, fontSize: '0.8rem' }}
                                          >
                                            {resourceType}
                                          </Typography>
                                          <Typography variant='body2'>
                                            {resourceType.split('/').pop()}
                                          </Typography>
                                        </Box>

                                        {/* Path */}
                                        <Box sx={{ minWidth: 120, flex: 1, pl: 5 }}>
                                          <Typography
                                            variant='body2'
                                            sx={{ fontWeight: 600, fontSize: '0.8rem' }}
                                          >
                                            Path
                                          </Typography>
                                          <Typography variant='body2'>
                                            {mutation.path}
                                          </Typography>
                                        </Box>

                                        {/* Value */}
                                        <Box sx={{ minWidth: 250, maxWidth: 300 }}>
                                          <Typography
                                            variant='body2'
                                            sx={{
                                              fontSize: '0.75rem',
                                              bgcolor: 'white',
                                              p: 0.5,
                                              borderRadius: 0.5,
                                              border: '1px solid #e0e0e0',
                                              overflow: 'hidden',
                                              textOverflow: 'ellipsis',
                                              whiteSpace: 'nowrap',
                                            }}
                                          >
                                            {mutation.value}
                                          </Typography>
                                        </Box>

                                        {/* Index */}
                                        <Chip
                                          label={`#${mutation.index}`}
                                          size='small'
                                          sx={{
                                            height: 18,
                                            fontSize: '0.65rem',
                                            minWidth: 45,
                                          }}
                                        />
                                      </Stack>
                                    </ListItemText>
                                  </Stack>
                                </ListItem>
                                {idx != mutations.length - 1 && <Divider />}
                              </>
                            );
                          })}
                        </List>
                      </AccordionDetails>
                    </BorderedAccordion>
                  );
                },
              )}
            </Stack>
          </>
        ) : (
          <Box sx={{ p: 4, textAlign: 'center' }}>
            <Typography variant='body2' color='text.secondary'>
              Select a unit to view mutations
            </Typography>
          </Box>
        )}
      </Box>
    </Box>
  );
};
