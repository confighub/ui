// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { tokens } from '@/components/theme-provider/ThemeProvider';
import { styled } from '@mui/material/styles';

import { componentTheme } from '../componentTheme';
import { CHIP_TONE } from '../flow-graph/DeploymentFlowNode';

const Badge = styled('span', { shouldForwardProp: (p) => p !== '$zero' })<{ $zero: boolean }>(
  ({ $zero }) => ({
    minWidth: 18,
    height: 18,
    boxSizing: 'border-box',
    // Manrope's line box sits 1px high in a flex box; the top padding centres the digit.
    padding: '2px 5px 0',
    marginLeft: 6,
    borderRadius: tokens.rPill,
    background: $zero ? componentTheme.bgInset : CHIP_TONE.gated.tint,
    // The Gated chip's ink and tint, so the count reads as the same thing as the chip.
    color: $zero ? componentTheme.fgSubtle : CHIP_TONE.gated.color,
    fontSize: 10.5,
    lineHeight: 'normal',
    fontWeight: 700,
    fontFamily: componentTheme.fontMono,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
  }),
);

/**
 * The count on the Gates tab: blocking findings in the Variant. Not shown when the count is not
 * known (loading, a read error, Triggers still running): unknown is not 0.
 */
export const GateCountBadge = ({ count }: { count: number | undefined }) =>
  count === undefined ? null : (
    <Badge $zero={count === 0} data-testid='component-pane-tab-gates-count'>
      {count}
    </Badge>
  );
