// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * Renders a message the model built as runs rather than as a string of markup.
 *
 * The design assembles these with string concatenation and writes them through
 * `innerHTML`, which is safe there because the mock owns every value. Here a
 * Stage name is whatever the author typed, so the runs stay data and React sets
 * them as text.
 */

import { Fragment } from 'react';

import type { MessagePart } from '../types';

export function Msg({ parts }: { parts: MessagePart[] }) {
  return (
    <>
      {parts.map((p, i) => (
        <Fragment key={i}>{p.code ? <code>{p.text}</code> : p.text}</Fragment>
      ))}
    </>
  );
}

/** A name set in the mono face, inside a run of prose. */
export function Mono({ children }: { children: React.ReactNode }) {
  return <span className='mono'>{children}</span>;
}
