// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
// Security: each boolean is a token with a check or a cross and the field's name; any
// other value is a short key and the value. The flags read first and the pairs on the next
// line (CSS order), while the drawn order stays the document order.
import { memo } from 'react';

import { FieldValue, ListValue } from '../FieldValue';
import { runsOf } from '../atomRuns';
import type { SheetAtom, SheetBlock } from '../specSheetModel';
import { atomKeyInBlock } from '../specSheetModel';
import { Glyph } from './Glyph';
import { type ShapeProps } from './shapeKit';
import { Dotted } from '../Dotted';

/** The key of a security field, short: `capabilities.drop` → `drop`. */
function shortKey(atom: SheetAtom, block: SheetBlock): string {
  return atomKeyInBlock(atom, block)
    .replace(/^securityContext\./, '')
    .replace(/^capabilities\./, '');
}

export const FlagsShape = memo(function FlagsShape({ block }: ShapeProps) {
  const runs = runsOf(block.atoms);
  const hasFlags = block.atoms.some((a) => typeof a.value === 'boolean');
  const hasPairs = runs.some((r) => r.kind === 'list' || typeof r.atom.value !== 'boolean');
  return (
    <div className='flags'>
      {runs.map((run) => {
        if (run.kind === 'list') {
          const key = shortKey({ ...run.items[0], path: run.path }, block);
          return (
            <span className='pair fpair' key={run.path}>
              <span className='k'><Dotted>{key}</Dotted></span>
              <ListValue items={run.items} lines={2} />
            </span>
          );
        }
        const atom = run.atom;
        const key = shortKey(atom, block);
        if (typeof atom.value === 'boolean') {
          const name = String(atom.segments[atom.segments.length - 1]);
          return (
            <span className='tok flag' key={atom.key}>
              <Glyph name={atom.value ? 'check' : 'cross'} label={String(atom.value)} />
              <FieldValue atom={atom}>{name}</FieldValue>
            </span>
          );
        }
        return (
          <span className='pair fpair' key={atom.key}>
            <span className='k'><Dotted>{key}</Dotted></span>
            <FieldValue atom={atom} lines={2} />
          </span>
        );
      })}
      {hasFlags && hasPairs && <span className='fbreak' aria-hidden />}
    </div>
  );
});
