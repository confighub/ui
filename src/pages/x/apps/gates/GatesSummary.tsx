// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import CheckRoundedIcon from '@mui/icons-material/CheckRounded';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import { Box } from '@mui/material';
import { styled } from '@mui/material/styles';

import { componentTheme } from '../componentTheme';
import { CHIP_TONE } from '../flow-graph/DeploymentFlowNode';
import { SUMMARY_BORDER } from './gateStyles';

const Root = styled(Box, { shouldForwardProp: (p) => p !== '$ok' })<{ $ok: boolean }>(
  ({ $ok }) => ({
    display: 'flex',
    gap: 12,
    alignItems: 'flex-start',
    padding: '12px 14px',
    borderRadius: componentTheme.radiusMd,
    background: $ok ? componentTheme.successMuted : componentTheme.attentionMuted,
    border: `1px solid ${$ok ? componentTheme.successEdge : SUMMARY_BORDER}`,
    marginBottom: 14,
  }),
);

const Title = styled(Box)({
  fontSize: 13.5,
  fontWeight: 700,
  overflowWrap: 'anywhere',
  color: componentTheme.fgDefault,
});
const Text = styled(Box)({
  color: componentTheme.fgMuted,
  marginTop: 3,
  lineHeight: 1.5,
  overflowWrap: 'anywhere',
});
const Progress = styled(Box)({ display: 'flex', gap: 4, marginTop: 9 });
const Segment = styled('i', { shouldForwardProp: (p) => p !== '$done' })<{ $done: boolean }>(
  ({ $done }) => ({
    height: 4,
    flex: 1,
    borderRadius: 2,
    background: $done ? componentTheme.success : CHIP_TONE.gated.tint,
  }),
);

export interface GatesSummaryProps {
  variant: 'blocked' | 'ok';
  spaceSlug: string;
  /** Gates still open. */
  openGates: number;
  findings: number;
  units: number;
  warnings: number;
  /** One entry per gate, true when it cleared. */
  segments: boolean[];
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** The box at the top of the Gates tab: how many gates block the Space, and the progress. */
export const GatesSummary = ({
  variant,
  spaceSlug,
  openGates,
  findings,
  units,
  warnings,
  segments,
}: GatesSummaryProps) => {
  const ok = variant === 'ok';
  return (
    <Root $ok={ok} data-testid='gates-summary'>
      <Box
        sx={{
          color: ok ? componentTheme.success : componentTheme.attention,
          flexShrink: 0,
          display: 'flex',
          mt: '1px',
        }}
      >
        {ok ? (
          <CheckRoundedIcon sx={{ fontSize: 18 }} />
        ) : (
          <LockOutlinedIcon sx={{ fontSize: 18 }} />
        )}
      </Box>
      <Box sx={{ minWidth: 0, flex: 1 }}>
        <Title data-testid='gates-summary-title'>
          {ok
            ? `Nothing blocks ${spaceSlug}`
            : `${plural(openGates, 'gate blocks', 'gates block')} ${spaceSlug}`}
        </Title>
        <Text data-testid='gates-summary-text'>
          {ok
            ? warnings > 0
              ? `${plural(warnings, 'warning', 'warnings')} to look at. Warnings do not block. Fix them when you can.`
              : 'Every gate is cleared.'
            : `${plural(findings, 'finding', 'findings')} in ${plural(units, 'Unit', 'Units')}. Work through each gate. When a fix is saved, its Trigger runs again.${
                warnings > 0
                  ? ` ${plural(warnings, 'warning does', 'warnings do')} not block.`
                  : ''
              }`}
        </Text>
        {!ok && (
          <Progress data-testid='gates-progress'>
            {segments.map((done, i) => (
              <Segment key={i} $done={done} />
            ))}
          </Progress>
        )}
      </Box>
    </Root>
  );
};
