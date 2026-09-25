// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import Box from '@mui/material/Box';
import LinearProgress from '@mui/material/LinearProgress';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';

interface InitiativeSummaryBarProps {
  total: number;
  passing: number;
  failing: number;
  notApplicable: number;
}

export const InitiativeSummaryBar = ({ total, passing, failing, notApplicable }: InitiativeSummaryBarProps) => {
  const checkable = total - notApplicable;
  const pct = checkable > 0 ? Math.round((passing / checkable) * 100) : 0;

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 2,
        p: 2,
        bgcolor: 'background.paper',
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: '6px',
      }}
    >
      <Stat value={total} label='Total units' />
      <StatDivider />
      <Stat value={passing} label='Passing' color='#2e7d32' />
      <StatDivider />
      <Stat value={failing} label='Failing' color='#c62828' />
      <StatDivider />
      <Tooltip title='Units without config data to validate — excluded from completion percentage' arrow placement='bottom'>
        <Box>
          <Stat value={notApplicable} label='N/A' color='#757575' />
        </Box>
      </Tooltip>
      <StatDivider />
      <Stat value={`${pct}%`} label='Complete' color='#ba3d03' />
      <Box sx={{ flex: 1, pl: 2 }}>
        <LinearProgress
          variant='determinate'
          value={pct}
          sx={{
            height: 8,
            borderRadius: 4,
            bgcolor: 'grey.200',
            '& .MuiLinearProgress-bar': {
              bgcolor: pct === 100 ? '#4caf50' : 'primary.main',
              borderRadius: 4,
            },
          }}
        />
      </Box>
    </Box>
  );
};

function Stat({ value, label, color }: { value: number | string; label: string; color?: string }) {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
      <Typography variant='h5' fontWeight={700} sx={{ color: color ?? 'text.primary', lineHeight: 1.2 }}>
        {value}
      </Typography>
      <Typography variant='caption' color='text.secondary' fontWeight={500}>
        {label}
      </Typography>
    </Box>
  );
}

function StatDivider() {
  return <Box sx={{ width: '1px', height: 36, bgcolor: 'divider', flexShrink: 0 }} />;
}
