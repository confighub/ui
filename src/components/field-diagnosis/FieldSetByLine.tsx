// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { Fragment, type ReactNode } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';

import { FieldRefLink } from './FieldRefLink';
import type { FieldSetBy } from './fieldDiagnosis.types';

export const Sep = () => (
  <Box component="span" sx={{ color: 'text.disabled', mx: '6px' }}>
    ·
  </Box>
);

/** The set-by line: `admin · 2h ago · "reason" · CO-12`. */
export function FieldSetByLine({ setBy }: { setBy: FieldSetBy }) {
  const parts: ReactNode[] = [
    setBy.whoRef.kind === 'link' ? (
      <FieldRefLink key="who" refValue={setBy.whoRef} color="inherit" testId="fd-who-link" />
    ) : (
      <FieldRefLink key="who" refValue={setBy.whoRef} color="inherit" testId="fd-who-user" />
    ),
    setBy.whenRef ? (
      <FieldRefLink key="when" refValue={setBy.whenRef} color="inherit" testId="fd-when" />
    ) : (
      <Box key="when" component="span" data-testid="fd-when">
        {setBy.when}
      </Box>
    ),
  ];
  if (setBy.reason) parts.push(<span key="reason">&quot;{setBy.reason}&quot;</span>);
  if (setBy.changeOrder) parts.push(<FieldRefLink key="co" refValue={setBy.changeOrder} testId="fd-changeorder" />);

  return (
    <Typography variant="body2" color="text.secondary" data-testid="fd-who" sx={{ wordBreak: 'break-word' }}>
      {parts.map((part, i) => (
        <Fragment key={i}>
          {i > 0 && <Sep />}
          {part}
        </Fragment>
      ))}
    </Typography>
  );
}
