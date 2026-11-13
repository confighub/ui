// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { Link as RouterLink } from 'react-router-dom';

import { BorderedAccordion } from '@/components/styled';
import { ExtendedSpaceRead } from '@confighub/rtk-query';
import { SPACE_SUMMARY_COUNTS, spaceCountLink, type SpaceSummaryCount } from '@/utility/space-summary-counts';
import TimelineIcon from '@mui/icons-material/Timeline';
import AccordionDetails from '@mui/material/AccordionDetails';
import AccordionSummary from '@mui/material/AccordionSummary';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import CardActionArea from '@mui/material/CardActionArea';
import CardContent from '@mui/material/CardContent';
import Divider from '@mui/material/Divider';
import Grid from '@mui/material/Grid2';
import Skeleton from '@mui/material/Skeleton';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';

export interface SpaceDashboardProps {
  /** The Space with its summary counts */
  extendedSpace: ExtendedSpaceRead;
  isLoading?: boolean;
  /** Switch to the Triggers tab, showing the Triggers that reside in the Space */
  onShowTriggers: () => void;
}

const StatCard = ({
  title,
  value,
  loading,
  to,
  onClick,
}: {
  title: string;
  value: number | string;
  loading?: boolean;
  /** The page the card links to */
  to?: string;
  /** Use instead of `to` when the card changes the view on this page */
  onClick?: () => void;
}) => {
  const interactive = Boolean(to || onClick);
  const content = (
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
  );
  return (
    <Card
      elevation={0}
      sx={{
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: 2,
        transition: 'all 0.2s ease-in-out',
        height: '100%',
        '&:hover': interactive
          ? {
              borderColor: 'primary.main',
              boxShadow: '0px 4px 12px rgba(0,0,0,0.08)',
              transform: 'translateY(-1px)',
            }
          : {},
      }}
    >
      {to ? (
        <CardActionArea component={RouterLink} to={to} sx={{ height: '100%' }}>
          {content}
        </CardActionArea>
      ) : onClick ? (
        <CardActionArea onClick={onClick} sx={{ height: '100%' }}>
          {content}
        </CardActionArea>
      ) : (
        content
      )}
    </Card>
  );
};

export const SpaceDashboard = ({
  extendedSpace,
  isLoading = false,
  onShowTriggers,
}: SpaceDashboardProps) => {
  const space = extendedSpace.Space;

  // A count links to the page listing what it counts. Triggers stays a button,
  // because its tab is on this page.
  const isTriggers = (c: SpaceSummaryCount) => c.field === 'TriggerCountByEventType';
  const statTo = (c: SpaceSummaryCount): string | undefined => {
    const link = isTriggers(c) ? undefined : spaceCountLink(c);
    return link && space?.SpaceID && space.Slug ? link({ SpaceID: space.SpaceID, Slug: space.Slug }) : undefined;
  };
  const statClickHandler = (c: SpaceSummaryCount): (() => void) | undefined => (isTriggers(c) ? onShowTriggers : undefined);

  return (
    <BorderedAccordion expanded>
      <AccordionSummary>
        <Typography sx={{ pl: 1 }} variant='h6'>
          Dashboard
        </Typography>
      </AccordionSummary>
      <Divider />
      <AccordionDetails sx={{ p: 2 }}>
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
                  <Grid key={c.field} size={{ xs: 6, sm: 4, md: 3, lg: 2 }}>
                    <StatCard
                      title={c.label}
                      value={c.getValue(extendedSpace)}
                      loading={isLoading}
                      to={statTo(c)}
                      onClick={statClickHandler(c)}
                    />
                  </Grid>
                ))}
              </Grid>
            </Box>
          ))}
        </Stack>
      </AccordionDetails>
    </BorderedAccordion>
  );
};
