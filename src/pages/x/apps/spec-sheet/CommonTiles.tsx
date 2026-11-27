// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

// The three common-change tiles under a workload's identity: IMAGE TAG, REPLICAS, LIMITS.
// They move no field: a click scrolls to the field in its own place, focuses it and opens its
// peek. A tile shows only when its field exists. The Flat Link Chip recipe of the design system,
// as a button.

import { memo } from 'react';
import { rollUp, useSheetOverlay } from './sheetOverlay';
import { atomText, type SheetAtom, type SheetResource } from './specSheetModel';
import { imageTagOf, middleCut, tilesOf, type Tile } from './tileModel';
import { StateMarks } from './StateMark';

interface CommonTilesProps {
  resource: SheetResource;
  onJump: (atom: SheetAtom) => void;
}

export const CommonTiles = memo(function CommonTiles({ resource, onJump }: CommonTilesProps) {
  const overlay = useSheetOverlay();
  const tiles = tilesOf(resource);
  if (tiles.length === 0) return null;
  return (
    <div className='common' data-testid='common-strip'>
      {tiles.map((tile) => {
        const marks = rollUp(overlay, tile.atoms);
        const title = tile.atoms.map(atomText).join(' / ');
        return (
          <button
            key={tile.id}
            type='button'
            className='ctile'
            data-testid={`common-tile-${tile.id}`}
            title={title}
            onClick={() => onJump(tile.atoms[0])}
          >
            <span className='cl'>
              {tile.label}
              <StateMarks {...marks} chip />
            </span>
            <span className='cv'>{tileValue(tile)}</span>
          </button>
        );
      })}
    </div>
  );
});

function tileValue(tile: Tile) {
  if (tile.id === 'image') {
    const tag = imageTagOf(atomText(tile.atoms[0]));
    return (
      <span data-testid='common-tile-image-value' title={tag}>
        <span className='cut-wide'>{middleCut(tag, 22)}</span>
        <span className='cut-narrow'>{middleCut(tag, 13)}</span>
      </span>
    );
  }
  if (tile.id === 'replicas') return atomText(tile.atoms[0]);
  const cpu = tile.atoms.find((a) => a.path.endsWith('.cpu'));
  const memory = tile.atoms.find((a) => a.path.endsWith('.memory'));
  return (
    <>
      {cpu ? middleCut(atomText(cpu), 9) : '–'} <span className='dim'>cpu</span> {memory ? middleCut(atomText(memory), 9) : '–'}
    </>
  );
}
