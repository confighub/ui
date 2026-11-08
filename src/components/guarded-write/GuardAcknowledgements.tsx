// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { guardText } from '@/utility/clearance-functions';
import type { WithheldGuard } from '@confighub/rtk-query';
import Checkbox from '@mui/material/Checkbox';
import FormControlLabel from '@mui/material/FormControlLabel';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';

const monoSx = { fontFamily: 'monospace', fontSize: '0.8125rem' } as const;

/**
 * A checkbox for each guard a write overwrites what it guards, for the person to confirm they
 * understand why it is there. Renders nothing for no guards.
 */
export const GuardAcknowledgements = ({
  guards,
  acknowledged,
  onToggle,
  intro,
  confirm = 'Confirm you understand why each guard is there to overwrite what it guards.',
}: {
  guards: readonly WithheldGuard[];
  acknowledged: ReadonlySet<string>;
  onToggle: (text: string, checked: boolean) => void;
  /** What is guarded, as a sentence: "This field is guarded." */
  intro: string;
  /** What acknowledging a guard confirms, for a write that changes something other than values. */
  confirm?: string;
}) => {
  if (guards.length === 0) return null;
  return (
    <Stack data-testid='guard-acknowledgements'>
      <Typography variant='body2'>
        {intro} {confirm}
      </Typography>
      {guards.map((guard) => {
        const text = guardText(guard);
        return (
          <FormControlLabel
            key={text}
            control={
              <Checkbox
                checked={acknowledged.has(text)}
                onChange={(e) => onToggle(text, e.target.checked)}
              />
            }
            label={<Typography sx={monoSx}>{text}</Typography>}
          />
        );
      })}
    </Stack>
  );
};
