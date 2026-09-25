// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { Ellipses, HoverCard } from '@/components/styled';
import { useActivity } from '@/hooks/useActivity';
import { type UnitRead } from '@confighub/rtk-query';
import Timeline from '@mui/lab/Timeline';
import TimelineConnector from '@mui/lab/TimelineConnector';
import TimelineContent from '@mui/lab/TimelineContent';
import TimelineDot from '@mui/lab/TimelineDot';
import TimelineItem, { timelineItemClasses } from '@mui/lab/TimelineItem';
import TimelineSeparator from '@mui/lab/TimelineSeparator';
import Avatar from '@mui/material/Avatar';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import Divider from '@mui/material/Divider';
import Grid from '@mui/material/Grid2';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import dayjs from 'dayjs';

import { formatRelative } from '@/utility/date-format';

// ============================================================================
// TYPES
// ============================================================================

export interface ActivityCardProps {
  /** The unit to display activity for */
  unit: UnitRead;
  /** Optional height for the card */
  height?: string | number;
}

// ============================================================================
// COMPONENT
// ============================================================================

/**
 * ActivityCard displays a timeline of unit events and revisions.
 * Shows activity grouped by week with user avatars and action chips.
 */
export const ActivityCard = ({ unit, height = '450px' }: ActivityCardProps) => {
  const {
    mergedEvents,
    groupedEvents,
    isEventsLoading,
    isEventsUninitialized,
    isRevisionsLoading,
  } = useActivity({ unit });

  const isLoading = isEventsUninitialized || isEventsLoading || isRevisionsLoading;
  const hasEvents = mergedEvents && mergedEvents.length > 0;

  return (
    <HoverCard
      variant='outlined'
      sx={{
        mt: 2,
        mx: 2,
        height,
        display: 'flex',
        flexDirection: 'column',
        padding: 0,
      }}
    >
      <Stack
        direction='row'
        justifyContent='space-between'
        alignItems='center'
        p={1}
        sx={{ flexShrink: 0 }}
      >
        <Typography variant='h6'>Activity</Typography>
      </Stack>
      <Divider />
      <Box p={1.5} sx={{ flex: 1, overflowY: 'auto' }}>
        {isLoading && (
          <Typography color='text.secondary' variant='body2'>
            Loading activity...
          </Typography>
        )}

        {!isLoading && !hasEvents && (
          <Typography color='text.secondary' variant='body2'>
            No activity yet
          </Typography>
        )}

        {!isLoading && hasEvents && (
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
                  <Chip label={`Week of ${dayjs(week).format('MMMM D, YYYY')}`} size='small' />
                </Divider>
                {events.map((event) => (
                  <TimelineItem key={event.id}>
                    <TimelineSeparator>
                      <TimelineDot />
                      <TimelineConnector />
                    </TimelineSeparator>
                    <TimelineContent>
                      <Grid container spacing={1} alignItems='center' mb={1}>
                        <Grid size={{ xs: 8 }}>
                          <Typography
                            sx={{ marginLeft: '2px' }}
                            variant='body1'
                            fontWeight={600}
                          >
                            {event.action}
                          </Typography>
                        </Grid>
                        <Grid size={{ xs: 4 }} justifyContent='flex-end' display='flex'>
                          <Stack direction='row' alignItems='center' spacing={1}>
                            <Ellipses variant='body1'>{event.userName}</Ellipses>
                            {event.profileURL && (
                              <Avatar src={event.profileURL} sx={{ width: 20, height: 20 }} />
                            )}
                          </Stack>
                        </Grid>
                      </Grid>
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
        )}
      </Box>
    </HoverCard>
  );
};
