// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
// Labels, annotations, selectors and node selectors: key=value tokens, the key in
// t3, the value cut at two lines. A field of the block that is not one key of the map (a
// `matchExpressions` item, an affinity) is a key and value row. Over 12 tokens the run folds.
import { memo } from 'react';

import { FieldValue, ListValue } from '../FieldValue';
import { type FoldItem, Folded } from '../FoldMore';
import { runsOf } from '../atomRuns';
import type { SheetAtom, SheetBlock } from '../specSheetModel';
import { atomKeyInBlock } from '../specSheetModel';
import { type ShapeProps, groupRuns } from './shapeKit';
import { Dotted } from '../Dotted';

/** The maps whose keys are tokens. */
const TOKEN_MAPS = ['matchLabels', 'nodeSelector', 'labels', 'annotations'];

/** The token key of an atom, or null when the atom is not one key of a token map. */
function tokenKey(atom: SheetAtom, block: SheetBlock): string | null {
  if (atom.list || atom.emptyContainer) return null;
  const rel = atomKeyInBlock(atom, block);
  if (rel === atom.path) return null;
  if (['labels', 'annotations'].includes(block.key)) return rel || null;
  // A Service's selector is the map itself: each key is one token.
  if (block.key === 'selector' && rel && !rel.includes('.')) return rel;
  for (const map of TOKEN_MAPS) {
    if (rel.startsWith(`${map}.`)) return rel.slice(map.length + 1);
  }
  return null;
}

function Token({ atom, k }: { atom: SheetAtom; k: string }) {
  return (
    <span className='tok kvtok'>
      <span className='tk'>{k}=</span>
      <FieldValue atom={atom} lines={2} />
    </span>
  );
}

export const TokensShape = memo(function TokensShape({ block }: ShapeProps) {
  const groups = groupRuns(block.atoms, (a) => tokenKey(a, block) !== null);
  return (
    <>
      {groups.map(({ key: isToken, atoms }) => {
        if (isToken) {
          const items: FoldItem[] = atoms.map((atom) => ({
            key: atom.key,
            atoms: [atom],
            node: <Token atom={atom} k={tokenKey(atom, block)!} />,
          }));
          return (
            <div className='toks' key={atoms[0].key}>
              <Folded items={items} />
            </div>
          );
        }
        return (
          <div className='kv' key={atoms[0].key}>
            {runsOf(atoms).map((run) => {
              if (run.kind === 'list') {
                return (
                  <div className='kvr' key={run.path}>
                    <span className='k'><Dotted>
                      {atomKeyInBlock({ ...run.items[0], path: run.path }, block) ||
                        block.label}
                    </Dotted></span>
                    <ListValue items={run.items} lines={2} />
                  </div>
                );
              }
              return (
                <div className='kvr' key={run.atom.key}>
                  <span className='k'><Dotted>{atomKeyInBlock(run.atom, block) || block.label}</Dotted></span>
                  <FieldValue atom={run.atom} lines={2} />
                </div>
              );
            })}
          </div>
        );
      })}
    </>
  );
});
