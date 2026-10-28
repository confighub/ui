// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import Box from '@mui/material/Box';

import { changeOrderAction, changeOrderInk, changeOrderStatus, changeOrderType } from '../changeOrdersTokens';
import type { DraftAddressPatch } from './draftDecisions';
import { draftFixId, draftProblemId, type DraftPlace } from './draftFocus';
import { BARE_BUTTON, FOCUS_RING, problemEdgeSx } from './draftLook';
import type { DraftProblem } from './draftTypes';

export interface DraftProblemsProps {
  place: DraftPlace;
  problems: readonly DraftProblem[];
  /** One of them is the problem the blocker beside Create names: it carries the rust edge. */
  next: boolean;
  /** Apply a problem's own fix (`problem.fix.patch`). */
  onFix: (patch: DraftAddressPatch) => void;
}

/**
 * The problems of one part of the summary card, said under it: the server's or the client's
 * own words, and a fix where there is one. Each line has an id, so the control it is about can
 * be described by it, and each fix has one, so the blocker can send the keyboard there. Nothing
 * when there are none.
 */
export function DraftProblems({ place, problems, next, onFix }: DraftProblemsProps) {
  if (problems.length === 0) return null;
  return (
    <Box
      data-testid="draft-problems"
      data-place={place}
      data-next={next ? '' : undefined}
      sx={{ display: 'flex', flexDirection: 'column', gap: '2px', marginTop: '6px', ...problemEdgeSx(next) }}
    >
      {problems.map((problem) => {
        const fix = problem.fix;
        return (
          <Box
            key={problem.code + problem.message}
            data-problem={problem.code}
            sx={{
              display: 'flex',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '0 8px',
              fontSize: changeOrderType.size.small,
              lineHeight: changeOrderType.lineHeight.body,
              color: problem.blocks ? changeOrderStatus.danger : changeOrderStatus.warn,
            }}
          >
            <span id={draftProblemId(problem)}>
              {problem.message}
              {problem.detail === undefined ? null : (
                <Box component="span" sx={{ display: 'block', color: changeOrderInk.muted }}>
                  {problem.detail}
                </Box>
              )}
            </span>
            {fix === undefined ? null : (
              <Box
                component="button"
                type="button"
                id={draftFixId(problem)}
                onClick={() => onFix(fix.patch)}
                sx={{
                  ...BARE_BUTTON,
                  fontSize: changeOrderType.size.small,
                  fontWeight: changeOrderType.weight.semibold,
                  color: changeOrderAction.ink,
                  borderRadius: '3px',
                  '&:hover': { textDecoration: 'underline', textUnderlineOffset: '2px' },
                  '&:focus-visible': FOCUS_RING,
                }}
              >
                {fix.label}
              </Box>
            )}
          </Box>
        );
      })}
    </Box>
  );
}
