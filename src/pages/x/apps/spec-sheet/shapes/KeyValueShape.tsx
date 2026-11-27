// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
// The generic shape: each field as its key (relative to the block) and its value, in document
// order. The fallback of every block no other shape draws ("Other", CRDs), and the plain
// blocks (Replicas, Type).
import { memo } from 'react';

import { FieldValue, ListValue } from '../FieldValue';
import { type FoldItem, Folded } from '../FoldMore';
import { runsOf } from '../atomRuns';
import { type SheetBlock, atomKeyInBlock } from '../specSheetModel';
import { Dotted } from '../Dotted';

export const KeyValueShape = memo(function KeyValueShape({ block }: { block: SheetBlock }) {
  const runs = runsOf(block.atoms);
  // A block of one value with no key under the block (`replicas: 2`) is the value alone.
  if (runs.length === 1) {
    const run = runs[0];
    const key =
      run.kind === 'atom'
        ? atomKeyInBlock(run.atom, block)
        : atomKeyInBlock({ ...run.items[0], path: run.path }, block);
    if (key === '') {
      return run.kind === 'atom' ? (
        <FieldValue atom={run.atom} />
      ) : (
        <ListValue items={run.items} lines={2} />
      );
    }
  }
  // Over 12 rows the list folds.
  const items: FoldItem[] = runs.map((run) => {
    if (run.kind === 'atom') {
      return {
        key: run.atom.key,
        atoms: [run.atom],
        node: (
          <div className='kvr'>
            <span className='k'><Dotted>{atomKeyInBlock(run.atom, block) || block.label}</Dotted></span>
            <FieldValue atom={run.atom} lines={2} />
          </div>
        ),
      };
    }
    const listKey = atomKeyInBlock({ ...run.items[0], path: run.path }, block);
    return {
      key: run.path,
      atoms: run.items,
      node: (
        <div className='kvr'>
          <span className='k'><Dotted>{listKey || block.label}</Dotted></span>
          <ListValue items={run.items} lines={2} />
        </div>
      ),
    };
  });
  return (
    <div className='kv'>
      <Folded items={items} />
    </div>
  );
});
