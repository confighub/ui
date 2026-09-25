// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * The gates on one stage: status, plain reason, and named approvers.
 *
 * Three statuses, and the third one matters as much as the other two:
 *   satisfied      — the check ran and passed.
 *   unsatisfied    — the check ran and failed. The reason says which Space and why.
 *   not evaluated  — the check did NOT run, because something earlier in the
 *                    sequence has not been satisfied yet.
 *
 * "Not evaluated" is deliberately neither a pass nor a failure. Rendering it as
 * a failure would tell the user something is wrong when nothing is; rendering it
 * as a pass would tell them a stage is clear when it has not been checked. It is
 * its own thing, and it is the honest answer.
 *
 * Approvers carry no timestamp: nothing populates them yet (see rolloutGates.ts),
 * and a model built on Attestations can add one from each Attestation's CreatedAt.
 */

import { memo } from 'react';

import Box from '@mui/material/Box';
import { styled } from '@mui/material/styles';

import { componentTheme } from '../componentTheme';
import { rolloutCopy } from './rolloutCopy';
import { tagLabel, toneOf, type GateTone } from './rolloutGateTone';
import type { RolloutApprover, RolloutGate } from './rolloutTypes';

interface RolloutGateListProps {
  stageId: string;
  gates: RolloutGate[];
  /** The base has no gates for a different reason than a gateless stage does. */
  isSource: boolean;
}

const GateRow = styled(Box)({
  display: 'flex',
  gap: 9,
  padding: '9px 12px',
  borderBottom: `1px solid ${componentTheme.borderSubtle}`,
  minWidth: 0,
});

const GateMark = styled('span', {
  shouldForwardProp: (prop) => prop !== '$tone',
})<{ $tone: GateTone }>(({ $tone }) => ({
  flex: '0 0 16px',
  width: 16,
  height: 16,
  marginTop: 1,
  borderRadius: '50%',
  display: 'grid',
  placeItems: 'center',
  fontSize: 10,
  fontWeight: 700,
  lineHeight: 1,
  ...($tone === 'ok'
    ? { background: componentTheme.success, color: componentTheme.fgOnEmphasis }
    : $tone === 'no'
      ? { background: componentTheme.attention, color: componentTheme.fgOnEmphasis }
      : {
          background: componentTheme.bgInset,
          color: componentTheme.fgSubtle,
          border: `1px solid ${componentTheme.borderDefault}`,
        }),
}));

const GateBody = styled(Box)({ minWidth: 0, flex: 1 });

const GateName = styled(Box)({
  fontFamily: componentTheme.fontMono,
  fontSize: 11.5,
  fontWeight: 600,
  color: componentTheme.fgDefault,
  wordBreak: 'break-all',
  display: 'flex',
  alignItems: 'baseline',
  gap: 7,
  flexWrap: 'wrap',
});

const GateTag = styled('span', {
  shouldForwardProp: (prop) => prop !== '$tone',
})<{ $tone: GateTone }>(({ $tone }) => ({
  fontSize: 10,
  fontWeight: 700,
  borderRadius: 3,
  padding: '1px 6px',
  letterSpacing: '0.03em',
  flexShrink: 0,
  ...($tone === 'ok'
    ? { color: componentTheme.success, background: 'rgba(21,128,61,0.13)' }
    : $tone === 'no'
      ? { color: componentTheme.attention, background: 'rgba(159,66,0,0.13)' }
      : { color: componentTheme.fgSubtle, background: componentTheme.bgInset }),
}));

const GateWhy = styled(Box)({
  marginTop: 3,
  fontSize: 11.5,
  color: componentTheme.fgMuted,
  lineHeight: 1.5,
});

const ApproverList = styled(Box)({
  marginTop: 6,
  display: 'flex',
  flexDirection: 'column',
  gap: 5,
});

const ApproverRow = styled(Box)({
  display: 'flex',
  alignItems: 'center',
  gap: 7,
  fontSize: 11.5,
  color: componentTheme.fgMuted,
  minWidth: 0,
});

const Monogram = styled('span')({
  width: 19,
  height: 19,
  flex: '0 0 19px',
  borderRadius: '50%',
  background: componentTheme.success,
  color: componentTheme.fgOnEmphasis,
  display: 'grid',
  placeItems: 'center',
  fontSize: 9,
  fontWeight: 700,
});

const EmptyRow = styled(Box)({
  padding: '9px 12px',
  fontSize: 12,
  color: componentTheme.fgSubtle,
  borderBottom: `1px solid ${componentTheme.borderSubtle}`,
});

/** Tick, warning, or a neutral dot for "has not run". */
function markGlyph(tone: GateTone): string {
  if (tone === 'ok') return '✓';
  if (tone === 'no') return '!';
  return '·';
}

const ApproverEntry = memo(({ approver }: { approver: RolloutApprover }) => (
  <ApproverRow>
    <Monogram>{approver.initials}</Monogram>
    <Box component="span" sx={{ color: componentTheme.fgDefault, fontWeight: 600 }}>
      {approver.name}
    </Box>
  </ApproverRow>
));
ApproverEntry.displayName = 'ApproverEntry';

export const RolloutGateList = memo(({ stageId, gates, isSource }: RolloutGateListProps) => {
  if (gates.length === 0) {
    return (
      <EmptyRow data-testid={`rollout-gates-empty-${stageId}`}>
        {isSource ? rolloutCopy.noGates.base : rolloutCopy.noGates.stage(stageId)}
      </EmptyRow>
    );
  }

  return (
    <>
      {gates.map((gate) => {
        const tone = toneOf(gate);
        return (
          <GateRow key={gate.id} data-testid={`rollout-gate-${stageId}-${gate.id}`}>
            <GateMark $tone={tone} aria-hidden>
              {markGlyph(tone)}
            </GateMark>
            <GateBody>
              <GateName>
                {gate.name}
                <GateTag $tone={tone} data-testid={`rollout-gate-tag-${stageId}-${gate.id}`}>
                  {tagLabel(gate)}
                </GateTag>
              </GateName>
              <GateWhy>{gate.reason}</GateWhy>
              {gate.approvers !== undefined && gate.approvers.length > 0 && (
                <ApproverList>
                  {gate.approvers.map((approver) => (
                    <ApproverEntry key={approver.userId} approver={approver} />
                  ))}
                </ApproverList>
              )}
            </GateBody>
          </GateRow>
        );
      })}
    </>
  );
});

RolloutGateList.displayName = 'RolloutGateList';
