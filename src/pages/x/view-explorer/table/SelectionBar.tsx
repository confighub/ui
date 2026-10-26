// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import { useState } from 'react';

import CloseIcon from '@mui/icons-material/Close';
import CompareArrowsIcon from '@mui/icons-material/CompareArrows';
import FunctionsIcon from '@mui/icons-material/Functions';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Stack from '@mui/material/Stack';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';

import { LiveRegion } from '@/components/live-region/LiveRegion';
import { useAppDispatch } from '@/hooks/useApp';
import { requestInvokerOpen } from '@/state/slices/invokerRequest';

import { useCompare } from '../compare/compare-context';
import { Kbd } from '../lenses/parts';
import { MAX_COMPARE_SLOTS } from '../model/compare';
import { compareSet } from '../model/selection';
import { COMPACT, ICON, LABEL, NARROW, iconOnlyBelow } from '../results/compact';
import { useResults } from '../state/results-context';
import { useRowSelection } from '../state/selection-context';

/** The key cap takes the button's colours, which change while its picker is open. */
const KBD_ON_BUTTON_SX = { color: 'inherit', bgcolor: 'transparent', borderColor: 'currentColor', opacity: 0.8 } as const;

const FIRST_FIVE_HINT = 'Slots go up to E. A–E get the first 5 rows in table order.';

const ICON_SX = { fontSize: 18 } as const;

/**
 * What is picked in the Table, at the left of the results toolbar, in place of
 * the layout and entity pickers while a row is picked: Clear (✕), how many
 * rows of how many shown, Compare (two rows or more; past five, the first five
 * in table order) or, for one row, "Compare with…", which opens the Unit
 * picker with that row in slot A, and Functions, which opens the app's
 * Functions panel (it lists the picked Units, `InvokerSelectionSync`).
 *
 * In a narrow toolbar (`results/compact.ts`) the buttons show icons only and
 * the count drops "selected"; nothing is hidden. Each button keeps its name in
 * an `aria-label` and says it in a tooltip.
 *
 * The count is announced from a live region that is always mounted: one that
 * appeared with its first words would not read them, and one that went away
 * with the last row could not say so.
 */
export function SelectionBar() {
  const { enabled, count, clear, picked, orderedPicked } = useRowSelection();
  const { start, openPicker, pickerSource } = useCompare();
  const shown = useResults().derived.rows.length;
  const dispatch = useAppDispatch();
  // Nothing is said about a selection before the first row is picked.
  const [everPicked, setEverPicked] = useState(false);
  if (count > 0 && !everPicked) setEverPicked(true);
  const message = !enabled ? '' : count > 0 ? `${count} selected` : everPicked ? 'No rows selected' : '';
  const firstFive = count > MAX_COMPARE_SLOTS;
  // One shape whether the bar shows or not, so the region is never remounted (a new one says nothing).
  return (
    <>
      <LiveRegion message={message} data-testid='vx-selection-status' />
      {enabled && count > 0 && (
        <Stack
          direction='row'
          alignItems='center'
          spacing={0.5}
          role='toolbar'
          aria-label='Selection'
          data-testid='vx-selection-bar'
          sx={{ pl: 0.25, pr: 0.5, py: 0.25, borderRadius: 2, bgcolor: 'primary.light', flexShrink: 0 }}
        >
          <Tooltip title='Clear selection · Esc' disableInteractive>
            <IconButton
              onClick={clear}
              aria-label='Clear selection'
              aria-keyshortcuts='Escape'
              data-testid='vx-selection-clear'
              sx={{ width: 28, height: 28, color: 'primary.dark' }}
            >
              <CloseIcon sx={{ fontSize: 16 }} />
            </IconButton>
          </Tooltip>
          <Typography
            component='span'
            variant='body2'
            fontWeight={600}
            color='primary.dark'
            aria-label={`${count} of ${shown} Units selected`}
            data-testid='vx-selection-count'
            sx={{ whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums', pr: 0.5, [NARROW]: { [`& .${LABEL}`]: { display: 'none' } } }}
          >
            {count} of {shown}
            <span className={LABEL}> selected</span>
          </Typography>
          {count === 1 && (
            <Tooltip title='Compare with… · c' disableInteractive>
              <Button
                size='small'
                variant='contained'
                onClick={(e) => openPicker({ kind: 'start', base: orderedPicked[0], source: 'selection', anchor: e.currentTarget })}
                aria-label='Compare with…'
                aria-haspopup='dialog'
                aria-expanded={pickerSource === 'selection'}
                aria-keyshortcuts='c'
                data-testid='vx-selection-compare'
                sx={[
                  {
                    gap: 0.75,
                    whiteSpace: 'nowrap',
                    // Pressed while its picker is open.
                    '&[aria-expanded="true"], &[aria-expanded="true"]:hover': { bgcolor: 'primary.light', color: 'primary.dark', boxShadow: 'none' },
                  },
                  iconOnlyBelow(COMPACT, 32),
                ]}
              >
                <CompareArrowsIcon className={ICON} sx={ICON_SX} />
                <span className={LABEL}>Compare with…</span>
                <Kbd aria-hidden sx={KBD_ON_BUTTON_SX}>c</Kbd>
              </Button>
            </Tooltip>
          )}
          {count >= 2 && (
            <Tooltip title={firstFive ? FIRST_FIVE_HINT : 'Compare · c'} disableInteractive>
              <Button
                size='small'
                variant='contained'
                onClick={() => start(compareSet(picked, orderedPicked).ids)}
                aria-label={firstFive ? `Compare first ${MAX_COMPARE_SLOTS} of ${count} selected Units` : `Compare ${count} selected Units`}
                aria-keyshortcuts='c'
                data-testid='vx-selection-compare'
                sx={[{ gap: 0.75, whiteSpace: 'nowrap' }, iconOnlyBelow(COMPACT, 32)]}
              >
                <CompareArrowsIcon className={ICON} sx={ICON_SX} />
                <span className={LABEL}>{firstFive ? `Compare first ${MAX_COMPARE_SLOTS}` : 'Compare'}</span>
                <Kbd aria-hidden sx={KBD_ON_BUTTON_SX}>c</Kbd>
              </Button>
            </Tooltip>
          )}
          <Tooltip title='Functions · f' disableInteractive>
            <Button
              size='small'
              variant='outlined'
              onClick={() => dispatch(requestInvokerOpen())}
              aria-label={`Run Functions on ${count} selected ${count === 1 ? 'Unit' : 'Units'}`}
              aria-keyshortcuts='f'
              data-testid='vx-selection-functions'
              sx={[{ gap: 0.75, whiteSpace: 'nowrap', bgcolor: 'background.paper' }, iconOnlyBelow(COMPACT, 32)]}
            >
              <FunctionsIcon className={ICON} sx={ICON_SX} />
              <span className={LABEL}>Functions</span>
              <Kbd aria-hidden>f</Kbd>
            </Button>
          </Tooltip>
        </Stack>
      )}
    </>
  );
}
