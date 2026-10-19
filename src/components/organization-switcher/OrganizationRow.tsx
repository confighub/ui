// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { useUserInfo } from '@/components/authenticated-context/AuthenticatedContext';
import { OrganizationSwitcher } from '@/components/organization-switcher/OrganizationSwitcher';
import Box from '@mui/material/Box';
import type { SxProps, Theme } from '@mui/material/styles';

interface OrganizationRowProps {
  /** Extra styles for the row, for a page whose layout needs other spacing. */
  sx?: SxProps<Theme>;
}

/**
 * The organization picker on its own row, for a page that does not use the
 * shared `Header`.
 *
 * Every page shows the current organization and offers to switch it. `Header`
 * does this with its first crumb. A page with its own header puts this row at
 * its top, so the picker is not lost.
 */
export const OrganizationRow = ({ sx }: OrganizationRowProps) => {
  const { userInfo } = useUserInfo();
  return (
    <Box
      data-testid="organization-row"
      sx={[{ display: 'flex', alignItems: 'center', marginBottom: '12px' }, ...(Array.isArray(sx) ? sx : [sx])]}
    >
      <OrganizationSwitcher currentOrganizationId={userInfo.ExternalOrganizationID || ''} />
    </Box>
  );
};
