// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * The sentences a problem is said in: how the change reaches some Space
 * differently (each item names the Space and links to the field, so the reader
 * can check the difference before writing it), and why a gate holds.
 */

import Box from '@mui/material/Box';

import { PROBLEM_ITEM_LIMIT, stageCardCopy, type NamedSpace } from './stageCardCopy';
import { problemItems, problemSegments } from './stagePropagation';
import { CopyText, StatusText, type StageLinks } from './StageBoxParts';
import type { ChangeOrderGate } from '../../x/apps/change-order/changeOrderTypes';
import type { PropagationProblem } from './stageTypes';

const copy = stageCardCopy.problem;

const listSx = {
  listStyle: 'none',
  m: '8px 0 0',
  p: 0,
  display: 'grid',
  gap: '8px',
  maxWidth: '76ch',
  typography: 'body2',
  color: 'inherit',
} as const;

export interface ProblemListProps {
  problems: readonly PropagationProblem[];
  nameOfSpace: (spaceId: string) => string;
  nameOfUnit: (unitId: string) => string;
  links: StageLinks;
  limit?: number;
}

/** The problem items, worst first, at most `limit`; the rest are in the diff. */
export function ProblemList({ problems, nameOfSpace, nameOfUnit, links, limit = PROBLEM_ITEM_LIMIT }: ProblemListProps) {
  const { shown, more } = problemItems(problems, limit);
  const kinds = new Set(problems.map((p) => p.kind));
  const spaceOf = (spaceId: string): NamedSpace => ({ spaceId, name: nameOfSpace(spaceId) });
  return (
    <Box component="ul" sx={listSx} data-testid="stage-problem" data-problem-kind={kinds.size === 1 ? problems[0]?.kind : 'mixed'}>
      {shown.map((problem, i) => (
        <li key={i} data-problem={problem.kind}>
          <CopyText parts={problemSegments(problem, spaceOf, nameOfUnit)} links={links} />
        </li>
      ))}
      {more > 0 ? (
        <li>
          <CopyText parts={[{ kind: 'link', text: copy.andMore(more), ref: { to: 'diff' } }]} links={links} />
        </li>
      ) : null}
    </Box>
  );
}

/**
 * Each gate's reason, and the Spaces its server rows name as links. The gate's
 * name leads when there is more than one, or when `named` asks for it.
 */
export function GateReasons({ gates, links, gateSpaces, named = false }: { gates: readonly ChangeOrderGate[]; links: StageLinks; gateSpaces?: (gateId: string) => NamedSpace[]; named?: boolean }) {
  const b = stageCardCopy.body;
  return (
    <>
      {gates.map((gate) => {
        const spaces = gateSpaces?.(gate.id) ?? [];
        return (
          <StatusText key={gate.id} testId="stage-gate-reason">
            {named || gates.length > 1 ? (
              <>
                <CopyText parts={[{ kind: 'code', text: gate.name }]} />
                {': '}
              </>
            ) : null}
            <CopyText parts={b.gateReasonIn(gate.reason, spaces)} links={links} />
          </StatusText>
        );
      })}
    </>
  );
}
