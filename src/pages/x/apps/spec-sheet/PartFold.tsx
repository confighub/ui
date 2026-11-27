// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

// The fold line of a quiet init container: its image and its field count. A click opens it.

import { memo } from 'react';
import { parseImageRef } from '../imageRef';
import { runsOf } from './atomRuns';
import type { SheetPart } from './specSheetModel';

export const PartFold = memo(function PartFold({ part, onOpen }: { part: SheetPart; onOpen: () => void }) {
  // A list of plain values is one field, as the sheet draws it.
  const fields = part.blocks.reduce((n, b) => n + runsOf(b.atoms).length, part.titleAtom ? 1 : 0);
  const ref = part.image ? parseImageRef(part.image) : null;
  const cut = part.image && ref && (ref.tag || ref.digest) ? part.image.length - (ref.digest ?? ref.tag ?? '').length : -1;
  return (
    <button type='button' className='fold' data-testid={`part-fold-${part.testKey}`} onClick={onOpen} aria-expanded={false}>
      <svg viewBox='0 0 16 16' fill='none' stroke='currentColor' strokeWidth='2' aria-hidden>
        <path d='M6 4l4 4-4 4' />
      </svg>
      <span className='fv'>
        {part.image === undefined ? (
          <span className='lit'>no image</span>
        ) : cut > 0 ? (
          <>
            <span className='dim'>{part.image.slice(0, cut)}</span>
            {part.image.slice(cut)}
          </>
        ) : (
          part.image
        )}
      </span>
      <span className='n'>{fields} fields</span>
    </button>
  );
});
