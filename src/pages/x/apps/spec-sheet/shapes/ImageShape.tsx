// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
// A container's image: the repository in t3 and the image tag strong, in one value
// that wraps and is never cut (a digest carries its meaning at the end); the pull policy on
// the line below.
import { memo } from 'react';

import { parseImageRef } from '../../imageRef';
import { FieldValue } from '../FieldValue';
import type { SheetAtom } from '../specSheetModel';
import { type ShapeProps, inContainer, joinSegs } from './shapeKit';
import { Dotted } from '../Dotted';

/** The image split where the image tag (or the digest) starts. */
function imageParts(ref: string): { head: string; tail: string } | null {
  const parsed = parseImageRef(ref);
  if (!parsed || (!parsed.tag && !parsed.digest)) return null;
  const cut = parsed.digest ? ref.indexOf('@') : ref.lastIndexOf(':');
  if (cut < 0) return null;
  // With both an image tag and a digest the tag is the start of the strong part.
  const start = parsed.tag && parsed.digest ? ref.lastIndexOf(':', cut) : cut;
  return { head: ref.slice(0, start + 1), tail: ref.slice(start + 1) };
}

function ImageValue({ atom }: { atom: SheetAtom }) {
  const parts = typeof atom.value === 'string' ? imageParts(atom.value) : null;
  if (!parts) return <FieldValue atom={atom} />;
  return (
    <FieldValue atom={atom}>
      <span className='irepo'>{parts.head}</span>
      <span className='itag'>{parts.tail}</span>
    </FieldValue>
  );
}

export const ImageShape = memo(function ImageShape({ block }: ShapeProps) {
  return (
    <>
      {block.atoms.map((atom) => {
        const key = joinSegs(inContainer(atom));
        if (key === 'image') {
          return (
            <div key={atom.key} className='iline'>
              <ImageValue atom={atom} />
            </div>
          );
        }
        return (
          <div key={atom.key} className='line ipull'>
            <span className='pair'>
              <span className='k'><Dotted>{key === 'imagePullPolicy' ? 'pull' : key}</Dotted></span>
              <FieldValue atom={atom} />
            </span>
          </div>
        );
      })}
    </>
  );
});
