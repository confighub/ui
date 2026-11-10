// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { NavLink } from '@/components/nav-link/NavLink';
import { plural } from '@/pages/change-orders/changeOrderHistory';
import { PRIORITY_COLORS, formatEnforcementDate } from '@/utility/triggerEnforcement';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Chip from '@mui/material/Chip';
import LinearProgress from '@mui/material/LinearProgress';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import dayjs from 'dayjs';

import { type ValidationPolicy, failingOf, isOverdue } from '../validationModel';

interface PolicyCardProps {
  policy: ValidationPolicy;
  isSelected?: boolean;
}

/** The scope of a policy in a few words: "62 Spaces, 2 Targets", or "Not selected". */
const scopeText = (policy: ValidationPolicy): string => {
  const parts = [];
  if (policy.spaces.length > 0) parts.push(plural(policy.spaces.length, 'Space'));
  if (policy.targets.length > 0) parts.push(plural(policy.targets.length, 'Target'));
  return parts.length > 0 ? parts.join(', ') : 'Not selected';
};

/**
 * A validating Trigger on the Validation board: its name, priority, due date and how the Units it
 * applies to fared. The whole card links to the Trigger's detail below the board.
 */
export const PolicyCard = ({ policy, isSelected = false }: PolicyCardProps) => {
  const { unitCounts: c } = policy;
  const evaluated = c.passed + c.warning + c.error;
  const progressPct = evaluated > 0 ? Math.round((c.passed / evaluated) * 100) : 0;
  const failing = failingOf(c);
  const overdue = isOverdue(policy);
  const priorityStyle = PRIORITY_COLORS[policy.priority];

  let dateLabel: string | undefined;
  if (policy.stage === 'Enforced' && policy.enforcedAt) {
    dateLabel = `Enforced ${dayjs(policy.enforcedAt).format('MMM D')}`;
  } else if (policy.stage !== 'Enforced' && policy.stage !== 'Disabled' && policy.enforcedBy) {
    dateLabel = `${overdue ? 'Overdue' : 'Enforce by'} ${formatEnforcementDate(policy.enforcedBy)}`;
  }

  return (
    <Card
      elevation={isSelected ? 2 : 0}
      data-testid={`validation-card-${policy.trigger.Slug}`}
      sx={{
        borderRadius: '8px',
        border: isSelected ? '2px solid' : '1px solid',
        borderColor: isSelected ? 'primary.main' : 'divider',
        position: 'relative',
        flexShrink: 0,
        transition: 'all 0.2s ease-in-out',
        '&:hover': {
          borderColor: 'primary.main',
          boxShadow: '0px 4px 12px rgba(0, 0, 0, 0.08)',
          transform: 'translateY(-1px)',
        },
        '& .policy-card-link::after': { content: '""', position: 'absolute', inset: 0 },
        '&:has(.policy-card-link:focus-visible)': {
          outline: '2px solid',
          outlineColor: 'primary.main',
          outlineOffset: 2,
        },
      }}
    >
      <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 } }}>
        <Typography
          variant='subtitle2'
          fontWeight={600}
          sx={{ lineHeight: 1.3, overflowWrap: 'anywhere' }}
        >
          <NavLink
            to={`/validation/${policy.id}`}
            className='policy-card-link'
            style={{ outline: 'none' }}
          >
            {policy.name}
          </NavLink>
        </Typography>
        <Typography
          variant='body2'
          fontSize='0.75rem'
          color='text.disabled'
          sx={{ display: 'block', mb: 0.5, fontFamily: 'monospace' }}
        >
          {policy.spaceSlug}/{policy.trigger.Slug}
        </Typography>

        {policy.trigger.Description && (
          <Typography
            variant='body2'
            fontSize='0.75rem'
            color='text.secondary'
            sx={{
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
              lineHeight: 1.4,
              mb: 1,
            }}
          >
            {policy.trigger.Description}
          </Typography>
        )}

        <Box
          sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 0.75, mb: 1 }}
        >
          {policy.priority !== 'Unspecified' && (
            <Chip
              label={policy.priority.toUpperCase()}
              size='small'
              sx={{
                fontWeight: 700,
                fontSize: '0.65rem',
                letterSpacing: 0.5,
                height: 20,
                bgcolor: priorityStyle.bg,
                color: priorityStyle.color,
              }}
            />
          )}
          {dateLabel && (
            <Typography
              variant='body2'
              fontSize='0.75rem'
              sx={{
                color: overdue ? 'error.main' : 'text.secondary',
                fontWeight: overdue ? 600 : 400,
              }}
            >
              {dateLabel}
            </Typography>
          )}
          <Typography
            variant='body2'
            fontSize='0.75rem'
            color='text.secondary'
            sx={{ ml: 'auto' }}
          >
            {scopeText(policy)}
          </Typography>
        </Box>

        {c.total > 0 && (
          <>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Tooltip title={`${c.passed} of ${plural(evaluated, 'evaluated Unit')} pass`}>
                <LinearProgress
                  variant='determinate'
                  value={progressPct}
                  sx={{
                    flex: 1,
                    height: 4,
                    borderRadius: 2,
                    bgcolor:
                      evaluated > 0 ? (c.error > 0 ? '#ffcdd2' : '#ffe0b2') : 'grey.200',
                    '& .MuiLinearProgress-bar': { bgcolor: '#4caf50' },
                  }}
                />
              </Tooltip>
              <Typography
                variant='body2'
                fontSize='0.75rem'
                color='text.secondary'
                fontWeight={500}
                sx={{ whiteSpace: 'nowrap' }}
              >
                {c.passed} / {evaluated}
              </Typography>
            </Box>
            <Box sx={{ display: 'flex', gap: 1, mt: 0.5 }}>
              {c.error > 0 && (
                <Typography
                  variant='body2'
                  fontSize='0.75rem'
                  sx={{ color: 'error.main', fontWeight: 600 }}
                >
                  {plural(c.error, 'error')}
                </Typography>
              )}
              {c.warning > 0 && (
                <Typography
                  variant='body2'
                  fontSize='0.75rem'
                  sx={{ color: 'warning.dark', fontWeight: 600 }}
                >
                  {plural(c.warning, 'warning')}
                </Typography>
              )}
              {failing === 0 && evaluated > 0 && (
                <Typography variant='body2' fontSize='0.75rem' sx={{ color: 'success.dark' }}>
                  All passing
                </Typography>
              )}
              {c.notEvaluated > 0 && (
                <Typography variant='body2' fontSize='0.75rem' color='text.disabled'>
                  {c.notEvaluated} not evaluated
                </Typography>
              )}
            </Box>
          </>
        )}
      </CardContent>
    </Card>
  );
};
