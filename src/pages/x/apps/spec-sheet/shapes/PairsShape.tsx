// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
// A small map of a workload's spec (`strategy`, `updateStrategy`): its fields as inline
// pairs on one line ("type Recreate"), in document order.
import { memo } from 'react';

import { FieldValue, ListValue } from '../FieldValue';
import { runsOf } from '../atomRuns';
import { atomKeyInBlock } from '../specSheetModel';
import type { ShapeProps } from './shapeKit';
import { Dotted } from '../Dotted';

export const PairsShape = memo(function PairsShape({ block }: ShapeProps) {
  return (
    <div className='line'>
      {runsOf(block.atoms).map((run) => {
        if (run.kind === 'list') {
          return (
            <span className='pair' key={run.path}>
              <span className='k'><Dotted>
                {atomKeyInBlock({ ...run.items[0], path: run.path }, block) || block.label}
              </Dotted></span>
              <ListValue items={run.items} lines={2} />
            </span>
          );
        }
        const key = atomKeyInBlock(run.atom, block);
        if (!key) return <FieldValue key={run.atom.key} atom={run.atom} />;
        return (
          <span className='pair' key={run.atom.key}>
            <span className='k'><Dotted>{key}</Dotted></span>
            <FieldValue atom={run.atom} lines={2} />
          </span>
        );
      })}
    </div>
  );
});
