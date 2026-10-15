// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { ReactNode } from 'react';

import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';

import { detailsMono } from './detailsFormat';

/** A titled group of a details drawer. */
export function DetailsSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Box sx={{ mb: 3 }}>
      <Typography variant='subtitle1' sx={{ fontWeight: 600, mb: 1 }}>
        {title}
      </Typography>
      {children}
    </Box>
  );
}

/** Name and value pairs. Fields with nothing in them are left out, so an entity shows only what it has. */
export function DetailsFields({ fields }: { fields: Array<[string, ReactNode]> }) {
  const present = fields.filter(([, value]) => value !== undefined && value !== null && value !== '' && value !== false);
  return (
    <Box
      component='dl'
      sx={{ display: 'grid', gridTemplateColumns: 'max-content 1fr', columnGap: 3, rowGap: 0.75, m: 0 }}
    >
      {present.map(([name, value]) => (
        <Box key={name} sx={{ display: 'contents' }}>
          <Box component='dt' sx={{ color: 'text.secondary', fontSize: '0.875rem' }}>
            {name}
          </Box>
          <Box component='dd' sx={{ m: 0, ...detailsMono }}>
            {value === true ? 'true' : value}
          </Box>
        </Box>
      ))}
    </Box>
  );
}
