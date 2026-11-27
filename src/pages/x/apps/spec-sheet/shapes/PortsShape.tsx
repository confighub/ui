// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
// A container's ports: one token per port, its name in t3, the port, the protocol.
import { memo } from 'react';

import { FieldValue } from '../FieldValue';
import { type ShapeProps, afterListItem, groupRuns, joinSegs } from './shapeKit';
import { Dotted } from '../Dotted';

const PLAIN = new Set(['name', 'containerPort', 'protocol']);

export const PortsShape = memo(function PortsShape({ block }: ShapeProps) {
  const items = groupRuns(block.atoms, (a) => afterListItem(a, 'ports')?.index ?? -1);
  return (
    <div className='toks'>
      {items.map(({ key, atoms }) => (
        <span className='tok' key={`${key}-${atoms[0].key}`}>
          {atoms.map((atom) => {
            const rest = afterListItem(atom, 'ports')?.rest ?? [];
            const field = joinSegs(rest);
            // The name reads first (CSS order), wherever the document puts it.
            if (field === 'name') {
              return (
                <span className='pn' key={atom.key}>
                  <FieldValue atom={atom} />
                </span>
              );
            }
            if (PLAIN.has(field) || key === -1)
              return <FieldValue key={atom.key} atom={atom} />;
            return (
              <span className='pair' key={atom.key}>
                <span className='k'><Dotted>{field}</Dotted></span>
                <FieldValue atom={atom} />
              </span>
            );
          })}
        </span>
      ))}
    </div>
  );
});
