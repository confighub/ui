// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
// A container's command: `command` and `args` each as one line of words, cut at two
// lines with the full text in the title; `workingDir` as a pair.
import { memo } from 'react';

import { FieldValue, ListValue } from '../FieldValue';
import { runsOf } from '../atomRuns';
import { type ShapeProps, inContainer, joinSegs } from './shapeKit';
import { Dotted } from '../Dotted';

export const CommandShape = memo(function CommandShape({ block }: ShapeProps) {
  return (
    <>
      {runsOf(block.atoms).map((run) => {
        const first = run.kind === 'atom' ? run.atom : run.items[0];
        const segs = inContainer(first);
        const key = String(segs[0] ?? '');
        const value =
          run.kind === 'atom' ? (
            <FieldValue atom={run.atom} lines={2} />
          ) : (
            <ListValue items={run.items} lines={2} />
          );
        if (key === 'command') {
          return <div key={first.key}>{value}</div>;
        }
        const label = run.kind === 'atom' ? joinSegs(segs) : key;
        return (
          <div key={first.key} className='line'>
            <span className='pair'>
              <span className='k'><Dotted>{label}</Dotted></span>
              {value}
            </span>
          </div>
        );
      })}
    </>
  );
});
