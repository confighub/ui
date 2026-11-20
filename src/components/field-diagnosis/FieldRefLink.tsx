// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
//
// One reference token: a real <a href> when the host resolves it, else plain text (PLAN.md R4).
// A plain left click with an in-place jump runs the jump; any other click (cmd, middle, shift) is
// the browser's, so it opens a new tab (docs/dev/links.md).
import { type MouseEvent, useContext } from 'react';
import Box from '@mui/material/Box';
import Link from '@mui/material/Link';

import { FieldRefPeek } from './FieldRefPeek';
import type { FieldRef } from './fieldDiagnosis.types';
import { FieldLinkResolverContext } from './fieldLinks';

const isPlainClick = (e: MouseEvent) => e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey;

export interface FieldRefLinkProps {
  refValue: FieldRef;
  testId?: string;
  /** Link colour: `primary` for references, `inherit` for a token inside text (a value, a time). */
  color?: 'primary' | 'inherit';
  mono?: boolean;
}

export function FieldRefLink({ refValue, testId, color = 'primary', mono }: FieldRefLinkProps) {
  const resolve = useContext(FieldLinkResolverContext);
  const target = resolve(refValue);
  const sx = mono ? { fontFamily: 'var(--font-mono)' } : undefined;
  if (!target.href) {
    return (
      <FieldRefPeek refValue={refValue}>
        <Box component="span" data-testid={testId} sx={sx}>
          {refValue.label}
        </Box>
      </FieldRefPeek>
    );
  }
  const { jump } = target;
  return (
    <FieldRefPeek refValue={refValue} note={target.note}>
      <Link
        href={target.href}
        underline="hover"
        color={color}
        data-testid={testId}
        sx={sx}
        {...(target.newTab ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
        onClick={
          jump
            ? (e: MouseEvent) => {
                if (!isPlainClick(e)) return;
                e.preventDefault();
                jump();
              }
            : undefined
        }
      >
        {refValue.label}
      </Link>
    </FieldRefPeek>
  );
}
