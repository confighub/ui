// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import Box from '@mui/material/Box';

import type { ChangeOrderSequenceProblem } from '../../x/apps/change-order/changeOrderTypes';
import { changeOrderInk, changeOrderType } from '../changeOrdersTokens';
import { describeSequenceProblem } from './sequenceProblem';

export interface SequenceProblemsProps {
  problems: readonly ChangeOrderSequenceProblem[];
}

/** The sequence problems under a promotion path, one line each. Renders nothing when there are none. */
export function SequenceProblems({ problems }: SequenceProblemsProps) {
  if (problems.length === 0) return null;
  return (
    <Box sx={{ fontSize: changeOrderType.size.small, color: changeOrderInk.muted, marginTop: '10px' }}>
      {problems.map((p, i) => (
        <Box key={i}>{describeSequenceProblem(p)}</Box>
      ))}
    </Box>
  );
}
