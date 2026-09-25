// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import Box from '@mui/material/Box';
import Grid from '@mui/material/Grid2';
import Skeleton from '@mui/material/Skeleton';

export const SkeletonForm = () => {
  return (
    <Grid container spacing={2} sx={{ pt: 3 }}>
      <Grid size={{ xs: 6 }}>
        <Skeleton variant='rectangular' width='100%' height={40} />
      </Grid>

      <Grid size={{ xs: 6 }}>
        <Skeleton variant='rectangular' width='100%' height={40} />
      </Grid>

      <Grid size={{ xs: 6 }}>
        <Skeleton variant='rectangular' width='100%' height={40} />
      </Grid>

      <Grid size={{ xs: 6 }}>
        <Skeleton variant='rectangular' width='100%' height={40} />
      </Grid>

      <Grid size={{ xs: 6 }}>
        <Skeleton variant='rectangular' width='100%' height={40} />
      </Grid>

      <Grid size={{ xs: 6 }}>
        <Skeleton variant='rectangular' width='100%' height={40} />
      </Grid>

      <Grid size={{ xs: 6 }}>
        <Skeleton variant='rectangular' width='100%' height={40} />
      </Grid>

      <Grid size={{ xs: 6 }}>
        <Skeleton variant='rectangular' width='100%' height={40} />
      </Grid>

      <Grid size={{ xs: 6 }}>
        <Skeleton variant='rectangular' width='100%' height={40} />
      </Grid>

      <Grid size={{ xs: 12 }}>
        <Box>
          <Skeleton variant='rectangular' width='100%' height={80} />
        </Box>
      </Grid>
    </Grid>
  );
};
