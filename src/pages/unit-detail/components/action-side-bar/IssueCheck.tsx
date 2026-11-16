// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import Box from '@mui/material/Box';

/**
 * The check an issue names, set before its message so a finding of a rule that runs several
 * checks says which one failed. It takes the size and colour of the text around it.
 */
export const IssueCheck = ({ check }: { check?: string }) =>
  check ? (
    <Box
      component='span'
      data-testid='issue-check'
      sx={{
        fontFamily: 'monospace',
        fontWeight: 600,
        mr: 0.75,
        overflowWrap: 'anywhere',
        // An identifier keeps its case where the text around it is set in capitals.
        textTransform: 'none',
      }}
    >
      {check}
    </Box>
  ) : null;
