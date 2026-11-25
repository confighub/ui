// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * What the ChangeSets button under Functions shows: "[C]hangeSets" always, in the style of
 * "[F]unctions". The active ChangeSet's name is in the panel head, not on the button.
 */
import Typography from '@mui/material/Typography';
import { tokens } from '@/components/theme-provider/ThemeProvider';
import { useOpenChangeName } from './ActiveChangeProvider';
import { ChangeIcon } from './ChangeIcon';

export function ChangeRailContent() {
  // With no ChangeSet active the icon is in the brand colour, as the button's border is.
  const none = useOpenChangeName() === undefined;
  return (
    <>
      <ChangeIcon sx={{ fontSize: 16, ...(none ? { color: tokens.rust } : {}) }} />
      <Typography
        variant="body2"
        sx={{
          writingMode: 'vertical-rl',
          textOrientation: 'mixed',
          transform: 'rotate(180deg)',
          fontWeight: 500,
          color: 'text.secondary',
          userSelect: 'none',
          whiteSpace: 'nowrap',
        }}
      >
        [C]hangeSets
      </Typography>
    </>
  );
}
