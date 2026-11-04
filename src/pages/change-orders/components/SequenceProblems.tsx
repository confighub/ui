// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import Box from '@mui/material/Box';

import type { ChangeOrderSequenceProblem } from '../../x/apps/change-order/changeOrderTypes';
import { changeOrderInk, changeOrderShape, changeOrderType } from '../changeOrdersTokens';
import { describeSequenceProblem, sequenceProblemsBlock, sequenceProblemsCopy } from './sequenceProblem';

export interface SequenceProblemsProps {
  problems: readonly ChangeOrderSequenceProblem[];
  /** The workflow's Stages by name, in order, the source left out: for what the problems hold. */
  stageNames: readonly string[];
}

/**
 * The problems of the promotion Stages, under the rail, as errors, in the pale red of a failure
 * (`StageBoxParts`' error tone): a title that counts them, what they block, then one line each.
 * Renders nothing when there are none.
 */
export function SequenceProblems({ problems, stageNames }: SequenceProblemsProps) {
  if (problems.length === 0) return null;
  const blocks = sequenceProblemsBlock(problems, stageNames);
  return (
    <Box
      component="section"
      role="region"
      aria-label={sequenceProblemsCopy.title(problems.length)}
      data-testid="sequence-problems"
      sx={{
        marginTop: '12px',
        padding: '10px 12px',
        border: '1px solid var(--red-bd)',
        borderRadius: `${changeOrderShape.radius.md}px`,
        background: 'var(--red-bg)',
        fontSize: changeOrderType.size.small,
        color: changeOrderInk.default,
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: changeOrderType.weight.semibold, color: 'error.main' }}>
        <ErrorOutlineIcon aria-hidden="true" sx={{ fontSize: 16, color: 'error.main' }} />
        {sequenceProblemsCopy.title(problems.length)}
        {blocks !== undefined ? (
          <Box component="span" data-testid="sequence-problems-block" sx={{ fontWeight: changeOrderType.weight.regular, color: changeOrderInk.default }}>
            {blocks}
          </Box>
        ) : null}
      </Box>
      <Box component="ul" sx={{ margin: '6px 0 0', paddingLeft: '22px' }}>
        {problems.map((p, i) => (
          <Box component="li" key={i}>
            {describeSequenceProblem(p)}
          </Box>
        ))}
      </Box>
    </Box>
  );
}
