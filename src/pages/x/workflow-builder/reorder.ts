// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * Saying out loud what moving a Stage did.
 *
 * Moving a Stage silently re-points its gates and changes the meaning of the
 * Stage it passed. Both halves get said, next to the rail that just changed, for
 * as long as the move is unsaved.
 */

import { andJoin } from './model';
import type { MoveSentence, ReorderNote, Stage, Workflow } from './types';

/**
 * Describes a move that has already been applied. `from` and `to` are the
 * positions before and after; `beforeNames` is the name order as it stood before
 * the swap, which is the only place the passed Stage's old neighbour survives.
 */
export function describeMove(
  wf: Workflow,
  moved: Stage,
  from: number,
  to: number,
  beforeNames: string[],
): ReorderNote {
  const dir = to < from ? 'earlier' : 'later';
  const name = (moved.name || '').trim() || 'this Stage';
  const gates = moved.prereqs;
  const oldPrev = from > 0 ? beforeNames[from - 1] : null;
  const newPrev = to > 0 ? wf.stages[to - 1].name : null;
  const parts: MoveSentence[] = [];

  if (!newPrev) {
    const s: MoveSentence = [
      { text: 'Moving ' },
      { text: name, strong: true },
      { text: ` ${dir} made it the first Stage. Nothing precedes it, so it has no entry gates` },
    ];
    if (gates.length) {
      s.push({ text: ' and ' });
      andJoin(gates).forEach((g) => {
        s.push(g.sep !== undefined ? { text: g.sep } : { text: g.item, gate: true });
      });
      s.push({ text: ` ${gates.length === 1 ? 'is' : 'are'} no longer checked anywhere` });
    }
    s.push({ text: '.' });
    parts.push(s);
  } else if (gates.length) {
    const s: MoveSentence = [
      { text: 'Moving ' },
      { text: name, strong: true },
      { text: ` ${dir} re-pointed its gates. ` },
    ];
    andJoin(gates).forEach((g) => {
      s.push(g.sep !== undefined ? { text: g.sep } : { text: g.item, gate: true });
    });
    s.push({ text: ` ${gates.length === 1 ? 'is' : 'are'} now checked over ` });
    s.push({ text: newPrev, strong: true });
    if (oldPrev) {
      s.push({ text: ', not ' });
      s.push({ text: oldPrev, strong: true });
    } else {
      s.push({ text: ', where before nothing preceded it' });
    }
    s.push({ text: '.' });
    parts.push(s);
  } else {
    const s: MoveSentence = [
      { text: 'Moving ' },
      { text: name, strong: true },
      { text: ` ${dir} re-pointed its gates. It declares none, so it now enters from ` },
      { text: newPrev, strong: true },
    ];
    if (oldPrev) {
      s.push({ text: ', not ' });
      s.push({ text: oldPrev, strong: true });
    }
    s.push({ text: '.' });
    parts.push(s);
  }

  /* The Stage it passed changed meaning too, and that is the half people miss. */
  const other = wf.stages[from];
  if (other && from > 0 && other.prereqs.length) {
    const s: MoveSentence = [
      { text: (other.name || '').trim() || 'the Stage it passed', strong: true },
      { text: ' now gates on ' },
      { text: wf.stages[from - 1].name, strong: true },
      { text: ': ' },
    ];
    andJoin(other.prereqs).forEach((g) => {
      s.push(g.sep !== undefined ? { text: g.sep } : { text: g.item, gate: true });
    });
    s.push({ text: ` ${other.prereqs.length === 1 ? 'is' : 'are'} checked over it.` });
    parts.push(s);
  }

  return { parts, a: from, b: to };
}
