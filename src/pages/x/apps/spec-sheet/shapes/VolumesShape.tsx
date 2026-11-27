// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
// The Pod's volumes ("Sources"): the volume name in t3, then a kind icon and the source
// (a claim name, a ConfigMap or Secret name, emptyDir); any other field of the source as a
// key and value.
import { memo } from 'react';

import { FieldValue, ListValue } from '../FieldValue';
import { runsOf } from '../atomRuns';
import type { SheetAtom } from '../specSheetModel';
import { Glyph, type GlyphName } from './Glyph';
import { type ShapeProps, afterListItem, groupRuns, joinSegs, nameOf } from './shapeKit';
import { Dotted } from '../Dotted';

const MAIN_FIELD: Record<string, string> = {
  persistentVolumeClaim: 'claimName',
  configMap: 'name',
  secret: 'secretName',
};

const GLYPH: Record<string, GlyphName> = {
  persistentVolumeClaim: 'disk',
  configMap: 'configMap',
  secret: 'key',
};

const restOf = (atom: SheetAtom) => afterListItem(atom, 'volumes')?.rest ?? atom.segments;

function Source({ atom }: { atom: SheetAtom }) {
  const rest = restOf(atom);
  const kind = String(rest[0] ?? '');
  const glyph = <Glyph name={GLYPH[kind] ?? 'dashed'} label={kind} />;
  if (rest.length === 1 && atom.emptyContainer === 'map') {
    return (
      <span className='pair'>
        {glyph}
        <FieldValue atom={atom}>{kind}</FieldValue>
      </span>
    );
  }
  if (rest.length === 2 && MAIN_FIELD[kind] === rest[1]) {
    return (
      <span className='pair'>
        {glyph}
        <FieldValue atom={atom} />
      </span>
    );
  }
  return (
    <span className='pair'>
      <span className='k'><Dotted>{joinSegs(rest)}</Dotted></span>
      <FieldValue atom={atom} lines={2} />
    </span>
  );
}

export const VolumesShape = memo(function VolumesShape({ block }: ShapeProps) {
  const items = groupRuns(block.atoms, (a) => afterListItem(a, 'volumes')?.index ?? a.key);
  return (
    <div className='kv'>
      {items.map(({ key, atoms }) => {
        const { name, place, rest } = nameOf(atoms, (a) => joinSegs(restOf(a)) === 'name');
        const nameCell = name && (
          <span className='pn kname c1'>
            <FieldValue atom={name} />
          </span>
        );
        return (
          <div className='srow' key={String(key)}>
            {place === 'first' && nameCell}
            <span className='line c2'>
              {runsOf(rest).map((run) =>
                run.kind === 'atom' ? (
                  <Source key={run.atom.key} atom={run.atom} />
                ) : (
                  <span className='pair' key={run.path}>
                    <span className='k'><Dotted>
                      {joinSegs(
                        restOf({
                          ...run.items[0],
                          segments: run.items[0].segments.slice(0, -1),
                        }),
                      )}
                    </Dotted></span>
                    <ListValue items={run.items} lines={2} />
                  </span>
                ),
              )}
            </span>
            {place === 'last' && nameCell}
          </div>
        );
      })}
    </div>
  );
});
