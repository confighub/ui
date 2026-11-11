// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import Checkbox from '@mui/material/Checkbox';
import FormControlLabel from '@mui/material/FormControlLabel';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import type { SxProps, Theme } from '@mui/material/styles';

import type { ChangeSetLock } from './useChangeSetLock';

const monoSx = { fontFamily: 'monospace', fontSize: '0.8125rem' } as const;

/**
 * A checkbox for each ChangeSet holding the Units a screen writes to, for the person to confirm
 * that the changes they make will be part of it, as they confirm they understand a guard before
 * writing over it. Renders nothing when none of the Units is in a ChangeSet.
 */
export const ChangeSetAcknowledgements = ({
  lock,
  disabled = false,
  testId = 'change-set-acknowledgements',
  sx,
}: {
  lock: ChangeSetLock;
  disabled?: boolean;
  testId?: string;
  sx?: SxProps<Theme>;
}) => {
  if (lock.changeSets.length === 0) return null;
  const one = lock.changeSets.length === 1;
  const intro =
    lock.lockedUnits === 1
      ? 'This Unit is in a ChangeSet, which locks it.'
      : `${lock.lockedUnits} of these Units are in ${one ? 'a ChangeSet, which locks them' : 'ChangeSets, which lock them'}.`;
  const confirm = one
    ? 'Confirm the changes you make here will be part of it.'
    : 'Confirm the changes you make here will be part of each.';
  return (
    <Stack data-testid={testId} sx={sx}>
      <Typography variant='body2'>
        {intro} {confirm}
      </Typography>
      {lock.changeSets.map((changeSet) => (
        <FormControlLabel
          key={changeSet.id}
          disabled={disabled}
          control={
            <Checkbox
              checked={lock.acknowledged.has(changeSet.id)}
              onChange={(e) => lock.onToggle(changeSet.id, e.target.checked)}
            />
          }
          label={<Typography sx={monoSx}>{changeSet.label}</Typography>}
        />
      ))}
    </Stack>
  );
};
