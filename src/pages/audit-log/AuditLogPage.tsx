// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/** `/audit-log`: the AuditEvents of the Organization, newest first. */
import { CONSOLE_PAGE_SX } from '@/components/console-detail/consoleDetailUtil';
import Box from '@mui/material/Box';

import { AuditLogList } from './AuditLogList';

export default function AuditLogPage() {
  return (
    <Box data-testid='audit-log-root' sx={CONSOLE_PAGE_SX}>
      <AuditLogList />
    </Box>
  );
}
