// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import { ReactNode } from 'react';

import { unitResourceHref } from '@/pages/unit-detail/unitDetailHrefs';
import Box from '@mui/material/Box';
import Link from '@mui/material/Link';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';

// Slugs and toolchains are case-sensitive; the caption variant would capitalize them.
const VALUE_SX = { fontFamily: 'monospace', textTransform: 'none' } as const;

export interface ResourceContextProps {
  resourceId: string;
  unitId: string;
  unitSlug: string;
  spaceId: string;
  spaceSlug: string;
  targetSlug?: string;
  toolchainType?: string;
}

/**
 * Where a resource lives, which its YAML does not say: its Unit, linked to the Unit's Resources
 * tab opened on the resource, its Space, and the Target and toolchain when known. Shown under
 * the header of a drawer about one resource.
 */
export function ResourceContext({
  resourceId,
  unitId,
  unitSlug,
  spaceId,
  spaceSlug,
  targetSlug,
  toolchainType,
}: ResourceContextProps) {
  return (
    <Box sx={{ p: 2, borderBottom: 1, borderColor: 'divider' }} data-testid='resource-context'>
      <Stack direction='row' spacing={2} flexWrap='wrap'>
        <ContextItem label='Unit'>
          <Link
            href={unitResourceHref(spaceId, unitId, resourceId)}
            target='_blank'
            rel='noopener noreferrer'
            underline='hover'
            sx={{ fontFamily: 'monospace', fontSize: '0.8rem' }}
          >
            {unitSlug}
          </Link>
        </ContextItem>
        <ContextItem label='Space'>
          <Typography variant='caption' sx={VALUE_SX}>
            {spaceSlug}
          </Typography>
        </ContextItem>
        {targetSlug && (
          <ContextItem label='Target'>
            <Typography variant='caption' sx={VALUE_SX}>
              {targetSlug}
            </Typography>
          </ContextItem>
        )}
        {toolchainType && (
          <ContextItem label='Toolchain'>
            <Typography variant='caption' sx={VALUE_SX}>
              {toolchainType}
            </Typography>
          </ContextItem>
        )}
      </Stack>
    </Box>
  );
}

function ContextItem({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Box>
      <Typography
        variant='caption'
        color='text.secondary'
        sx={{ display: 'block', textTransform: 'uppercase', letterSpacing: '0.05em' }}
      >
        {label}
      </Typography>
      {children}
    </Box>
  );
}
