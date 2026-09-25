// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import type { Initiative } from '@/types/initiative';
import { PRIORITY_COLORS } from '@/types/initiative';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import EditIcon from '@mui/icons-material/Edit';
import RefreshIcon from '@mui/icons-material/Refresh';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import Typography from '@mui/material/Typography';
import { dayjs } from '@/utility/dayjs-setup';

interface InitiativeDetailHeaderProps {
  initiative: Initiative;
  isRunningCheck: boolean;
  canRunCheck: boolean;
  onBack: () => void;
  onEdit: () => void;
  onRunCheck: () => void;
  checkedAt?: string;
  unitCount?: number;
  toolchain?: string;
}

export const InitiativeDetailHeader = ({
  initiative,
  isRunningCheck,
  canRunCheck,
  onBack,
  onEdit,
  onRunCheck,
  checkedAt,
  unitCount,
  toolchain,
}: InitiativeDetailHeaderProps) => {
  const priorityStyle = PRIORITY_COLORS[initiative.priority];
  const deadlineLabel = initiative.deadline ? `Due ${dayjs(initiative.deadline).format('MMM D')}` : null;

  const metaParts: string[] = ['Compliance'];
  if (toolchain) metaParts.push(toolchain);
  if (checkedAt) metaParts.push(`Last run ${dayjs(checkedAt).fromNow()}`);
  if (unitCount !== undefined) metaParts.push(`${unitCount} units in scope`);
  const hasCheckMeta = checkedAt !== undefined || unitCount !== undefined;

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1.5,
        px: 3,
        py: 1.5,
        maxWidth: 1200,
        mx: 'auto',
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: '6px',
        backgroundColor: 'background.paper',
        flexShrink: 0,
      }}
    >
      <Button
        size='small'
        startIcon={<ArrowBackIcon />}
        onClick={onBack}
        sx={{ textTransform: 'none', color: 'primary.main', flexShrink: 0 }}
      >
        Back
      </Button>
      <Box sx={{ width: '1px', height: 20, bgcolor: 'divider', flexShrink: 0 }} />
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography variant='subtitle1' fontWeight={700} noWrap>
          {initiative.name}
        </Typography>
        {hasCheckMeta ? (
          <Typography variant='caption' color='text.secondary'>
            {metaParts.join(' · ')}
          </Typography>
        ) : initiative.description ? (
          <Typography
            variant='caption'
            color='text.secondary'
            noWrap
            sx={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis' }}
          >
            {initiative.description}
          </Typography>
        ) : null}
      </Box>
      <Chip
        label={initiative.priority}
        size='small'
        sx={{
          flexShrink: 0,
          fontWeight: 700,
          fontSize: '0.65rem',
          letterSpacing: 0.5,
          height: 20,
          bgcolor: priorityStyle.bg,
          color: priorityStyle.color,
        }}
      />
      {initiative.enforced && (
        <Chip
          label='ENFORCED'
          size='small'
          title='Failures block Apply with ValidationErrors'
          sx={{
            flexShrink: 0,
            fontWeight: 700,
            fontSize: '0.65rem',
            letterSpacing: 0.5,
            height: 20,
            bgcolor: '#fde7e7',
            color: '#b71c1c',
          }}
        />
      )}
      {deadlineLabel && (
        <Typography variant='caption' color='text.secondary' sx={{ flexShrink: 0, whiteSpace: 'nowrap' }}>
          {deadlineLabel}
        </Typography>
      )}
      <Button
        size='small'
        variant='outlined'
        startIcon={<EditIcon />}
        onClick={onEdit}
        sx={{ textTransform: 'none', flexShrink: 0 }}
      >
        Edit
      </Button>
      <Button
        size='small'
        variant='outlined'
        startIcon={isRunningCheck ? <CircularProgress size={14} color='inherit' /> : <RefreshIcon />}
        disabled={isRunningCheck || !canRunCheck}
        onClick={onRunCheck}
        sx={{ textTransform: 'none', flexShrink: 0 }}
      >
        {isRunningCheck ? 'Checking…' : 'Recheck'}
      </Button>
    </Box>
  );
};
