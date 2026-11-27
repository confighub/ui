// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

// Text that wraps only after a separator, never inside a segment, so a line never ends with a
// lone letter: a dotted key or path (`spec.template.spec.volumes.0.name`) after a dot, a value
// (`ghcr.io/openclaw/openclaw:2026.11.1-slim`) after ".", "/", ":" or "-". A segment wider than
// its box still breaks, as a last resort, by the box's `overflow-wrap: break-word`. <wbr> is
// not copied with the text.

import { Fragment, type ReactNode } from 'react';

const SEGMENT_STYLE = { display: 'inline-block', maxWidth: '100%', overflowWrap: 'anywhere' } as const;

/** The separators a value may wrap after. */
const VALUE_SEPARATORS = './:-';

/** `children` with a line-break opportunity after each of `after`. Anything that is not a string is kept as it is. */
export function BreakAfter({ children, after }: { children: ReactNode; after: string }) {
  if (typeof children !== 'string') return <>{children}</>;
  const parts: string[] = [];
  let from = 0;
  for (let i = 0; i < children.length; i++) {
    if (after.includes(children[i]) && i < children.length - 1) {
      parts.push(children.slice(from, i + 1));
      from = i + 1;
    }
  }
  if (parts.length === 0) return <>{children}</>;
  parts.push(children.slice(from));
  return (
    <>
      {parts.map((part, i) => (
        <Fragment key={i}>
          {/* Each segment is a box of its own, so no font or width can split it: the line can
              break only between segments. A segment wider than its line still breaks inside its
              box (max-width 100%, overflow-wrap anywhere), the last resort. */}
          <span style={SEGMENT_STYLE}>{part}</span>
          {i < parts.length - 1 && <wbr />}
        </Fragment>
      ))}
    </>
  );
}

/** A dotted key or path: it wraps only after a dot. */
export function Dotted({ children }: { children: ReactNode }) {
  return <BreakAfter after='.'>{children}</BreakAfter>;
}

/** A value: it wraps only after ".", "/", ":" or "-". */
export function WrapValue({ children }: { children: ReactNode }) {
  return <BreakAfter after={VALUE_SEPARATORS}>{children}</BreakAfter>;
}
