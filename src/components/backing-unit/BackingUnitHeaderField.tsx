// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';

import { BackingUnitLink } from './BackingUnitLink';
import { EnableBackingUnitField } from './EnableBackingUnitField';
import type { BackingUnitChoice } from './backingUnitChoice';

export interface BackingUnitHeaderFieldProps {
  /** The entity's BackingUnitID, or nothing for a new entity or one with none. */
  backingUnitId: string | null | undefined;
  choice: BackingUnitChoice;
  onChoiceChange: (choice: BackingUnitChoice) => void;
  /** A Space or a Component chooses the Space for its backing Unit. */
  needsSpace?: boolean;
  disabled?: boolean;
}

/**
 * The backing Unit in a form's header, beside the entity's name: the entity's backing Unit when
 * it has one, and otherwise the choice to give it one when the form is saved.
 */
export const BackingUnitHeaderField = ({
  backingUnitId,
  choice,
  onChoiceChange,
  needsSpace = false,
  disabled = false,
}: BackingUnitHeaderFieldProps) => (
  <Box data-testid='backing-unit-header' sx={{ minWidth: 0 }}>
    {backingUnitId ? (
      <>
        <Typography variant='caption' color='text.secondary' component='div'>
          Backing Unit
        </Typography>
        <Typography variant='body1' component='div'>
          <BackingUnitLink backingUnitId={backingUnitId} />
        </Typography>
      </>
    ) : (
      <EnableBackingUnitField
        value={choice}
        onChange={onChoiceChange}
        needsSpace={needsSpace}
        disabled={disabled}
      />
    )}
  </Box>
);
