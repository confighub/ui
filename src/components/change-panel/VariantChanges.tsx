// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * "On this Variant" (D35): the open changes that hold Units of the page's Space, said first. Yours:
 * "Select" (or "Switch to it" while another of yours is active). Another person's: its Units
 * here are read-only until it finishes. The name is a link to the change's page (D29).
 */
import { tokens } from '@/components/theme-provider/ThemeProvider';
import {
  changeOrderInk,
  changeOrderSurface,
  changeOrderType,
} from '@/pages/change-orders/changeOrdersTokens';
import { changeSetPath } from '@/pages/change-sets/changeSetAddress';
import Box from '@mui/material/Box';

import { PanelLink, PanelNotice } from './ChangeTrackParts';
import { setActiveChange } from './activeChange';
import { monoSx } from './panelStyles';
import type { VariantChange } from './useVariantChanges';

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

export function VariantChanges({
  changes,
  isVariant,
  activeChangeSetId,
}: {
  changes: VariantChange[];
  isVariant: boolean;
  activeChangeSetId?: string;
}) {
  if (changes.length === 0) return null;
  const here = isVariant ? 'Variant' : 'Space';
  return (
    <Box data-testid='variant-changes'>
      <Box
        sx={{
          padding: '9px 16px',
          background: changeOrderSurface.sunk,
          borderBottom: `1px solid ${tokens.bd0}`,
          fontSize: changeOrderType.size.body,
          fontWeight: 600,
          color: changeOrderInk.default,
        }}
      >
        {`On this ${here}`}
      </Box>
      <Box
        sx={{
          padding: '12px 16px 4px',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
        }}
      >
        {changes.map((change) =>
          change.closed ? (
            <PanelNotice
              key={change.id}
              severity='warning'
              icon={false}
              data-testid='variant-closed-note'
              sx={{ color: tokens.t1, '& a': { textDecoration: 'underline' } }}
            >
              <Box>
                {'A finished ChangeSet still holds Units here: '}
                <PanelLink
                  testId='variant-closed-link'
                  wrap
                  small
                  href={changeSetPath(change.space, change.slug)}
                >
                  <Box component='span' sx={monoSx}>
                    {change.slug}
                  </Box>
                </PanelLink>
                {` · ${plural(change.units, 'Unit')} here`}
              </Box>
              <Box sx={{ color: tokens.t2, marginTop: '4px' }}>
                Writes to them are refused until each one is freed.
              </Box>
            </PanelNotice>
          ) : (
            <Box key={change.id} data-testid='variant-change-item'>
              <PanelNotice
                severity={change.yours ? 'info' : 'warning'}
                icon={false}
                data-testid='variant-change-note'
                sx={{ color: tokens.t1, '& a': { textDecoration: 'underline' } }}
              >
                <Box>
                  {`This ${here} has an open ChangeSet: `}
                  <PanelLink
                    testId='variant-change-link'
                    wrap
                    small
                    href={changeSetPath(change.space, change.slug)}
                  >
                    <Box component='span' sx={monoSx}>
                      {change.slug}
                    </Box>
                  </PanelLink>
                  {` · ${plural(change.units, 'Unit')} here · by ${change.yours ? 'you' : change.owner}`}
                  {/* With several changes, say which one this page's Unit is in. */}
                  {changes.length > 1 && change.hasPageUnit ? (
                    <Box
                      component='span'
                      data-testid='variant-change-this-unit'
                      sx={{ fontWeight: 600 }}
                    >
                      {' · this Unit is in it'}
                    </Box>
                  ) : null}
                </Box>
                <Box sx={{ color: tokens.t2, marginTop: '4px' }}>
                  {change.yours
                    ? activeChangeSetId
                      ? 'It is yours.'
                      : 'It is yours. Select it to keep saving into it.'
                    : 'Its Units here are read-only until it finishes.'}
                </Box>
              </PanelNotice>
              {change.yours ? (
                <Box sx={{ marginTop: '10px' }}>
                  <PanelLink
                    testId='variant-change-pick'
                    onClick={() => setActiveChange({ space: change.space, slug: change.slug })}
                  >
                    {activeChangeSetId ? 'Switch to it' : 'Select'}
                  </PanelLink>
                </Box>
              ) : null}
            </Box>
          ),
        )}
      </Box>
    </Box>
  );
}
