// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
// A container's volume mounts: the volume name in t3, then the mount path and the other
// fields of the mount (`subPath`, `readOnly`) as pairs.
import { memo } from 'react';

import { FieldValue } from '../FieldValue';
import type { SheetAtom } from '../specSheetModel';
import { type ShapeProps, afterListItem, groupRuns, joinSegs, nameOf } from './shapeKit';
import { Dotted } from '../Dotted';

function itemOf(atom: SheetAtom) {
  return afterListItem(atom, 'volumeMounts') ?? afterListItem(atom, 'volumeDevices');
}

export const MountsShape = memo(function MountsShape({ block }: ShapeProps) {
  const items = groupRuns(block.atoms, (a) => {
    const at = itemOf(a);
    return at ? `${a.segments[a.segments.length - at.rest.length - 2]}.${at.index}` : a.key;
  });
  return (
    <div className='kv'>
      {items.map(({ key, atoms }) => {
        const { name, place, rest } = nameOf(
          atoms,
          (a) => joinSegs(itemOf(a)?.rest ?? []) === 'name',
        );
        const line = (
          <span className='line c2'>
            {rest.map((atom) => {
              const field = joinSegs(itemOf(atom)?.rest ?? atom.segments);
              if (field === 'mountPath' || field === 'devicePath')
                return <FieldValue key={atom.key} atom={atom} />;
              return (
                <span className='pair' key={atom.key}>
                  <span className='k'><Dotted>{field}</Dotted></span>
                  <FieldValue atom={atom} />
                </span>
              );
            })}
          </span>
        );
        const nameCell = name && (
          <span className='pn kname c1'>
            <FieldValue atom={name} />
          </span>
        );
        return (
          <div className='srow' key={key}>
            {place === 'first' && nameCell}
            {line}
            {place === 'last' && nameCell}
          </div>
        );
      })}
    </div>
  );
});
