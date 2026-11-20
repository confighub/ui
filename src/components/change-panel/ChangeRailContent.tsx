// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * What the change button under Functions shows (D1): "Start a [C]hange" with no open change,
 * else the change's name, vertical and mono, cut after 21 characters with the full name in
 * its title.
 */
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { tokens } from '@/components/theme-provider/ThemeProvider';
import { useOpenChangeName } from './ActiveChangeProvider';
import { ChangeIcon } from './ChangeIcon';

/** The name on the button is cut after this many characters. */
const BUTTON_NAME_MAX = 21;

const verticalSx = {
  writingMode: 'vertical-rl',
  textOrientation: 'mixed',
  transform: 'rotate(180deg)',
  userSelect: 'none',
  whiteSpace: 'nowrap',
} as const;

export function ChangeRailContent() {
  const name = useOpenChangeName();
  if (name === undefined) {
    return (
      <>
        <ChangeIcon sx={{ fontSize: 16, color: tokens.rust }} />
        <Typography variant="body2" sx={{ ...verticalSx, fontWeight: 500, color: tokens.rust }}>
          Start a [C]hangeSet
        </Typography>
      </>
    );
  }
  const shown = name.length > BUTTON_NAME_MAX + 1 ? `${name.slice(0, BUTTON_NAME_MAX)}…` : name;
  return (
    <>
      <ChangeIcon sx={{ fontSize: 16 }} />
      <Box component="span" data-testid="change-button-name" title={name} sx={{ ...verticalSx, fontFamily: tokens.fontMono, fontSize: 12, color: tokens.t1 }}>
        {shown}
      </Box>
    </>
  );
}
