// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { useNavigate } from 'react-router-dom';

import { BorderedAccordion } from '@/components/styled';
import { ExtendedSpaceRead } from '@confighub/rtk-query';
import { FILTER_URL_PARAMS } from '@/utility/constants/url-params';
import { SPACE_SUMMARY_COUNTS, type SpaceSummaryCount } from '@/utility/space-summary-counts';
import TimelineIcon from '@mui/icons-material/Timeline';
import AccordionDetails from '@mui/material/AccordionDetails';
import AccordionSummary from '@mui/material/AccordionSummary';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
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
  /** Switch to the Triggers tab, showing the Triggers applied to the Space */
  onShowAppliedTriggers: () => void;
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
  extendedSpace,
  isLoading = false,
  onShowAppliedTriggers,
}: SpaceDashboardProps) => {
  const navigate = useNavigate();
  const space = extendedSpace.Space;

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
