// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * The state of a selected Unit, as the page-Unit row shows it (D27): "not in your change",
 * "in your change" or "held", in the GateTag shape (radius 3) and the tone of each state.
 */
import { changeOrderType } from '@/pages/change-orders/changeOrdersTokens';
import { GateTag } from '@/pages/x/apps/change-order/ChangeOrderGateList';
import Box from '@mui/material/Box';
import { tokens } from '@/components/theme-provider/ThemeProvider';
import { monoSx } from './panelStyles';

const TONE = {
  free: { color: tokens.t2, background: tokens.bgHover, fontWeight: changeOrderType.weight.medium },
  mine: { color: tokens.blue, background: tokens.blueBg, border: `1px solid ${tokens.blueBd}` },
  own: { color: tokens.t2, background: tokens.bgHover, fontWeight: changeOrderType.weight.medium },
  held: { color: tokens.amber, background: tokens.amberBg, border: `1px solid ${tokens.amberBd}` },
} as const;

const LABEL = { free: 'not in your ChangeSet', mine: 'in your ChangeSet', own: 'in your ChangeSet', held: 'held' } as const;

/** `change`: the other change of yours that has the Unit (D28), named in mono after the label. */
/** `owner`: who holds a held Unit ("held by <owner>"). */
/** `finished`: held by a finished change (D37). */
export function StateTag({
  state,
  title,
  change,
  owner,
  finished = false,
  testId = 'page-unit-state',
}: {
  state: keyof typeof TONE;
  title?: string;
  change?: string;
  owner?: string;
  finished?: boolean;
  testId?: string;
}) {
  return (
    <GateTag
      $tone="idle"
      data-testid={testId}
      title={title ?? (change ? `${LABEL[state]} ${change}` : undefined)}
      sx={{ maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', fontSize: 11.5, fontWeight: 600, letterSpacing: 0, padding: '1px 7px', ...TONE[state] }}
    >
      {state === 'held' && finished ? 'held by the finished ChangeSet' : state === 'held' && owner ? `held by ${owner}` : LABEL[state]}
      {change ? (
        <Box component="span" sx={{ ...monoSx, fontSize: 11.5, marginLeft: '4px', color: tokens.t1 }}>
          {change}
        </Box>
      ) : null}
    </GateTag>
  );
}
