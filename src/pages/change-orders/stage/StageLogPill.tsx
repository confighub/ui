// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * The stage's one status pill, beside its name: the theme Chip, pale in every
 * tone. A red or amber pill is a link to its line in the log, which is the loud
 * signal; the pill only says the state at a glance.
 */

import type { Ref } from 'react';

import Chip from '@mui/material/Chip';

import type { StageLogPillView } from './stageLogModel';

const COLOR = { neutral: 'default', success: 'success', warning: 'warning', error: 'error' } as const;

/**
 * `headingRef`: where focus goes after an action (`useOutcomeFocus`), so a
 * keyboard user lands on the new state; it carries the status heading's id.
 */
export function StageLogPill({ pill, headingRef }: { pill: StageLogPillView; headingRef?: Ref<HTMLDivElement> }) {
  const target = pill.target;
  const linked = target !== undefined && (pill.tone === 'error' || pill.tone === 'warning');
  return (
    <Chip
      data-testid="pulse"
      id="stage-status-heading"
      ref={headingRef}
      tabIndex={-1}
      data-tone={pill.tone}
      label={pill.label}
      color={COLOR[pill.tone]}
      {...(linked
        ? {
            component: 'a',
            href: `#${target}`,
            clickable: true,
            onClick: (event: React.MouseEvent) => {
              event.preventDefault();
              document.getElementById(target)?.scrollIntoView({ block: 'center' });
            },
          }
        : {})}
      sx={{ ml: 'auto', flexShrink: 0, maxWidth: 'none', '& .MuiChip-label': { whiteSpace: 'nowrap', px: '10px' }, '&:focus-visible': { outline: '2px solid var(--rust)', outlineOffset: '2px' } }}
    />
  );
}
